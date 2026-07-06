"use client";

import { useEffect, useState } from "react";
import { CalendarCheckIcon, ClockIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type VisitSlot = { date: string; time: string };

type VisitRequest = {
  id: string;
  conversation_id: string;
  property_id: string;
  proposed_slots: VisitSlot[];
  status: "requested" | "confirmed" | "cancelled";
  scheduled_at: string | null;
  created_at: string;
  buyer: { id: string; full_name: string | null; phone: string | null } | null;
  property: {
    id: string;
    property_type: string;
    quartier: string;
    city: string;
    price: number;
  } | null;
};

const statusTabs = [
  { value: "requested", label: "À confirmer" },
  { value: "confirmed", label: "Confirmées" },
  { value: "all", label: "Toutes" },
];

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminVisitRequestsPage() {
  const [status, setStatus] = useState("requested");
  const [requests, setRequests] = useState<VisitRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load(nextStatus = status) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/visit-requests?status=${nextStatus}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Impossible de charger");
      setRequests(data.visitRequests || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function confirmSlot(requestId: string, slot: VisitSlot) {
    setConfirming(`${requestId}-${slot.date}-${slot.time}`);
    setError("");
    try {
      const res = await fetch(`/api/admin/visit-requests/${requestId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Impossible de confirmer");
      await load(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setConfirming(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <CalendarCheckIcon size={24} weight="bold" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-neutral-900">
              Demandes de visite
            </h1>
            <p className="mt-1 text-sm font-medium text-neutral-500">
              Choisissez un créneau proposé par l&apos;acheteur. Roogo organise la
              visite.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 rounded-full border border-neutral-100 bg-white p-1 shadow-sm">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatus(tab.value)}
              className={cn(
                "rounded-full px-4 py-2 text-xs font-black uppercase tracking-wider transition-all",
                status === tab.value
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-500 hover:bg-neutral-50",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-3xl bg-neutral-50" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-[32px] border border-neutral-100 bg-white p-12 text-center shadow-sm">
          <ClockIcon
            size={40}
            weight="duotone"
            className="mx-auto text-neutral-300"
          />
          <p className="mt-3 text-sm font-bold text-neutral-500">
            Aucune demande dans cette vue.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <div
              key={request.id}
              className="rounded-[32px] border border-neutral-100 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-black text-neutral-900">
                    {request.property
                      ? `${request.property.property_type} · ${request.property.quartier}, ${request.property.city}`
                      : "Bien inconnu"}
                  </p>
                  <p className="mt-1 text-sm font-bold text-neutral-500">
                    Acheteur : {request.buyer?.full_name || "—"}
                    {request.buyer?.phone ? ` · ${request.buyer.phone}` : ""}
                  </p>
                </div>
                {request.status === "confirmed" && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-green-700">
                    <CalendarCheckIcon size={11} weight="fill" />
                    {formatDate(request.scheduled_at)}
                  </span>
                )}
              </div>

              {request.status === "requested" && (
                <div className="mt-4 flex flex-wrap gap-3">
                  {request.proposed_slots.map((slot, i) => {
                    const key = `${request.id}-${slot.date}-${slot.time}`;
                    return (
                      <Button
                        key={i}
                        onClick={() => confirmSlot(request.id, slot)}
                        disabled={confirming !== null}
                        className="h-12 rounded-2xl bg-primary hover:bg-primary/90"
                      >
                        <CalendarCheckIcon size={16} weight="bold" className="mr-2" />
                        {confirming === key
                          ? "Confirmation..."
                          : `${slot.date} · ${slot.time}`}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
