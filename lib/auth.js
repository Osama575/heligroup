// Minimal, dependency-free admin auth: a signed (HMAC-SHA256) stateless session
// cookie plus stateless double-submit CSRF. No session store, no JWT library.
//
// Env:
//   ADMIN_PASSWORD  - the admin login password (defaults to a dev value + warning)
//   ADMIN_SECRET    - HMAC secret for signing cookies (defaults derived; set in prod)

import crypto from "crypto";

const COOKIE = "hg_admin";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const IS_DEV = process.env.NODE_ENV === "development";

// In production a missing ADMIN_PASSWORD must NOT fall back to a guessable
// default (the repo is public) and must NOT crash the whole site at boot —
// login is simply disabled until the env var is set. The dev default only
// applies with NODE_ENV=development.
const PASSWORD = process.env.ADMIN_PASSWORD || (IS_DEV ? "heligroup-admin" : null);
export const authConfigured = Boolean(PASSWORD);
if (!process.env.ADMIN_PASSWORD) {
  if (IS_DEV) console.warn('\n  [auth] ADMIN_PASSWORD not set — using dev default "heligroup-admin". Set ADMIN_PASSWORD before deploying.\n');
  else console.warn("\n  [auth] ADMIN_PASSWORD not set — /admin login is DISABLED until you set it. The public site runs normally.\n");
}

// The signing key is INDEPENDENT of the password — never derive the MAC key from
// the credential. A random per-process fallback keeps things secure but resets
// sessions on restart; set ADMIN_SECRET so admin logins survive restarts.
const SECRET = process.env.ADMIN_SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.ADMIN_SECRET) {
  console.warn("  [auth] ADMIN_SECRET not set — using a random per-process key (admin sessions reset on restart).\n");
}

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const fromB64url = (s) => Buffer.from(s, "base64url");

function hmac(data) {
  return crypto.createHmac("sha256", SECRET).update(data).digest();
}

// Constant-time string compare that never throws on length mismatch.
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function verifyPassword(input) {
  if (!authConfigured) return false; // login disabled until ADMIN_PASSWORD is set
  return safeEqual(input ?? "", PASSWORD);
}

// ---- Session token: base64url(payload).base64url(sig) ----

function signSession(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(hmac(body));
  return `${body}.${sig}`;
}

function verifySession(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = b64url(hmac(body));
  if (!safeEqual(sig, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(fromB64url(body).toString("utf8"));
  } catch {
    return null;
  }
  if (!payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

// Issue a fresh session with a random CSRF secret baked in.
export function issueSessionCookie(req, res) {
  const payload = { exp: Date.now() + MAX_AGE_MS, csrf: crypto.randomBytes(18).toString("base64url") };
  res.cookie(COOKIE, signSession(payload), {
    httpOnly: true,
    sameSite: "lax",
    // Secure iff the request itself arrived over TLS (trust proxy honours
    // X-Forwarded-Proto). Keyed to the request, not NODE_ENV, so local http
    // logins keep working while proxied https deployments get a Secure cookie.
    secure: Boolean(req?.secure),
    maxAge: MAX_AGE_MS,
    path: "/",
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { path: "/" });
}

// Reads + verifies the session from the request. Returns payload or null.
export function getSession(req) {
  return verifySession(req.cookies?.[COOKIE]);
}

// The CSRF token handed to forms is an HMAC of the session's csrf secret, so it
// is only valid for an authenticated session and can't be forged cross-site.
export function csrfToken(session) {
  if (!session?.csrf) return "";
  return b64url(hmac("csrf:" + session.csrf));
}

export function verifyCsrf(session, token) {
  if (!session?.csrf) return false;
  return safeEqual(token ?? "", csrfToken(session));
}

// Middleware: requires a valid session. For page GETs, redirect to the login
// screen; for API/POSTs, respond 401 JSON.
export function requireAuth(req, res, next) {
  const session = getSession(req);
  if (!session) {
    if (req.method === "GET") return res.redirect("/admin");
    return res.status(401).json({ error: "not authenticated" });
  }
  req.session = session;
  next();
}
