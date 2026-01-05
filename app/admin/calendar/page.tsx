"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";

type PropertyLite = {
  id: string;
  title: string;
  city?: string;
  quartier?: string;
};

type Slot = {
  id: string;
  propertyId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM(:SS)
  endTime: string; // HH:MM(:SS)
  capacity: number;
};

type ApiSlot = {
  id: unknown;
  property_id: unknown;
  date: unknown;
  start_time?: unknown;
  end_time?: unknown;
  capacity?: unknown;
};

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function formatDateYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

// Monday-start week index: Mon=0 ... Sun=6
function mondayIndex(d: Date) {
  const js = d.getDay(); // Sun=0..Sat=6
  return (js + 6) % 7;
}

function addDays(d: Date, days: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

export default function AdminCalendarPage() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [properties, setProperties] = useState<PropertyLite[]>([]);
  const [propertyFilter, setPropertyFilter] = useState<string>("all");

  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState<string>("");
  const [modalPropertyId, setModalPropertyId] = useState<string>("");
  const [modalStart, setModalStart] = useState<string>("10:00");
  const [modalEnd, setModalEnd] = useState<string>("12:00");
  const [modalCapacity, setModalCapacity] = useState<number>(10);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const titleFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("fr-FR", {
        month: "long",
        year: "numeric",
      }),
    []
  );

  const weekdayFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("fr-FR", {
        weekday: "short",
      }),
    []
  );

  const propertyById = useMemo(() => {
    const map = new Map<string, PropertyLite>();
    for (const p of properties) map.set(p.id, p);
    return map;
  }, [properties]);

  const fromTo = useMemo(() => {
    const from = startOfMonth(month);
    const to = endOfMonth(month);
    return { from: formatDateYmd(from), to: formatDateYmd(to) };
  }, [month]);

  const days = useMemo(() => {
    const first = startOfMonth(month);
    const start = addDays(first, -mondayIndex(first));
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [month]);

  const slotsByDate = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const arr = map.get(s.date) || [];
      arr.push(s);
      map.set(s.date, arr);
    }
    for (const [, arr] of map) {
      arr.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return map;
  }, [slots]);

  useEffect(() => {
    let cancelled = false;
    async function loadProperties() {
      try {
        const res = await fetch("/api/admin/properties", { method: "GET" });
        const data = (await res.json()) as { properties?: PropertyLite[]; error?: string };
        if (!res.ok) throw new Error(data?.error || "Failed to load properties");
        if (!cancelled) setProperties(data.properties || []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load properties");
      }
    }
    loadProperties();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadSlots() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          from: fromTo.from,
          to: fromTo.to,
        });
        if (propertyFilter !== "all") params.set("propertyId", propertyFilter);

        const res = await fetch(`/api/open-house-slots?${params.toString()}`, {
          method: "GET",
        });
        const data = (await res.json()) as { slots?: ApiSlot[]; error?: string };
        if (!res.ok) throw new Error(data?.error || "Failed to load open house slots");

        const mapped: Slot[] = (data.slots || []).map((s) => ({
          id: String(s.id),
          propertyId: String(s.property_id),
          date: String(s.date),
          startTime: String(s.start_time ?? ""),
          endTime: String(s.end_time ?? ""),
          capacity: Number(s.capacity ?? 0),
        }));

        if (!cancelled) setSlots(mapped);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load open house slots");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadSlots();
    return () => {
      cancelled = true;
    };
  }, [fromTo.from, fromTo.to, propertyFilter]);

  function openCreateModal(date: string) {
    setModalDate(date);
    setModalPropertyId(propertyFilter !== "all" ? propertyFilter : properties[0]?.id || "");
    setModalStart("10:00");
    setModalEnd("12:00");
    setModalCapacity(10);
    setModalError(null);
    setIsModalOpen(true);
  }

  async function createSlot() {
    if (!modalDate || !modalPropertyId) return;

    setModalSaving(true);
    setModalError(null);
    try {
      const res = await fetch("/api/open-house-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: modalPropertyId,
          date: modalDate,
          startTime: modalStart,
          endTime: modalEnd,
          capacity: modalCapacity,
        }),
      });
      const data = (await res.json()) as { slot?: ApiSlot; error?: string };
      if (!res.ok) throw new Error(data?.error || "Failed to create open house slot");

      const s = data.slot;
      const created: Slot = {
        id: String(s?.id),
        propertyId: String(s?.property_id ?? modalPropertyId),
        date: String(s?.date ?? modalDate),
        startTime: String(s?.start_time ?? modalStart),
        endTime: String(s?.end_time ?? modalEnd),
        capacity: Number(s?.capacity ?? modalCapacity),
      };

      setSlots((prev) => [...prev, created]);
      setIsModalOpen(false);
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Failed to create open house slot");
    } finally {
      setModalSaving(false);
    }
  }

  async function deleteSlot(id: string) {
    const ok = window.confirm("Supprimer cette session Open House ?");
    if (!ok) return;

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
  }

  const monthTitle = titleFormatter.format(month);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-neutral-900">Calendrier Open House</h1>
          <p className="text-sm text-neutral-500">
            Ajoutez et gérez les sessions Open House depuis le calendrier.
          </p>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => setMonth((m) => startOfMonth(new Date(m.getFullYear(), m.getMonth() - 1, 1)))}
            >
              ←
            </Button>
            <div className="min-w-[220px] text-center font-bold capitalize">{monthTitle}</div>
            <Button
              variant="ghost"
              onClick={() => setMonth((m) => startOfMonth(new Date(m.getFullYear(), m.getMonth() + 1, 1)))}
            >
              →
            </Button>
          </div>

          <select
            className="h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm"
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
          >
            <option value="all">Toutes les annonces</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
                {p.city ? ` — ${p.city}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
          {error}
        </div>
      ) : null}

      <div className="bg-white border border-neutral-200 rounded-3xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-7 gap-px bg-neutral-100">
          {Array.from({ length: 7 }).map((_, i) => {
            // Monday-start labels
            const d = addDays(new Date(2024, 0, 1), i); // Jan 1, 2024 is Monday
            const label = weekdayFormatter.format(d);
            return (
              <div key={i} className="bg-white py-3 text-center text-[11px] font-bold uppercase text-neutral-500">
                {label}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-7 gap-px bg-neutral-100">
          {days.map((d) => {
            const ymd = formatDateYmd(d);
            const inMonth = d.getMonth() === month.getMonth();
            const daySlots = slotsByDate.get(ymd) || [];

            return (
              <div
                key={ymd}
                className={`bg-white min-h-[110px] p-3 flex flex-col gap-2 ${
                  inMonth ? "" : "opacity-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold text-neutral-900">{d.getDate()}</div>
                  <button
                    className="text-xs font-bold text-primary hover:underline"
                    onClick={() => openCreateModal(ymd)}
                    type="button"
                  >
                    + Ajouter
                  </button>
                </div>

                <div className="space-y-1.5">
                  {daySlots.slice(0, 3).map((s) => {
                    const p = propertyById.get(s.propertyId);
                    const title = p?.title || "Annonce";
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => deleteSlot(s.id)}
                        className="w-full text-left text-[11px] rounded-lg border border-neutral-200 px-2 py-1 hover:bg-neutral-50"
                        title="Cliquer pour supprimer"
                      >
                        <div className="font-bold text-neutral-900">
                          {s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)}
                        </div>
                        <div className="text-neutral-500 truncate">{title}</div>
                      </button>
                    );
                  })}
                  {daySlots.length > 3 ? (
                    <div className="text-[11px] text-neutral-400 italic">
                      +{daySlots.length - 3} autre{daySlots.length - 3 > 1 ? "s" : ""}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-neutral-500 animate-pulse">Chargement des sessions…</div>
      ) : null}

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => (modalSaving ? null : setIsModalOpen(false))}
          />
          <div className="relative w-full max-w-lg bg-white rounded-3xl border border-neutral-200 shadow-xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-neutral-900">Ajouter une session</h2>
                <p className="text-sm text-neutral-500">{modalDate}</p>
              </div>
              <Button variant="ghost" onClick={() => setIsModalOpen(false)} disabled={modalSaving}>
                Fermer
              </Button>
            </div>

            {modalError ? (
              <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
                {modalError}
              </div>
            ) : null}

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-neutral-500 uppercase">Annonce</label>
                <select
                  className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm"
                  value={modalPropertyId}
                  onChange={(e) => setModalPropertyId(e.target.value)}
                >
                  <option value="" disabled>
                    Sélectionner…
                  </option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                      {p.city ? ` — ${p.city}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-neutral-500 uppercase">Heure Début</label>
                  <input
                    type="time"
                    className="h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm"
                    value={modalStart}
                    onChange={(e) => setModalStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-neutral-500 uppercase">Heure Fin</label>
                  <input
                    type="time"
                    className="h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm"
                    value={modalEnd}
                    onChange={(e) => setModalEnd(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-[10px] font-bold text-neutral-500 uppercase">Capacité</label>
                  <input
                    type="number"
                    className="h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm"
                    value={modalCapacity}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setModalCapacity(Number.isFinite(v) ? v : 10);
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIsModalOpen(false)} disabled={modalSaving}>
                Annuler
              </Button>
              <Button className="bg-primary text-white" onClick={createSlot} disabled={modalSaving || !modalPropertyId}>
                {modalSaving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

