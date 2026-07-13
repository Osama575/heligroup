// Fire-and-forget "someone visited the site" notification to the owner.
//
// The user asked for an email on every visit. We honour that, with three
// pragmatic guards that don't change the intent:
//   1. Non-blocking — never awaited in the request path, so it can't slow a page.
//   2. Triggered by a client beacon, so non-JS crawlers don't fire it.
//   3. A configurable per-IP throttle (default 0 = truly every visit) and an
//      optional bot-UA skip, so a flood can be dialled back without code changes.
//
// Env:
//   OWNER_EMAIL                  - where notifications go (falls back to content.site.ownerEmail)
//   VISIT_EMAILS_ENABLED         - "false" to turn off entirely (default on)
//   VISIT_EMAIL_MIN_INTERVAL_MS  - min ms between emails per IP (default 0)
//   VISIT_EMAILS_SKIP_BOTS       - "false" to email bots too (default: skip bots)

import { sendEmail } from "./email.js";

const ENABLED = process.env.VISIT_EMAILS_ENABLED !== "false";
const MIN_INTERVAL = Number(process.env.VISIT_EMAIL_MIN_INTERVAL_MS || 0);
const SKIP_BOTS = process.env.VISIT_EMAILS_SKIP_BOTS !== "false";

const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|monitor|curl|wget|python-requests/i;

// Per-IP last-sent timestamps. Bounded so it can't grow unbounded in memory.
const lastSent = new Map();
const MAX_TRACKED = 5000;

function throttled(ip) {
  if (MIN_INTERVAL <= 0) return false;
  const now = Date.now();
  const prev = lastSent.get(ip) || 0;
  if (now - prev < MIN_INTERVAL) return true;
  if (lastSent.size > MAX_TRACKED) lastSent.clear();
  lastSent.set(ip, now);
  return false;
}

// Hard ceiling across all visitors so an abusive flood of /api/visit can't drain
// the owner's mailbox, independent of the per-IP throttle.
const GLOBAL_MAX_PER_MIN = Number(process.env.VISIT_EMAIL_GLOBAL_MAX || 60);
let winStart = 0, winCount = 0;
function globalCapped() {
  const now = Date.now();
  if (now - winStart > 60000) { winStart = now; winCount = 0; }
  winCount += 1;
  return winCount > GLOBAL_MAX_PER_MIN;
}

// Strip CR/LF/tabs and cap length — /api/visit is public and its fields land in an
// email, so this prevents header injection and runaway content.
const clean = (s, max) => String(s == null ? "" : s).replace(/[\r\n\t]+/g, " ").slice(0, max);

export function notifyVisit({ ownerEmail, ip, ua, path: pagePath, referrer, host }) {
  if (!ENABLED) return;
  if (SKIP_BOTS && ua && BOT_RE.test(ua)) return;

  const to = process.env.OWNER_EMAIL || ownerEmail;
  if (!to) return;
  if (throttled(ip || "unknown")) return;
  if (globalCapped()) return;

  const p = clean(pagePath || "/", 200);
  const ref = clean(referrer, 300);
  const agent = clean(ua, 300);
  const h = clean(host, 120);
  const when = new Date().toISOString();
  const subject = `New visit: ${p} on ${h || "site"}`;
  const text = [
    `Someone just visited the website.`,
    ``,
    `Page:      ${p}`,
    `Referrer:  ${ref || "(direct)"}`,
    `IP:        ${clean(ip, 60) || "unknown"}`,
    `Browser:   ${agent || "unknown"}`,
    `Time:      ${when}`,
  ].join("\n");

  // Fire-and-forget: swallow errors so a mail failure never surfaces to the visitor.
  Promise.resolve()
    .then(() => sendEmail({ to, subject, text }))
    .catch((err) => console.error("[visit-email] send failed:", err.message));
}
