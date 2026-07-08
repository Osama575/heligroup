// THEHELIGROUP — Express server.
//
// Serves the server-rendered marketing site (EJS + file-based CMS content),
// the /admin CMS, the Claude-powered /api/chat, and a visit notifier.
//
// Setup:
//   1. cp .env.example .env  (ANTHROPIC_API_KEY for chat, ADMIN_PASSWORD for the CMS)
//   2. npm install
//   3. npm start   →   http://localhost:3000   (CMS at /admin)

import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import multer from "multer";
import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { fileURLToPath } from "url";
import path from "path";
import { mkdirSync } from "fs";

import { SYSTEM_PROMPT } from "./business-context.js";
import { TOOLS, dispatchTool } from "./lib/tools.js";
import { loadContent, saveContent } from "./lib/content.js";
import {
  verifyPassword, issueSessionCookie, clearSessionCookie,
  getSession, requireAuth, csrfToken, verifyCsrf,
} from "./lib/auth.js";
import { notifyVisit } from "./lib/visit-email.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const MAX_TOOL_TURNS = 6;

// Chat is optional — the site + CMS run without an API key (chat just returns an error).
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;
if (!anthropic) console.warn("  [chat] ANTHROPIC_API_KEY not set — /api/chat disabled, rest of site runs.");

const app = express();
app.set("trust proxy", true);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "512kb" }));
app.use(cookieParser());
app.use((_req, res, next) => { res.setHeader("X-Content-Type-Options", "nosniff"); next(); });
app.use(express.static(path.join(__dirname, "public"), { index: false }));

// ---------- Uploads (admin only) ----------
const UPLOAD_DIR = path.join(__dirname, "public", "img", "uploads");
mkdirSync(UPLOAD_DIR, { recursive: true });
const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "image/avif": ".avif" };
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    // Server-generated name from mimetype only — never trust the client filename.
    filename: (_req, file, cb) => cb(null, crypto.randomUUID() + (EXT[file.mimetype] || "")),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, Boolean(EXT[file.mimetype])), // raster only; no SVG
});

// ---------- Page routes ----------
const PAGES = { "/": "home", "/services": "services", "/training": "training", "/fleet": "fleet", "/contact": "contact" };
for (const [route, view] of Object.entries(PAGES)) {
  app.get(route, (_req, res) => res.render(`pages/${view}`, { content: loadContent() }));
}

// ---------- Visit notifier ----------
app.post("/api/visit", (req, res) => {
  try {
    const { path: pagePath, ref } = req.body ?? {};
    notifyVisit({
      ownerEmail: loadContent().site.ownerEmail,
      ip: req.ip,
      ua: req.get("user-agent"),
      path: typeof pagePath === "string" ? pagePath.slice(0, 200) : "/",
      referrer: typeof ref === "string" ? ref.slice(0, 300) : "",
      host: req.get("host"),
    });
  } catch (err) {
    console.error("[visit] handler error:", err.message);
  }
  res.status(204).end();
});

// ---------- Admin / CMS ----------
app.get("/admin", (req, res) => {
  const session = getSession(req);
  if (!session) return res.render("admin/login", { error: req.query.error === "1" });
  res.render("admin/editor", {
    content: loadContent(),
    csrf: csrfToken(session),
    saved: req.query.saved === "1",
    err: req.query.err || null,
  });
});

// Simple in-memory login throttle (per IP) to blunt online brute force.
const loginHits = new Map();
function loginBlocked(ip) {
  const now = Date.now();
  const WINDOW = 15 * 60 * 1000, MAX = 10;
  const rec = loginHits.get(ip) || { count: 0, first: now };
  if (now - rec.first > WINDOW) { rec.count = 0; rec.first = now; }
  rec.count += 1;
  loginHits.set(ip, rec);
  if (loginHits.size > 5000) loginHits.clear();
  return rec.count > MAX;
}

app.post("/admin/login", (req, res) => {
  if (loginBlocked(req.ip)) return res.status(429).send("Too many attempts. Wait a few minutes and try again.");
  if (!verifyPassword(req.body?.password)) return res.redirect("/admin?error=1");
  loginHits.delete(req.ip);
  issueSessionCookie(req, res);
  res.redirect("/admin");
});

app.post("/admin/logout", requireAuth, (req, res) => {
  if (!verifyCsrf(req.session, req.body?._csrf)) return res.status(403).send("bad csrf");
  clearSessionCookie(res);
  res.redirect("/admin");
});

// Deep-merge edits over current content: objects merge, arrays & scalars replace.
// Arrays replace wholesale (not element-merge) so removing an item or un-checking
// a checkbox — which simply drops the field from the submitted form — actually sticks.
function applyEdits(cur, inc) {
  if (Array.isArray(inc)) return inc.map((v) => (v && typeof v === "object" ? applyEdits({}, v) : v));
  if (inc && typeof inc === "object") {
    const out = { ...(cur && typeof cur === "object" && !Array.isArray(cur) ? cur : {}) };
    for (const k of Object.keys(inc)) out[k] = applyEdits(cur ? cur[k] : undefined, inc[k]);
    return out;
  }
  return inc;
}

// Path branch forbids a second leading slash/backslash so a protocol-relative
// "//evil.com" can't masquerade as a same-origin path.
const SAFE_IMG = /^(\/(?![\/\\])[A-Za-z0-9._\-\/%]*|https?:\/\/[A-Za-z0-9._\-\/%?=&:]+)$/;
const SAFE_HREF = /^(\/(?![\/\\])[A-Za-z0-9._\-\/#?=&%]*|#[A-Za-z0-9\-_]*|mailto:[^\s"'<>]+|https?:\/\/[^\s"'<>]+)$/;

// Field paths that must render as arrays. qs collapses >20 indexed inputs into a
// numeric-keyed object — coerce those back. And when a full form omits an array
// entirely (every row removed), treat it as an explicit empty rather than "untouched".
const ARRAY_PATHS = [
  "site.address", "home.marks", "home.about.body", "home.about.figures",
  "home.why.items", "home.trustedMarks", "services.related", "training.points",
  "fleet.types", "contact.rows", "nav",
];
const getP = (o, p) => p.split(".").reduce((x, k) => (x == null ? x : x[k]), o);
const setP = (o, p, v) => {
  const ks = p.split(".");
  let x = o;
  for (let i = 0; i < ks.length - 1; i++) { x[ks[i]] = x[ks[i]] || {}; x = x[ks[i]]; }
  x[ks[ks.length - 1]] = v;
};
function normalizeArrays(incoming, isFull) {
  for (const p of ARRAY_PATHS) {
    const v = getP(incoming, p);
    if (v == null) { if (isFull) setP(incoming, p, []); }
    else if (!Array.isArray(v) && typeof v === "object") {
      setP(incoming, p, Object.keys(v).sort((a, b) => Number(a) - Number(b)).map((k) => v[k]));
    }
  }
}

// Walk the content and neutralise anything that could break out of an attribute /
// CSS url() context. Owner-authored, but defence in depth against injection.
function sanitize(node) {
  if (Array.isArray(node)) return node.map(sanitize);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === "string") {
        if (k === "image") out[k] = SAFE_IMG.test(v) ? v : "";
        else if (k === "href" || k === "secondaryCtaHref") out[k] = SAFE_HREF.test(v) ? v : "#";
        else out[k] = v;
      } else out[k] = sanitize(v);
    }
    return out;
  }
  return node;
}

app.post("/admin/save", requireAuth, (req, res) => {
  if (!verifyCsrf(req.session, req.body?._csrf)) return res.status(403).send("bad csrf");
  try {
    const incoming = { ...req.body };
    const isFull = incoming._full === "1";
    delete incoming._csrf;
    delete incoming._full;
    normalizeArrays(incoming, isFull);
    let merged = applyEdits(loadContent(), incoming);
    // Normalise fleet featured flags (unchecked checkboxes don't submit).
    if (Array.isArray(merged?.fleet?.types)) {
      merged.fleet.types = merged.fleet.types.map((t) => ({ ...t, featured: t.featured === true || t.featured === "true" || t.featured === "on" }));
    }
    merged = sanitize(merged);
    saveContent(merged);
    res.redirect("/admin?saved=1");
  } catch (err) {
    console.error("[admin] save failed:", err.message);
    res.redirect("/admin?err=" + encodeURIComponent(err.message));
  }
});

app.post(
  "/admin/upload",
  requireAuth,
  (req, res, next) => {
    // CSRF via header so a forged request is rejected before any file is written.
    if (!verifyCsrf(req.session, req.get("x-csrf-token"))) return res.status(403).json({ error: "bad csrf" });
    next();
  },
  upload.single("image"),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: "no image (jpg, png, webp, gif or avif, max 5MB)" });
    res.json({ url: "/img/uploads/" + req.file.filename });
  }
);

// ---------- Chat (unchanged behaviour) ----------
function clientToApiMessage(m) {
  return {
    role: m.role === "assistant" ? "assistant" : "user",
    content: [{ type: "text", text: String(m.content ?? "").slice(0, 4000) }],
  };
}

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  if (!anthropic) {
    send("error", { message: "Chat isn't configured on this server. Email info@heli145.com and we'll come back to you." });
    return res.end();
  }

  const apiMessages = messages.slice(-20).map(clientToApiMessage);

  try {
    let turn = 0;
    while (turn < MAX_TOOL_TURNS) {
      turn += 1;
      const stream = anthropic.messages.stream({
        model: MODEL,
        max_tokens: 1024,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        messages: apiMessages,
      });
      stream.on("text", (delta) => send("delta", { text: delta }));
      const finalMsg = await stream.finalMessage();
      if (finalMsg.stop_reason !== "tool_use") break;

      apiMessages.push({ role: "assistant", content: finalMsg.content });
      const toolUses = finalMsg.content.filter((b) => b.type === "tool_use");
      send("status", { type: "tool_use", names: toolUses.map((t) => t.name) });

      const toolResults = [];
      for (const tu of toolUses) {
        const result = await dispatchTool(tu);
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(result),
          ...(result?.error ? { is_error: true } : {}),
        });
      }
      apiMessages.push({ role: "user", content: toolResults });
    }
    send("done", {});
    res.end();
  } catch (err) {
    console.error("chat error:", err);
    send("error", { message: "Sorry, something went wrong on our side." });
    res.end();
  }
});

app.get("/healthz", (_req, res) => res.json({ ok: true, model: MODEL }));

// ---------- 404 ----------
app.use((req, res) => {
  res.status(404).type("html").send(
    `<!doctype html><meta charset="utf-8"><title>Not found</title>` +
    `<div style="font-family:system-ui;min-height:100vh;display:grid;place-items:center;background:#0a0f1a;color:#e8edf6;text-align:center">` +
    `<div><p style="font-size:3rem;margin:0;font-weight:800">404</p><p>That page doesn't exist. <a style="color:#e8423f" href="/">Back to home</a></p></div></div>`
  );
});

app.listen(PORT, () => {
  console.log(`\n  THEHELIGROUP running at http://localhost:${PORT}`);
  console.log(`  CMS:   http://localhost:${PORT}/admin`);
  console.log(`  Model: ${MODEL}${anthropic ? "" : " (chat disabled)"}\n`);
});
