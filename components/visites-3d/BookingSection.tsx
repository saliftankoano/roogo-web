"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { addMonths, endOfMonth, format, startOfMonth } from "date-fns";
import { Calendar } from "@/components/visites-3d/Calendar";
import { SlotList } from "@/components/visites-3d/SlotList";
import { BookingForm } from "@/components/visites-3d/BookingForm";
import { SuccessState } from "@/components/visites-3d/SuccessState";
import { PaymentModal } from "@/components/visites-3d/PaymentModal";
import {
  computePrice,
  SLOTS,
  type Slot,
  type Visit3dBookingInput,
} from "@/lib/visites-3d";

type BookedMap = Record<string, string[]>;

export function BookingSection() {
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [booked, setBooked] = useState<BookedMap>({});
  const [success, setSuccess] = useState<{ date: string; slot: Slot } | null>(
    null
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingBooking, setPendingBooking] =
    useState<Visit3dBookingInput | null>(null);

  // The calendar's selectable ceiling must match the fetched availability
  // window exactly — dates beyond `to` would render as free regardless of
  // real bookings.
  const { range, maxDate } = useMemo(() => {
    const today = new Date();
    const ceiling = endOfMonth(addMonths(today, 2));
    return {
      maxDate: ceiling,
      range: {
        from: format(startOfMonth(today), "yyyy-MM-dd"),
        to: format(ceiling, "yyyy-MM-dd"),
      },
    };
  }, []);

  const refreshAvailability = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/visites-3d/availability?from=${range.from}&to=${range.to}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const body = (await res.json()) as { booked: BookedMap };
      setBooked(body.booked ?? {});
    } catch {
      // offline / transient — silent fail, user can still submit (server validates)
    }
  }, [range.from, range.to]);

  useEffect(() => {
    refreshAvailability();
  }, [refreshAvailability]);

  const fullyBooked = useMemo(() => {
    const set = new Set<string>();
    for (const [d, slots] of Object.entries(booked)) {
      if (slots.length >= SLOTS.length) set.add(d);
    }
    return set;
  }, [booked]);

  const bookedSlotsForDate = useMemo(
    () => new Set(date ? booked[date] ?? [] : []),
    [booked, date]
  );

  return (
    <section id="reserver" className="overflow-x-clip bg-[#f5efe6] py-24">
      <div className="mx-auto w-full max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-primary">
            Réservation
          </div>
          <h2 className="mt-5 text-3xl font-black leading-tight tracking-tight text-neutral-950 md:text-5xl">
            Choisissez votre créneau
          </h2>
          <p className="mt-5 text-base leading-8 text-neutral-600 md:text-lg">
            Blocs de 2 heures, tous les jours entre 7h et 17h. Paiement Mobile
            Money au moment de la réservation.
          </p>
        </div>

        <div className="mx-auto mt-14 max-w-5xl">
          <AnimatePresence mode="wait" initial={false}>
            {success ? (
              <motion.div
                key="success"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <SuccessState date={success.date} slot={success.slot} />
              </motion.div>
            ) : (
              <motion.div
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-6"
              >
                {notice && (
                  <motion.p
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800"
                  >
                    {notice}
                  </motion.p>
                )}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <Calendar
                    selected={date}
                    onSelect={(iso) => {
                      setDate(iso);
                      setSlot(null);
                      setNotice(null);
                    }}
                    fullyBooked={fullyBooked}
                    maxDate={maxDate}
                  />
                  <SlotList
                    date={date}
                    bookedSlots={bookedSlotsForDate}
                    selected={slot}
                    onSelect={(s) => {
                      setSlot(s);
                      setNotice(null);
                    }}
                  />
                </div>

                <AnimatePresence initial={false}>
                  {date && slot && (
                    <motion.div
                      key={`${date}-${slot}`}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 12 }}
                      transition={{ duration: 0.25 }}
                    >
                      <BookingForm
                        date={date}
                        slot={slot}
                        onRequestPayment={(booking) =>
                          setPendingBooking(booking)
                        }
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {pendingBooking && date && slot && (
        <PaymentModal
          isOpen={!!pendingBooking}
          onClose={() => setPendingBooking(null)}
          booking={pendingBooking}
          amount={computePrice(pendingBooking.room_count)}
          date={date}
          slot={slot}
          onSuccess={() => {
            setPendingBooking(null);
            setSuccess({ date, slot });
          }}
          onSlotTaken={async () => {
            setNotice("Ce créneau vient d'être pris. Choisissez-en un autre.");
            setSlot(null);
            setPendingBooking(null);
            await refreshAvailability();
          }}
        />
      )}
    </section>
  );
}
