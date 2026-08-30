"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BuildingsIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type Submission = {
  id: string;
  status: "pending" | "approved" | "rejected";
  legal_name: string;
  rccm_number: string;
  tax_number: string | null;
  submitted_at: string;
  rejection_reason: string | null;
  review_notes: string | null;
  documentUrl: string | null;
  hotel: {
    id: string;
    name: string;
    city: string | null;
    phone: string | null;
    business_verification_status: string;
  } | null;
};

const tabs = ["pending", "approved", "rejected", "all"] as const;

export default function HotelVerificationsPage() {
  const [status, setStatus] = useState<(typeof tabs)[number]>("pending");
  const [items, setItems] = useState<Submission[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/hotel-verifications?status=${status}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Chargement impossible");
      const submissions = (payload.submissions || []) as Submission[];
      setItems(submissions);
      setSelectedId((current) =>
        submissions.some((item) => item.id === current)
          ? current
          : submissions[0]?.id || null,
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) || null,
    [items, selectedId],
  );

  async function review(decision: "approve" | "reject") {
    if (!selected) return;
    setReviewing(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/hotel-verifications/${selected.id}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, reason, notes }),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Décision impossible");
      setReason("");
      setNotes("");
      await load();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Erreur inconnue");
    } finally {
      setReviewing(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <BuildingsIcon size={25} weight="bold" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-neutral-900">RCCM des hôtels</h1>
            <p className="text-sm font-medium text-neutral-500">
              Vérifiez l&apos;identité légale avant d&apos;afficher le badge hôtel.
            </p>
          </div>
        </div>
        <div className="flex gap-1 rounded-full border bg-white p-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setStatus(tab)}
              className={cn(
                "rounded-full px-4 py-2 text-xs font-black uppercase",
                status === tab ? "bg-neutral-900 text-white" : "text-neutral-500",
              )}
            >
              {tab === "pending" ? "En attente" : tab === "approved" ? "Approuvés" : tab === "rejected" ? "Rejetés" : "Tous"}
            </button>
          ))}
        </div>
      </header>

      {error ? <div className="rounded-2xl bg-red-50 p-4 font-bold text-red-600">{error}</div> : null}

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <section className="rounded-[28px] border bg-white p-4 shadow-sm">
          {loading ? (
            <div className="h-40 animate-pulse rounded-3xl bg-neutral-50" />
          ) : items.length === 0 ? (
            <p className="p-8 text-center font-bold text-neutral-400">Aucun dossier.</p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    "w-full rounded-2xl border p-4 text-left",
                    item.id === selectedId ? "border-primary bg-primary/5" : "border-neutral-100",
                  )}
                >
                  <p className="font-black text-neutral-900">{item.hotel?.name || item.legal_name}</p>
                  <p className="mt-1 text-xs font-bold text-neutral-400">{item.rccm_number}</p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="min-h-[500px] rounded-[28px] border bg-white p-6 shadow-sm">
          {!selected ? (
            <div className="flex min-h-[420px] items-center justify-center font-bold text-neutral-400">Sélectionnez un dossier.</div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black">{selected.legal_name}</h2>
                  <p className="mt-1 font-bold text-neutral-500">RCCM : {selected.rccm_number}</p>
                  <p className="text-sm text-neutral-400">IFU : {selected.tax_number || "Non renseigné"}</p>
                </div>
                <Status status={selected.status} />
              </div>

              <div className="rounded-2xl border bg-neutral-50 p-5">
                {selected.documentUrl ? (
                  <a className="font-black text-primary underline" href={selected.documentUrl} target="_blank" rel="noreferrer">
                    Ouvrir le document RCCM
                  </a>
                ) : (
                  <span className="font-bold text-red-500">Document indisponible</span>
                )}
              </div>

              {selected.status === "pending" ? (
                <div className="space-y-4 rounded-2xl bg-neutral-50 p-5">
                  <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes internes" className="min-h-20 w-full rounded-xl border bg-white p-3" />
                  <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motif obligatoire en cas de rejet" className="min-h-20 w-full rounded-xl border bg-white p-3" />
                  <div className="flex gap-3">
                    <Button disabled={reviewing} onClick={() => review("approve")} className="flex-1 bg-green-600 hover:bg-green-700">Approuver</Button>
                    <Button disabled={reviewing} onClick={() => review("reject")} className="flex-1 bg-red-600 hover:bg-red-700">Rejeter</Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Status({ status }: { status: Submission["status"] }) {
  const Icon = status === "approved" ? CheckCircleIcon : status === "rejected" ? XCircleIcon : ClockIcon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black", status === "approved" ? "bg-green-50 text-green-700" : status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700")}>
      <Icon size={14} weight="fill" /> {status}
    </span>
  );
}
