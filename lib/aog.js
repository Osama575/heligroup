// AOG fast-lane dispatch.
// Email is the guaranteed channel. SMS + WhatsApp via Twilio are best-effort —
// if Twilio creds are missing, we log a warning and continue rather than failing
// the whole AOG flow (the email still goes out, and the chat reply already
// surfaced the duty-engineer phone numbers to the visitor).

import twilio from "twilio";
import { sendEmail, isEmailConfigured } from "./email.js";

let _twilio = null;
function getTwilio() {
  if (_twilio) return _twilio;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  _twilio = twilio(sid, token);
  return _twilio;
}

function buildAogText({ summaryLine, visitor, aircraft, enquiry }) {
  const fullName = [visitor.first_name, visitor.last_name].filter(Boolean).join(" ") || "(unknown)";
  const lines = [
    `[AOG] ${summaryLine}`,
    `Visitor: ${fullName} <${visitor.email}>`,
    visitor.phone ? `Phone:   ${visitor.phone}` : null,
    visitor.whatsapp ? `WhatsApp:${visitor.whatsapp}` : null,
    aircraft?.type ? `Aircraft:${aircraft.type} ${aircraft.registration ?? ""}` : null,
    aircraft?.location ? `Location:${aircraft.location}` : null,
    enquiry?.details ? `\nDetail:\n${enquiry.details}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

export async function dispatchAog({ summaryLine, visitor, aircraft, enquiry }) {
  const result = { email: null, sms: null, whatsapp: null, errors: [] };

  // 1. Email — info@heli145.com with [AOG] prefix.
  if (isEmailConfigured()) {
    try {
      result.email = await sendEmail({
        to: process.env.HELI145_INBOX || "info@heli145.com",
        subject: `[AOG] ${summaryLine}`,
        text: buildAogText({ summaryLine, visitor, aircraft, enquiry }),
        replyTo: visitor.email,
      });
    } catch (err) {
      result.errors.push(`email: ${err.message}`);
    }
  } else {
    result.errors.push("email: SMTP not configured");
  }

  // 2. Twilio SMS + WhatsApp — best-effort.
  const tw = getTwilio();
  const dutyPhone = process.env.DUTY_ENGINEER_PHONE;
  const dutyWa = process.env.DUTY_ENGINEER_WHATSAPP;
  const fromSms = process.env.TWILIO_FROM_SMS;
  const fromWa = process.env.TWILIO_FROM_WHATSAPP;
  const body = buildAogText({ summaryLine, visitor, aircraft, enquiry });

  if (tw && dutyPhone && fromSms) {
    try {
      result.sms = await tw.messages.create({ from: fromSms, to: dutyPhone, body });
    } catch (err) {
      result.errors.push(`sms: ${err.message}`);
    }
  } else {
    result.errors.push("sms: Twilio or duty phone not configured");
  }

  if (tw && dutyWa && fromWa) {
    try {
      result.whatsapp = await tw.messages.create({
        from: `whatsapp:${fromWa}`,
        to: `whatsapp:${dutyWa}`,
        body,
      });
    } catch (err) {
      result.errors.push(`whatsapp: ${err.message}`);
    }
  } else {
    result.errors.push("whatsapp: Twilio or duty WhatsApp not configured");
  }

  return result;
}
