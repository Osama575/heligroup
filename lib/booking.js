// Orchestrates a confirmed booking:
//   1. Render the calendar-event description.
//   2. AOG path: dispatch alerts + log lead, return {type:"AOG", ...}.
//   3. Otherwise: create the Google Calendar event, email the team inbox in
//      parallel with the structured summary, log the lead.
//
// The `summary_line` from the model is used as the calendar event title — that's
// what Bobby reads on his phone. Don't decorate it.

import { createEvent } from "./calendar.js";
import { sendEmail, isEmailConfigured } from "./email.js";
import { dispatchAog } from "./aog.js";
import { appendLead } from "./leads.js";

const TYPE_TO_INBOX = {
  MAINTENANCE: () => process.env.HELI145_INBOX || "info@heli145.com",
  TRAINING: () => process.env.HELI147_INBOX || "info@heli147.com",
  PPI: () => process.env.HELI145_INBOX || "info@heli145.com",
  CAMO: () => process.env.HELI145_INBOX || "info@heli145.com",
  AOG: () => process.env.HELI145_INBOX || "info@heli145.com",
};

function fmt(v, fallback = "—") {
  if (v === undefined || v === null || v === "") return fallback;
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

function fullName(visitor) {
  const parts = [visitor.first_name, visitor.last_name].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

function renderEventDescription(payload) {
  const { type, priority, visitor = {}, aircraft = {}, enquiry = {} } = payload;
  const approvalNote = aircraft.on_approval_list === false
    ? "NOT on current approval list — review needed"
    : aircraft.on_approval_list === true
      ? "on approval list"
      : "approval status unconfirmed";
  return [
    "=== THEHELIGROUP ENQUIRY ===",
    enquiry.summary_line ?? "(no summary)",
    "",
    `PRIORITY: ${fmt(priority)}`,
    `TYPE:     ${fmt(type)}`,
    "",
    "— VISITOR —",
    `Name:           ${fmt(fullName(visitor))}`,
    `Company:        ${fmt(visitor.company)}`,
    `Country:        ${fmt(visitor.country)} (${fmt(visitor.timezone)})`,
    `Email:          ${fmt(visitor.email)}`,
    `Phone:          ${fmt(visitor.phone)}`,
    `Decision maker: ${fmt(visitor.decision_maker)}`,
    "",
    "— AIRCRAFT —",
    `Type:           ${fmt(aircraft.type)}  (${approvalNote})`,
    `Registration:   ${fmt(aircraft.registration)}`,
    `Hours / cycles: ${fmt(aircraft.hours)} / ${fmt(aircraft.cycles)}`,
    `Location:       ${fmt(aircraft.location)}`,
    "",
    "— ASK —",
    fmt(enquiry.specific_ask),
    `Timeline:       ${fmt(enquiry.timeline)}`,
    "",
    "— FULL DETAIL —",
    fmt(enquiry.details),
    "",
    "— LOGGED —",
    `${new Date().toISOString()} via web chat`,
  ].join("\n");
}

export async function createBooking(payload) {
  const { type, slot, visitor = {}, enquiry = {} } = payload;

  // ---- AOG path: no calendar event ------------------------------------
  if (type === "AOG") {
    const dispatch = await dispatchAog({
      summaryLine: enquiry.summary_line,
      visitor,
      aircraft: payload.aircraft,
      enquiry,
    });
    await appendLead({ ...payload, channel: "aog", dispatch_errors: dispatch.errors });
    return {
      ok: true,
      type: "AOG",
      message: "AOG alert dispatched to the duty engineer.",
      email_sent: Boolean(dispatch.email),
      sms_sent: Boolean(dispatch.sms),
      whatsapp_sent: Boolean(dispatch.whatsapp),
      warnings: dispatch.errors,
    };
  }

  const description = renderEventDescription(payload);
  const summary = enquiry.summary_line || `${type} enquiry — ${fullName(visitor) ?? "visitor"}`;
  const inbox = TYPE_TO_INBOX[type]?.() ?? "info@heli145.com";

  // ---- Lead-capture path (no slot, no calendar event) -----------------
  // Used when the visitor either (a) named an unapproved aircraft type, or
  // (b) declined to book a meeting but shared their details for a callback.
  // We email the team the structured summary and log the lead. The team
  // follows up out-of-band.
  if (!slot || !slot.start_utc || !slot.end_utc || !slot.calendar_id) {
    let emailWarning = null;
    if (isEmailConfigured()) {
      try {
        await sendEmail({
          to: inbox,
          subject: `[${type} — LEAD] ${summary}`,
          text: `${description}\n\n(No calendar slot booked — visitor requested follow-up by team.)`,
          replyTo: visitor.email,
        });
      } catch (err) {
        emailWarning = `email-to-inbox failed: ${err.message}`;
      }
    } else {
      emailWarning = "email-to-inbox skipped: SMTP not configured";
    }

    await appendLead({ ...payload, channel: "lead_capture" });

    return {
      ok: true,
      type,
      message: `Logged. The team will follow up with ${visitor.email} directly.`,
      warnings: emailWarning ? [emailWarning] : [],
    };
  }

  // ---- Standard booking path (with calendar slot) ---------------------

  const event = await createEvent({
    calendarId: slot.calendar_id,
    startUtc: slot.start_utc,
    endUtc: slot.end_utc,
    summary,
    description,
    attendeeEmail: visitor.email,
    attendeeName: fullName(visitor),
  });

  // Parallel: email the team inbox with the same structured block.
  let emailWarning = null;
  if (isEmailConfigured()) {
    try {
      await sendEmail({
        to: inbox,
        subject: `[${type}] ${summary}`,
        text: `${description}\n\nCalendar event: ${event.htmlLink}\nMeet link:      ${event.meetLink ?? "(no Meet link)"}`,
        replyTo: visitor.email,
      });
    } catch (err) {
      emailWarning = `email-to-inbox failed: ${err.message}`;
    }
  } else {
    emailWarning = "email-to-inbox skipped: SMTP not configured";
  }

  await appendLead({
    ...payload,
    channel: "calendar",
    event_id: event.eventId,
    event_link: event.htmlLink,
    meet_link: event.meetLink,
  });

  return {
    ok: true,
    type,
    message: `Booked. Google Calendar invite sent to ${visitor.email}.`,
    event_link: event.htmlLink,
    meet_link: event.meetLink,
    warnings: emailWarning ? [emailWarning] : [],
  };
}
