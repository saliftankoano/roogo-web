"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { fr } from "date-fns/locale";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { formatDateISO } from "@/lib/visites-3d";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

type Props = {
  selected: string | null;
  onSelect: (iso: string) => void;
  fullyBooked: Set<string>; // ISO dates where all slots are taken
  minDate?: Date;
  maxDate?: Date;
};

export function Calendar({
  selected,
  onSelect,
  fullyBooked,
  minDate,
  maxDate,
}: Props) {
  const reduce = useReducedMotion();
  const today = startOfDay(new Date());
  const [cursor, setCursor] = useState<Date>(startOfMonth(today));

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    const out: Date[] = [];
    let d = gridStart;
    while (!isAfter(d, gridEnd)) {
      out.push(d);
      d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
    }
    return out;
  }, [cursor]);

  const floor = minDate ?? today;
  const ceil = maxDate ?? addMonths(today, 3);

  const canGoBack = !isSameMonth(cursor, floor) && isAfter(cursor, floor);
  const canGoForward = isBefore(cursor, startOfMonth(ceil));

  return (
    <div className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-[0_18px_40px_-24px_rgba(23,18,15,0.25)]">
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          aria-label="Mois précédent"
          onClick={() => canGoBack && setCursor(subMonths(cursor, 1))}
          disabled={!canGoBack}
          className="rounded-full p-2 transition-colors hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <CaretLeftIcon className="h-5 w-5" weight="bold" />
        </button>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={format(cursor, "yyyy-MM")}
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
            transition={{ duration: 0.18 }}
            className="text-lg font-extrabold capitalize tracking-tight text-neutral-950"
          >
            {format(cursor, "LLLL yyyy", { locale: fr })}
          </motion.div>
        </AnimatePresence>
        <button
          type="button"
          aria-label="Mois suivant"
          onClick={() => canGoForward && setCursor(addMonths(cursor, 1))}
          disabled={!canGoForward}
          className="rounded-full p-2 transition-colors hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <CaretRightIcon className="h-5 w-5" weight="bold" />
        </button>
      </div>

      <div className="mb-2 grid grid-cols-7 text-xs font-bold uppercase tracking-wider text-neutral-400">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="py-1 text-center">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const iso = formatDateISO(d);
          const isOtherMonth = !isSameMonth(d, cursor);
          const isPast = isBefore(d, today);
          const isTooFar = isAfter(d, ceil);
          const isDisabled = isPast || isTooFar;
          const isToday = isSameDay(d, today);
          const isSelected = selected === iso;
          const isFull = fullyBooked.has(iso);

          return (
            <button
              key={iso}
              type="button"
              disabled={isDisabled || isFull}
              onClick={() => onSelect(iso)}
              aria-pressed={isSelected}
              aria-label={format(d, "EEEE d MMMM yyyy", { locale: fr })}
              className={cn(
                "relative aspect-square rounded-xl text-sm font-semibold transition-all",
                "flex items-center justify-center",
                isOtherMonth && "text-neutral-300",
                !isOtherMonth &&
                  !isDisabled &&
                  !isFull &&
                  "text-neutral-900 hover:bg-primary/10",
                isDisabled && "cursor-not-allowed text-neutral-300",
                isFull &&
                  !isDisabled &&
                  "cursor-not-allowed text-neutral-400 line-through",
                isToday && !isSelected && "ring-1 ring-primary/40",
                isSelected &&
                  "bg-primary text-white shadow-md hover:bg-primary"
              )}
            >
              {isSelected && !reduce && (
                <motion.span
                  layoutId="calendar-active"
                  className="absolute inset-0 -z-10 rounded-xl bg-primary"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.35 }}
                />
              )}
              <span className="relative">{format(d, "d")}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-4 text-xs text-neutral-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary" />
          Sélectionné
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary/30 ring-1 ring-primary/40" />
          Aujourd&apos;hui
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-neutral-300" />
          Complet
        </span>
      </div>
    </div>
  );
}
