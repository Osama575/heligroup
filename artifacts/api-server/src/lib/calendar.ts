import { DateTime, Interval } from "luxon";
import Holidays from "date-holidays";

const UK_ZONE = "Europe/London";
const BUSINESS_START_HOUR = 9;
const BUSINESS_END_HOUR = 17;
const SLOT_GRID_MINUTES = 30;

// @ts-ignore — date-holidays types are loose
const ukHolidays = new Holidays("GB", "ENG");

const FAKE_BUSY_BY_WEEKDAY: Record<number, { start: string; end: string }[]> = {
  1: [{ start: "09:00", end: "10:30" }, { start: "14:00", end: "15:00" }],
  2: [{ start: "11:00", end: "12:00" }],
  3: [{ start: "15:00", end: "17:00" }],
  4: [{ start: "12:30", end: "13:30" }, { start: "16:00", end: "17:00" }],
  5: [{ start: "13:00", end: "15:00" }],
};

function fakeBusyIntervals({ now, windowDays }: { now: DateTime; windowDays: number }): Interval[] {
  const intervals: Interval[] = [];
  let cursor = now.setZone(UK_ZONE).startOf("day");
  const end = cursor.plus({ days: windowDays + 1 });
  while (cursor < end) {
    const blocks = FAKE_BUSY_BY_WEEKDAY[cursor.weekday] ?? [];
    for (const b of blocks) {
      const [sh, sm] = b.start.split(":").map(Number);
      const [eh, em] = b.end.split(":").map(Number);
      const startDt = cursor.set({ hour: sh, minute: sm });
      const endDt = cursor.set({ hour: eh, minute: em });
      intervals.push(Interval.fromDateTimes(startDt, endDt));
    }
    cursor = cursor.plus({ days: 1 });
  }
  return intervals;
}

function isUkBusinessDay(dt: DateTime): boolean {
  const weekday = dt.weekday;
  if (weekday === 6 || weekday === 7) return false;
  // @ts-ignore
  return !ukHolidays.isHoliday(dt.startOf("day").toJSDate());
}

function generateCandidateSlots({
  now,
  windowDays,
  durationMinutes,
}: {
  now: DateTime;
  windowDays: number;
  durationMinutes: number;
}): { start: DateTime; end: DateTime }[] {
  const slots: { start: DateTime; end: DateTime }[] = [];
  const startOfSearch = now.setZone(UK_ZONE);
  const endOfSearch = startOfSearch.plus({ days: windowDays });

  let cursor = startOfSearch.startOf("day");
  while (cursor < endOfSearch) {
    if (isUkBusinessDay(cursor)) {
      const dayStart = cursor.set({ hour: BUSINESS_START_HOUR, minute: 0, second: 0, millisecond: 0 });
      const dayEnd = cursor.set({ hour: BUSINESS_END_HOUR, minute: 0, second: 0, millisecond: 0 });
      let stepStart = dayStart;
      while (stepStart.plus({ minutes: durationMinutes }) <= dayEnd) {
        const stepEnd = stepStart.plus({ minutes: durationMinutes });
        if (stepStart > now) slots.push({ start: stepStart, end: stepEnd });
        stepStart = stepStart.plus({ minutes: SLOT_GRID_MINUTES });
      }
    }
    cursor = cursor.plus({ days: 1 });
  }
  return slots;
}

function overlapsBusy(slot: { start: DateTime; end: DateTime }, busyIntervals: Interval[]): boolean {
  const slotInterval = Interval.fromDateTimes(slot.start, slot.end);
  return busyIntervals.some((b) => slotInterval.overlaps(b));
}

function formatLabel(slot: { start: DateTime; end: DateTime }, visitorZone: string): string {
  const local = slot.start.setZone(visitorZone);
  const uk = slot.start.setZone(UK_ZONE);
  const dayName = local.toFormat("cccc d LLLL");
  const localTime = local.toFormat("HH:mm");
  const ukTime = uk.toFormat("HH:mm");
  const localCity = (visitorZone.split("/").pop() || visitorZone).replace(/_/g, " ");
  if (visitorZone === UK_ZONE) {
    return `${dayName}, ${localTime} (UK)`;
  }
  return `${dayName}, ${localTime} (${localCity}) / ${ukTime} (UK)`;
}

export interface CalendarSlot {
  start_utc: string;
  end_utc: string;
  start_local: string;
  label: string;
}

export async function getAvailability(args: {
  calendarId?: string;
  durationMinutes: number;
  windowDays?: number;
  visitorTimezone: string;
  maxSlots?: number;
}): Promise<CalendarSlot[]> {
  const { durationMinutes, windowDays = 7, visitorTimezone, maxSlots = 5 } = args;

  const now = DateTime.now().setZone(UK_ZONE);
  const visitorZone =
    visitorTimezone && DateTime.now().setZone(visitorTimezone).isValid ? visitorTimezone : UK_ZONE;

  const busyIntervals = fakeBusyIntervals({ now, windowDays });
  const candidates = generateCandidateSlots({ now, windowDays, durationMinutes });
  const free = candidates.filter((s) => !overlapsBusy(s, busyIntervals));

  const slotsByDay = new Map<string, typeof free>();
  for (const s of free) {
    const key = s.start.setZone(UK_ZONE).toISODate()!;
    if (!slotsByDay.has(key)) slotsByDay.set(key, []);
    slotsByDay.get(key)!.push(s);
  }
  const spread: typeof free = [];
  let added: boolean;
  do {
    added = false;
    for (const [, daySlots] of slotsByDay) {
      if (spread.length >= maxSlots) break;
      const next = daySlots.shift();
      if (next) {
        spread.push(next);
        added = true;
      }
    }
  } while (added && spread.length < maxSlots);

  return spread.map((s) => ({
    start_utc: s.start.toUTC().toISO()!,
    end_utc: s.end.toUTC().toISO()!,
    start_local: s.start.setZone(visitorZone).toISO()!,
    label: formatLabel(s, visitorZone),
  }));
}

export async function createEvent(args: {
  calendarId: string;
  startUtc: string;
  endUtc: string;
  summary: string;
  description?: string;
  attendeeEmail: string;
  attendeeName?: string | null;
}): Promise<{ eventId: string; htmlLink: string; meetLink: string }> {
  const { calendarId, startUtc, endUtc, attendeeEmail, summary } = args;
  const eventId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const meetCode =
    Math.random().toString(36).slice(2, 5) +
    "-" +
    Math.random().toString(36).slice(2, 6) +
    "-" +
    Math.random().toString(36).slice(2, 5);
  console.log(`[mock-calendar] booked ${calendarId} ${startUtc} → ${endUtc} for ${attendeeEmail}: ${summary}`);
  return {
    eventId,
    htmlLink: `https://calendar.google.com/calendar/event?eid=${eventId}`,
    meetLink: `https://meet.google.com/${meetCode}`,
  };
}
