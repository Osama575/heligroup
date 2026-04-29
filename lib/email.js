// SMTP wrapper for booking summaries + AOG alerts.
// Lazily constructs the nodemailer transport so the app can boot without SMTP
// configured (handy in dev — sendEmail() will throw with a clear message).

import nodemailer from "nodemailer";

let _transport = null;

function getTransport() {
  if (_transport) return _transport;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP not configured — set SMTP_HOST / SMTP_USER / SMTP_PASS in .env."
    );
  }

  _transport = nodemailer.createTransport({
    host,
    port,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
    auth: { user, pass },
  });
  return _transport;
}

export async function sendEmail({ to, subject, text, replyTo }) {
  const transport = getTransport();
  const from = process.env.SMTP_FROM || "THEHELIGROUP Web Chat <chat@heli145.com>";
  return transport.sendMail({
    from,
    to,
    subject,
    text,
    ...(replyTo ? { replyTo } : {}),
  });
}

export function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}
