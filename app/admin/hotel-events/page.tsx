"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CalendarCheckIcon, PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type HotelEvent = {
  id: string;
  code: string;
  name: string;
  city: string;
  start_date: string;
  end_date: string;
  expected_headcount: number | null;
  per_diem_limit: number | null;
  status: string;
};

type Dashboard = {
  summary: {
    roomsPledged: number;
    bookings: number;
    confirmedBookings: number;
    remainingRooms: number;
    grossPaid: number;
    hotelNet: number;
  };
  blocks: Array<{
    id: string;
    count_pledged: number;
    event_nightly_rate: number | null;
    hotel: { name: string } | null;
    room_type: { name: string } | null;
  }>;
};

const initialForm = {
  name: "",
  city: "",
  startDate: "",
  endDate: "",
  expectedHeadcount: "",
  perDiemLimit: "",
  organizerName: "Ministère des Arts et du Tourisme",
  organizerContact: "",
};

export default function HotelEventsAdminPage() {
  const [events, setEvents] = useState<HotelEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [form, setForm] = useState(initialForm);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadEvents = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/events");
    const payload = await response.json();
    if (response.ok) {
      setEvents(payload.events || []);
      setSelectedId((current) => current || payload.events?.[0]?.id || null);
    } else setError(payload.error || "Chargement impossible");
    setLoading(false);
  }, []);

  useEffect(() => void loadEvents(), [loadEvents]);

  useEffect(() => {
    if (!selectedId) return;
    void fetch(`/api/admin/events/${selectedId}/dashboard`)
      .then((response) => response.json())
      .then((payload) => setDashboard(payload.success ? payload : null));
  }, [selectedId]);

  async function createEvent(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const response = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        expectedHeadcount: form.expectedHeadcount
          ? Number(form.expectedHeadcount)
          : undefined,
        perDiemLimit: form.perDiemLimit ? Number(form.perDiemLimit) : undefined,
      }),
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(payload.error || "Création impossible");
      return;
    }
    setForm(initialForm);
    setShowForm(false);
    setSelectedId(payload.event.id);
    await loadEvents();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <CalendarCheckIcon size={25} weight="bold" />
          </div>
          <div>
            <h1 className="text-3xl font-black">Événements hôteliers</h1>
            <p className="text-sm font-medium text-neutral-500">
              Codes agents, chambres promises, tarifs et paiements.
            </p>
          </div>
        </div>
        <Button
          onClick={() => setShowForm((value) => !value)}
          className="rounded-2xl"
        >
          <PlusIcon className="mr-2" /> Nouvel événement
        </Button>
      </header>

      {error ? (
        <div className="rounded-2xl bg-red-50 p-4 font-bold text-red-600">
          {error}
        </div>
      ) : null}

      {showForm ? (
        <form
          onSubmit={createEvent}
          className="grid gap-3 rounded-[28px] border bg-white p-6 shadow-sm md:grid-cols-2"
        >
          {(
            [
              ["name", "Nom"],
              ["city", "Ville"],
              ["startDate", "Date de début", "date"],
              ["endDate", "Date de fin", "date"],
              ["expectedHeadcount", "Effectif attendu", "number"],
              ["perDiemLimit", "Plafond par nuit (FCFA)", "number"],
              ["organizerName", "Organisateur"],
              ["organizerContact", "Contact organisateur"],
            ] as const
          ).map(([key, label, type]) => (
            <label key={key} className="text-sm font-black text-neutral-600">
              {label}
              <input
                type={type || "text"}
                value={form[key]}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
                required={["name", "city", "startDate", "endDate"].includes(
                  key,
                )}
                className="mt-1 w-full rounded-xl border px-4 py-3 font-medium outline-none focus:border-primary"
              />
            </label>
          ))}
          <Button
            type="submit"
            disabled={saving}
            className="rounded-xl md:col-span-2"
          >
            {saving ? "Création..." : "Créer et ouvrir l'événement"}
          </Button>
        </form>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <section className="space-y-2 rounded-[28px] border bg-white p-4 shadow-sm">
          {loading ? (
            <div className="h-32 animate-pulse rounded-2xl bg-neutral-50" />
          ) : (
            events.map((event) => (
              <button
                key={event.id}
                onClick={() => setSelectedId(event.id)}
                className={cn(
                  "w-full rounded-2xl border p-4 text-left",
                  selectedId === event.id
                    ? "border-primary bg-primary/5"
                    : "border-neutral-100",
                )}
              >
                <p className="font-black">{event.name}</p>
                <p className="mt-1 text-xs font-bold text-neutral-400">
                  {event.code} · {event.city}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  {event.start_date} → {event.end_date}
                </p>
              </button>
            ))
          )}
        </section>

        <section className="rounded-[28px] border bg-white p-6 shadow-sm">
          {!dashboard ? (
            <div className="h-64 animate-pulse rounded-2xl bg-neutral-50" />
          ) : (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                  label="Chambres promises"
                  value={dashboard.summary.roomsPledged}
                />
                <Metric
                  label="Réservations confirmées"
                  value={dashboard.summary.confirmedBookings}
                />
                <Metric
                  label="Chambres restantes"
                  value={dashboard.summary.remainingRooms}
                />
                <Metric
                  label="Paiements bruts"
                  value={`${dashboard.summary.grossPaid.toLocaleString("fr-FR")} FCFA`}
                />
              </div>
              <div>
                <h2 className="text-lg font-black">Hôtels participants</h2>
                <div className="mt-3 space-y-2">
                  {dashboard.blocks.length === 0 ? (
                    <p className="font-medium text-neutral-400">
                      Aucun engagement reçu.
                    </p>
                  ) : (
                    dashboard.blocks.map((block) => (
                      <div
                        key={block.id}
                        className="flex items-center justify-between rounded-2xl bg-neutral-50 p-4"
                      >
                        <div>
                          <p className="font-black">
                            {block.hotel?.name || "Hôtel"}
                          </p>
                          <p className="text-sm text-neutral-500">
                            {block.room_type?.name || "Chambre"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-black">
                            {block.count_pledged} chambres
                          </p>
                          <p className="text-sm text-neutral-500">
                            {block.event_nightly_rate
                              ? `${block.event_nightly_rate.toLocaleString("fr-FR")} FCFA / nuit`
                              : "Tarif standard"}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-neutral-50 p-4">
      <p className="text-2xl font-black">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase text-neutral-400">
        {label}
      </p>
    </div>
  );
}
