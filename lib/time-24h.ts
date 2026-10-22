// 24-hour "HH:MM" helpers for the admin time pickers. A native
// <input type="time"> follows the browser locale (« 12:30 PM » on a US
// English browser) while Roogo is French, so admin forms use two selects
// (hour, minutes) that always read 24 h. The stored value stays "HH:MM".

const TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

export function splitTime(value: string | null | undefined): { hour: string; minute: string } {
  const match = TIME.exec((value ?? "").trim());
  if (!match) return { hour: "", minute: "" };
  return { hour: match[1], minute: match[2] };
}

export function joinTime(hour: string, minute: string): string {
  if (!hour) return "";
  return `${hour}:${minute || "00"}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Hour and minute options for a picker. The current value is always offered,
 * even outside the range or off the step, so an existing time is never lost.
 */
export function timeOptions(
  value: string | null | undefined,
  { fromHour = 7, toHour = 21, minuteStep = 15 }: { fromHour?: number; toHour?: number; minuteStep?: number } = {},
): { hours: string[]; minutes: string[] } {
  const hours = new Set<string>();
  for (let h = fromHour; h <= toHour; h += 1) hours.add(pad(h));
  const minutes = new Set<string>();
  for (let m = 0; m < 60; m += minuteStep) minutes.add(pad(m));
  const { hour, minute } = splitTime(value);
  if (hour) hours.add(hour);
  if (minute) minutes.add(minute);
  return { hours: [...hours].sort(), minutes: [...minutes].sort() };
}
