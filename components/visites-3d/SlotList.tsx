"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { CheckIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { SLOTS, type Slot } from "@/lib/visites-3d";

type Props = {
  date: string | null;
  bookedSlots: Set<string>;
  selected: Slot | null;
  onSelect: (slot: Slot) => void;
};

export function SlotList({ date, bookedSlots, selected, onSelect }: Props) {
  const reduce = useReducedMotion();

  return (
    <div className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-[0_18px_40px_-24px_rgba(23,18,15,0.25)]">
      <h3 className="mb-1 text-lg font-extrabold tracking-tight text-neutral-950">
        Créneaux disponibles
      </h3>
      <p className="mb-4 text-sm text-neutral-500">
        {date
          ? "Blocs de 2 heures. Sélectionnez celui qui vous convient."
          : "Choisissez d'abord une date dans le calendrier."}
      </p>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={date ?? "empty"}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: 0.22 }}
          className="flex flex-col gap-2"
        >
          {date ? (
            SLOTS.map((slot) => {
              const isBooked = bookedSlots.has(slot);
              const isSelected = selected === slot;
              return (
                <button
                  key={slot}
                  type="button"
                  disabled={isBooked}
                  onClick={() => onSelect(slot)}
                  aria-pressed={isSelected}
                  className={cn(
                    "group flex items-center justify-between rounded-full border px-5 py-3 text-left transition-all",
                    !isBooked &&
                      !isSelected &&
                      "border-primary/40 text-neutral-900 hover:border-primary hover:bg-primary hover:text-white",
                    isSelected &&
                      "border-primary bg-primary text-white shadow-md",
                    isBooked &&
                      "cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-400 line-through"
                  )}
                >
                  <span className="font-semibold">
                    {slot.replace("-", " – ")}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs opacity-80">
                    {isSelected && (
                      <motion.span
                        initial={reduce ? false : { scale: 0 }}
                        animate={{ scale: 1 }}
                        className="inline-flex"
                      >
                        <CheckIcon className="h-3.5 w-3.5" weight="bold" />
                      </motion.span>
                    )}
                    {isBooked ? "Complet" : isSelected ? "Sélectionné" : "2 h"}
                  </span>
                </button>
              );
            })
          ) : (
            <div className="py-6 text-center text-sm text-neutral-400">
              Aucune date sélectionnée
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
