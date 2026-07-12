import { getAvailability } from "./calendar.js";
import { createBooking } from "./booking.js";

export const TOOLS = [
  {
    name: "get_calendar_availability",
    description:
      "Returns free meeting slots from a THEHELIGROUP Google Calendar within a forward-looking window. Slots are returned in both UTC and the visitor's local timezone, with a pre-formatted 'label' you can show to the visitor verbatim. Slots already exclude weekends, UK bank holidays, and out-of-hours times. Only call this once you have the visitor's timezone — pass 'Europe/London' if the visitor is in the UK.",
    input_schema: {
      type: "object",
      properties: {
        calendar_id: {
          type: "string",
          enum: ["heli145", "heli147"],
          description:
            "Which team calendar to check. heli145 for maintenance / PPI / CAMO / Tech. heli147 for training.",
        },
        duration_minutes: {
          type: "integer",
          enum: [30, 45, 60],
          description: "Meeting length. Use 30 for most, 45 for PPI discovery.",
        },
        window_days: {
          type: "integer",
          minimum: 1,
          maximum: 21,
          description:
            "How many days forward to search. Default 7. Increase if the visitor rejects all initial slots.",
        },
        visitor_timezone: {
          type: "string",
          description:
            "IANA timezone string from the visitor, e.g. 'Asia/Dubai', 'Europe/London'. If unknown, ask the visitor first; do not guess.",
        },
        max_slots: {
          type: "integer",
          description: "Max slots to return. Default 5 — propose 2–3 to the visitor.",
        },
      },
      required: ["calendar_id", "duration_minutes", "visitor_timezone"],
    },
  },
  {
    name: "create_booking",
    description:
      "Logs an enquiry and routes it to the team. Three modes:\n  1. CALENDAR booking — type≠AOG, slot=set. Creates a Google Calendar event with Meet link, emails the team inbox, logs the lead.\n  2. AOG dispatch — type='AOG', slot=null. Sends SMS/WhatsApp/email to the duty engineer, logs the lead.\n  3. LEAD capture — type≠AOG, slot=null. No calendar event. Emails the team inbox with the structured summary so they can follow up directly. Use this whenever the visitor has shared useful details but no meeting is being booked: unapproved aircraft type, visitor declined the call, or visitor wants the team to email them back.\n\nAlways prefer this tool over telling the visitor to email the team themselves — the team would rather receive a structured lead than a forwarded chat snippet.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["MAINTENANCE", "TRAINING", "PPI", "CAMO", "AOG"] },
        priority: {
          type: "string",
          enum: ["urgent", "high", "normal"],
          description:
            "urgent for AOG only. high for live deals or near-term maintenance. normal otherwise.",
        },
        visitor: {
          type: "object",
          properties: {
            first_name: { type: "string" },
            last_name: { type: "string" },
            email: { type: "string" },
            company: { type: "string" },
            country: { type: "string" },
            timezone: { type: "string" },
            phone: { type: "string", description: "Required for AOG. Optional otherwise." },
            whatsapp: { type: "string", description: "Optional. Strongly preferred for AOG." },
            decision_maker: { type: "boolean" },
          },
          required: ["first_name", "last_name", "email"],
        },
        aircraft: {
          type: "object",
          properties: {
            type: { type: "string" },
            registration: { type: "string" },
            hours: { type: "number" },
            cycles: { type: "number" },
            location: { type: "string" },
            on_approval_list: { type: "boolean" },
          },
        },
        enquiry: {
          type: "object",
          properties: {
            summary_line: {
              type: "string",
              description:
                "ONE LINE the team can read in 3 seconds. Example: 'AOG, AW169, Riyadh, owner needs engineer mobilised in 48h.' Most important field — used as the calendar event title.",
            },
            details: {
              type: "string",
              description: "Free-text detail captured from the conversation, 2–6 sentences.",
            },
            timeline: {
              type: "string",
              enum: ["AOG", "this_week", "this_month", "this_quarter", "exploring"],
            },
            specific_ask: { type: "string" },
          },
          required: ["summary_line", "details", "timeline"],
        },
        slot: {
          type: ["object", "null"],
          description: "The chosen calendar slot. Pass null for AOG.",
          properties: {
            start_utc: { type: "string" },
            end_utc: { type: "string" },
            calendar_id: { type: "string", enum: ["heli145", "heli147"] },
          },
        },
      },
      required: ["type", "priority", "visitor", "enquiry"],
    },
  },
];

const HANDLERS: Record<string, (input: Record<string, unknown>) => Promise<unknown>> = {
  get_calendar_availability: async (input) => {
    const slots = await getAvailability({
      calendarId: input["calendar_id"] as string,
      durationMinutes: input["duration_minutes"] as number,
      windowDays: (input["window_days"] as number) ?? 7,
      visitorTimezone: input["visitor_timezone"] as string,
      maxSlots: (input["max_slots"] as number) ?? 5,
    });
    return { slots };
  },
  create_booking: async (input) => createBooking(input),
};

export async function dispatchTool(toolUse: {
  name: string;
  id: string;
  input?: Record<string, unknown>;
}): Promise<unknown> {
  const handler = HANDLERS[toolUse.name];
  if (!handler) {
    return { error: `Unknown tool: ${toolUse.name}` };
  }
  try {
    return await handler(toolUse.input || {});
  } catch (err) {
    console.error(`[tool ${toolUse.name}] error:`, err);
    return { error: (err as Error).message || String(err) };
  }
}
