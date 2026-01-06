"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarIcon, TrashIcon, PlusIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "../ui/Button";

type ApiOpenHouseSlot = {
  id: unknown;
  date: unknown;
  start_time?: unknown;
  end_time?: unknown;
  capacity?: unknown;
  bookings?: unknown;
};

interface OpenHouseSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
  bookings: number;
}

interface OpenHouseSlotManagerProps {
  propertyId: string;
  limit: number;
  existingSlots: OpenHouseSlot[];
}

export default function OpenHouseSlotManager({
  propertyId,
  limit,
  existingSlots = [],
}: OpenHouseSlotManagerProps) {
  const [slots, setSlots] = useState<OpenHouseSlot[]>(existingSlots);
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newDate, setNewDate] = useState("");
  const [newStart, setNewStartTime] = useState("10:00");
  const [newEnd, setNewEndTime] = useState("12:00");
  const [newCapacity, setNewCapacity] = useState(10);

  const remaining = useMemo(() => Math.max(0, limit - slots.length), [limit, slots.length]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!propertyId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/open-house-slots?propertyId=${encodeURIComponent(propertyId)}`,
          { method: "GET" }
        );
        const data = (await res.json()) as { slots?: ApiOpenHouseSlot[]; error?: string };
        if (!res.ok) throw new Error(data?.error || "Failed to load open house slots");

        const mapped: OpenHouseSlot[] = (data.slots || []).map((s) => ({
          id: String(s.id),
          date: String(s.date),
          startTime: String(s.start_time ?? ""),
          endTime: String(s.end_time ?? ""),
          capacity: Number(s.capacity ?? 0),
          bookings: Number(s.bookings ?? 0),
        }));

        if (!cancelled) setSlots(mapped);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load open house slots");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const handleAddSlot = async () => {
    if (!newDate) return;
    if (!propertyId) return;
    if (slots.length >= limit) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/open-house-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          date: newDate,
          startTime: newStart,
          endTime: newEnd,
          capacity: newCapacity,
        }),
      });
      const data = (await res.json()) as { slot?: ApiOpenHouseSlot; error?: string };
      if (!res.ok) throw new Error(data?.error || "Failed to create open house slot");

      const s = data.slot;
      const created: OpenHouseSlot = {
        id: String(s?.id),
        date: String(s?.date),
        startTime: String(s?.start_time ?? newStart),
        endTime: String(s?.end_time ?? newEnd),
        capacity: Number(s?.capacity ?? newCapacity),
        bookings: Number(s?.bookings ?? 0),
      };

      setSlots((prev) => [...prev, created]);
      setIsAdding(false);
      setNewDate("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create open house slot");
    } finally {
      setSaving(false);
    }
  };

  const removeSlot = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/open-house-slots/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok) throw new Error(data?.error || "Failed to delete open house slot");
      setSlots((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete open house slot");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <CalendarIcon size={24} weight="duotone" />
          Sessions Open House ({slots.length}/{limit} max)
        </h2>
      </div>

      <div className="space-y-4">
        {error ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs"
          >
            {error}
          </motion.div>
        ) : null}

        {loading ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-6 rounded-2xl border border-neutral-200 bg-white text-sm text-neutral-500 animate-pulse"
          >
            Chargement des sessions…
          </motion.div>
        ) : null}

        <AnimatePresence initial={false}>
          {slots.map((slot) => (
            <motion.div
              key={slot.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="p-4 border border-neutral-100 rounded-xl bg-neutral-50 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
                  <CalendarIcon size={20} className="text-primary" />
                </div>
                <div>
                  <p className="font-bold text-sm">
                    {new Date(slot.date).toLocaleDateString("fr-FR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {slot.startTime} - {slot.endTime} • {slot.bookings}/
                    {slot.capacity} réservations
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-500 hover:bg-red-50"
                onClick={() => removeSlot(slot.id)}
              >
                <TrashIcon size={18} />
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {isAdding ? (
            <motion.div
              key="add-form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="p-6 border-2 border-primary/20 rounded-2xl bg-primary/5 space-y-4"
            >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-neutral-500 uppercase">
                  Date
                </label>
                <input
                  type="date"
                  className="w-full p-2 rounded-lg border border-neutral-200 text-sm"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-neutral-500 uppercase">
                  Capacité
                </label>
                <input
                  type="number"
                  className="w-full p-2 rounded-lg border border-neutral-200 text-sm"
                  value={newCapacity}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setNewCapacity(Number.isFinite(v) ? v : 10);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-neutral-500 uppercase">
                  Heure Début
                </label>
                <input
                  type="time"
                  className="w-full p-2 rounded-lg border border-neutral-200 text-sm"
                  value={newStart}
                  onChange={(e) => setNewStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-neutral-500 uppercase">
                  Heure Fin
                </label>
                <input
                  type="time"
                  className="w-full p-2 rounded-lg border border-neutral-200 text-sm"
                  value={newEnd}
                  onChange={(e) => setNewEndTime(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsAdding(false)}
                disabled={saving}
              >
                Annuler
              </Button>
              <Button
                size="sm"
                className="bg-primary text-white"
                onClick={handleAddSlot}
                disabled={saving}
              >
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </motion.div>
          ) : null}
        </AnimatePresence>

        {!isAdding && slots.length < limit ? (
          <Button
            variant="ghost"
            className="w-full border-2 border-dashed border-neutral-200 h-14 rounded-xl text-neutral-500 hover:border-primary/50 hover:text-primary transition-all"
            onClick={() => setIsAdding(true)}
          >
            <PlusIcon size={18} className="mr-2" />
            Ajouter une session ({remaining} restant{remaining > 1 ? "s" : ""})
          </Button>
        ) : (
          <p className="text-center text-xs text-neutral-400 italic">
            Limite de sessions atteinte pour ce pack
          </p>
        )}
      </div>
    </div>
  );
}
