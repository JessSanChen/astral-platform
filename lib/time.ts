/**
 * Times, as the people in the room read them.
 *
 * Every time shown or typed in the app is in the event's own time zone, and
 * says so. The alternative is to use whatever zone the code happens to be
 * running in, which is the participant's browser for some pages and the
 * server for others, and the server is on UTC. That showed a 3pm deadline as
 * "8:00 PM" to participants, and read a closing time back to the organizer
 * shifted by the same five hours, so saving it again moved the deadline.
 *
 * Nothing here depends on the machine's zone or locale, so a page rendered
 * on the server and again in the browser produces the same text.
 */
export const EVENT_TIME_ZONE = "America/New_York";

/** The time zone as people say it, for labels next to a time field. */
export const EVENT_TIME_ZONE_LABEL = "Boston time";

/** "Nov 14, 3:00 PM EST" */
export function formatEventDateTime(value: Date | string) {
  return new Date(value).toLocaleString("en-US", {
    timeZone: EVENT_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** "3:00 PM EST" */
export function formatEventTime(value: Date | string) {
  return new Date(value).toLocaleTimeString("en-US", {
    timeZone: EVENT_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** The wall-clock fields of an instant, as seen in the event's zone. */
function wallClock(instant: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EVENT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * An instant as the value of a `datetime-local` field, in the event's zone.
 * Such a field carries no zone of its own, so this and the function below
 * are what give it one.
 */
export function toEventInputValue(value: Date | string) {
  const w = wallClock(new Date(value));
  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
}

/**
 * The instant meant by a `datetime-local` value typed as event time.
 *
 * Returns null for anything that is not a complete date and time.
 */
export function fromEventInputValue(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  // Read the typed fields as if they were UTC, see what the event's zone
  // calls that instant, and move by the difference. Done twice, because the
  // first correction can cross a daylight-saving change.
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  let instant = asUtc;
  for (let i = 0; i < 2; i++) {
    const w = wallClock(new Date(instant));
    const seen = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
    instant -= seen - asUtc;
  }
  return new Date(instant);
}
