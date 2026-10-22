"use client";

// 24-hour time picker (hour + minutes as two native selects). Always reads
// « 18:00 », never « 6:00 PM », whatever the browser locale. Value in and out
// is "HH:MM", or "" when `optional` and no hour is chosen.

import { cn } from "@/lib/utils";
import { joinTime, splitTime, timeOptions } from "@/lib/time-24h";

export function TimeSelect24h({
  id,
  value,
  onChange,
  label,
  optional = false,
  fromHour = 7,
  toHour = 21,
  minuteStep = 15,
  className,
  selectClassName,
}: {
  /** Put on the hour select so a visible <label htmlFor> points to it. */
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Spoken name, e.g. « Avant » gives « Avant, heure » and « Avant, minutes ». */
  label: string;
  optional?: boolean;
  fromHour?: number;
  toHour?: number;
  minuteStep?: number;
  className?: string;
  selectClassName?: string;
}) {
  const { hour, minute } = splitTime(value);
  const { hours, minutes } = timeOptions(value, { fromHour, toHour, minuteStep });
  const select = cn(
    "h-11 cursor-pointer rounded-xl border border-[#E2D8CC] bg-white px-2.5 text-base tabular-nums text-[#1F1A16] outline-none focus-visible:ring-2 focus-visible:ring-[#C96A2E] disabled:cursor-not-allowed disabled:opacity-60",
    selectClassName,
  );

  return (
    <span role="group" aria-label={label} className={cn("inline-flex items-center gap-1", className)}>
      <select
        id={id}
        aria-label={`${label}, heure`}
        value={hour}
        onChange={(event) => onChange(joinTime(event.target.value, minute))}
        className={select}
      >
        {(optional || !hour) && <option value="">{optional ? "--" : "Heure"}</option>}
        {hours.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span aria-hidden="true" className="font-bold text-[#6B625B]">:</span>
      <select
        aria-label={`${label}, minutes`}
        value={hour ? minute : ""}
        disabled={!hour}
        onChange={(event) => onChange(joinTime(hour, event.target.value))}
        className={select}
      >
        {!hour && <option value="">--</option>}
        {minutes.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </span>
  );
}
