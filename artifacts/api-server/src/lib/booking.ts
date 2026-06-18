import { createEvent } from "./calendar.js";
import { sendEmail, isEmailConfigured } from "./email.js";
import { dispatchAog } from "./aog.js";
import { appendLead } from "./leads.js";

type BookingType = "MAINTENANCE" | "TRAINING" | "PPI" | "CAMO" | "AOG";

const TYPE_TO_INBOX: Record<BookingType, () => string> = {
  MAINTENANCE: () => process.env["HELI145_INBOX"] || "info@heli145.com",
  TRAINING: () => process.env["HELI147_INBOX"] || "info@heli147.com",
  PPI: () => process.env["HELI145_INBOX"] || "info@heli145.com",
  CAMO: () => process.env["HELI145_INBOX"] || "info@heli145.com",
  AOG: () => process.env["HELI145_INBOX"] || "info@heli145.com",
};

function fmt(v: unknown, fallback = "—"): string {
  if (v === undefined || v === null || v === "") return fallback;
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

function fullName(visitor: Record<string, unknown>): string | null {
  const parts = [visitor["first_name"], visitor["last_name"]].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

function renderEventDescription(payload: Record<string, unknown>): string {
  const type = payload["type"] as string;
  const priority = payload["priority"] as string;
  const visitor = (payload["visitor"] as Record<string, unknown>) ?? {};
  const aircraft = (payload["aircraft"] as Record<string, unknown>) ?? {};
  const enquiry = (payload["enquiry"] as Record<string, unknown>) ?? {};

  const approvalNote =
    aircraft["on_approval_list"] === false
      ? "NOT on current approval list — review needed"
      : aircraft["on_approval_list"] === true
        ? "on approval list"
        : "approval status unconfirmed";

  return [
    "=== THEHELIGROUP ENQUIRY ===",
    enquiry["summary_line"] ?? "(no summary)",
    "",
    `PRIORITY: ${fmt(priority)}`,
    `TYPE:     ${fmt(type)}`,
    "",
    "— VISITOR —",
    `Name:           ${fmt(fullName(visitor))}`,
    `Company:        ${fmt(visitor["company"])}`,
    `Country:        ${fmt(visitor["country"])} (${fmt(visitor["timezone"])})`,
    `Email:          ${fmt(visitor["email"])}`,
    `Phone:          ${fmt(visitor["phone"])}`,
    `Decision maker: ${fmt(visitor["decision_maker"])}`,
    "",
    "— AIRCRAFT —",
    `Type:           ${fmt(aircraft["type"])}  (${approvalNote})`,
    `Registration:   ${fmt(aircraft["registration"])}`,
    `Hours / cycles: ${fmt(aircraft["hours"])} / ${fmt(aircraft["cycles"])}`,
    `Location:       ${fmt(aircraft["location"])}`,
    "",
    "— ASK —",
    fmt(enquiry["specific_ask"]),
    `Timeline:       ${fmt(enquiry["timeline"])}`,
    "",
    "— FULL DETAIL —",
    fmt(enquiry["details"]),
    "",
    "— LOGGED —",
    `${new Date().toISOString()} via web chat`,
  ].join("\n");
}

export async function createBooking(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const type = payload["type"] as BookingType;
  const slot = payload["slot"] as Record<string, string> | null | undefined;
  const visitor = (payload["visitor"] as Record<string, unknown>) ?? {};
  const enquiry = (payload["enquiry"] as Record<string, unknown>) ?? {};

  if (type === "AOG") {
    const dispatch = await dispatchAog({
      summaryLine: enquiry["summary_line"] as string,
      visitor,
      aircraft: payload["aircraft"] as Record<string, unknown>,
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
  const summary =
    (enquiry["summary_line"] as string) ||
    `${type} enquiry — ${fullName(visitor) ?? "visitor"}`;
  const inbox = TYPE_TO_INBOX[type]?.() ?? "info@heli145.com";

  if (!slot || !slot["start_utc"] || !slot["end_utc"] || !slot["calendar_id"]) {
    let emailWarning: string | null = null;
    if (isEmailConfigured()) {
      try {
        await sendEmail({
          to: inbox,
          subject: `[${type} — LEAD] ${summary}`,
          text: `${description}\n\n(No calendar slot booked — visitor requested follow-up by team.)`,
          replyTo: visitor["email"] as string,
        });
      } catch (err) {
        emailWarning = `email-to-inbox failed: ${(err as Error).message}`;
      }
    } else {
      emailWarning = "email-to-inbox skipped: SMTP not configured";
    }

    await appendLead({ ...payload, channel: "lead_capture" });

    return {
      ok: true,
      type,
      message: `Logged. The team will follow up with ${visitor["email"]} directly.`,
      warnings: emailWarning ? [emailWarning] : [],
    };
  }

  const event = await createEvent({
    calendarId: slot["calendar_id"],
    startUtc: slot["start_utc"],
    endUtc: slot["end_utc"],
    summary,
    description,
    attendeeEmail: visitor["email"] as string,
    attendeeName: fullName(visitor),
  });

  let emailWarning: string | null = null;
  if (isEmailConfigured()) {
    try {
      await sendEmail({
        to: inbox,
        subject: `[${type}] ${summary}`,
        text: `${description}\n\nCalendar event: ${event.htmlLink}\nMeet link:      ${event.meetLink ?? "(no Meet link)"}`,
        replyTo: visitor["email"] as string,
      });
    } catch (err) {
      emailWarning = `email-to-inbox failed: ${(err as Error).message}`;
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
    message: `Booked. Google Calendar invite sent to ${visitor["email"]}.`,
    event_link: event.htmlLink,
    meet_link: event.meetLink,
    warnings: emailWarning ? [emailWarning] : [],
  };
}
