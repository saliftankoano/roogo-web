"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  ArrowLeftIcon,
  ClockIcon,
  ScalesIcon,
  UserIcon,
  HouseLineIcon,
  CheckCircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface Dispute {
  id: string;
  agreement_id: string;
  property_id: string;
  owner_id: string;
  renter_id: string;
  amount: number;
  currency: string;
  status: string;
  stay_end_at: string | null;
  review_deadline_at: string | null;
  resolved_owner_amount: number | null;
  resolved_renter_amount: number | null;
  resolved_at: string | null;
  renter_payout_phone: string | null;
  renter_payout_provider: string | null;
  created_at: string;
  properties: {
    id: string;
    quartier: string | null;
    city: string | null;
    address: string | null;
    property_images: { url: string; is_primary: boolean }[] | null;
  } | null;
  owner: {
    id: string;
    full_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  renter: {
    id: string;
    full_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
}

interface Claim {
  id: string;
  claimed_amount: number;
  description: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

interface Evidence {
  id: string;
  storage_path: string;
  signed_url: string | null;
  mime_type: string | null;
  uploaded_at: string;
}

const formatXof = (n: number) => `${n.toLocaleString("fr-FR")} FCFA`;
const formatDateTime = (d: string | null) =>
  d
    ? new Date(d).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export default function AdminLitigeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [claim, setClaim] = useState<Claim | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownerAmount, setOwnerAmount] = useState<string>("");
  const [renterAmount, setRenterAmount] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const userType = (user?.publicMetadata?.userType ||
    user?.publicMetadata?.user_type) as string | undefined;

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/disputes/${id}`);
      const data = await res.json();
      if (data.success) {
        setDispute(data.dispute);
        setClaim(data.claim || null);
        setEvidence(data.evidence || []);
        if (data.dispute && data.dispute.status === "disputed" && data.claim) {
          const claimed = data.claim.claimed_amount as number;
          const total = data.dispute.amount as number;
          setOwnerAmount(String(claimed));
          setRenterAmount(String(Math.max(0, total - claimed)));
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoaded) return;
    if (!["staff", "founder", "admin"].includes(userType || "")) {
      router.push("/");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, userType, id, router]);

  const total = dispute?.amount || 0;
  const ownerNum = Number(ownerAmount) || 0;
  const renterNum = Number(renterAmount) || 0;
  const sum = ownerNum + renterNum;
  const sumValid = sum === total && total > 0;

  const onOwnerChange = (v: string) => {
    const n = Math.max(0, Math.min(total, Math.round(Number(v) || 0)));
    setOwnerAmount(String(n));
    setRenterAmount(String(Math.max(0, total - n)));
  };
  const onRenterChange = (v: string) => {
    const n = Math.max(0, Math.min(total, Math.round(Number(v) || 0)));
    setRenterAmount(String(n));
    setOwnerAmount(String(Math.max(0, total - n)));
  };

  const submit = async () => {
    if (!dispute) return;
    if (!sumValid) {
      setError(`La somme doit être égale à ${formatXof(total)}.`);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/disputes/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerAmount: ownerNum,
          renterAmount: renterNum,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur lors de la résolution.");
        return;
      }
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  if (!isLoaded || loading) {
    return (
      <div className="flex flex-col items-center py-32 gap-3 text-center">
        <ClockIcon size={40} className="text-neutral-200" />
        <p className="text-sm font-bold text-neutral-400">Chargement…</p>
      </div>
    );
  }

  if (!dispute) {
    return (
      <div className="flex flex-col items-center py-32 gap-3 text-center">
        <ScalesIcon size={40} className="text-neutral-200" />
        <p className="text-sm font-bold text-neutral-400">Litige introuvable.</p>
        <Link
          href="/admin/litiges"
          className="text-sm font-bold text-primary hover:underline"
        >
          ← Retour
        </Link>
      </div>
    );
  }

  const stayEnd = formatDateTime(dispute.stay_end_at);
  const deadline = formatDateTime(dispute.review_deadline_at);
  const isOpen = dispute.status === "disputed";

  return (
    <div className="space-y-6">
      <Link
        href="/admin/litiges"
        className="inline-flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-primary"
      >
        <ArrowLeftIcon size={14} weight="bold" /> Retour aux litiges
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-neutral-900">
            {dispute.properties?.quartier ||
              dispute.properties?.address ||
              "Bien inconnu"}
          </h1>
          <p className="text-sm text-neutral-400 font-medium mt-1">
            Caution: <strong>{formatXof(dispute.amount)}</strong> · Fin de séjour:{" "}
            {stayEnd} · Échéance auto: {deadline}
          </p>
        </div>
        <span
          className={cn(
            "self-start px-3 py-1.5 rounded-xl text-xs font-bold",
            isOpen
              ? "bg-amber-100 text-amber-700"
              : "bg-violet-100 text-violet-700",
          )}
        >
          {isOpen ? "À traiter" : "Résolu"}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-[24px] border border-neutral-100 shadow-sm p-5">
          <div className="flex items-center gap-2 text-neutral-500 mb-3">
            <UserIcon size={14} weight="bold" />
            <p className="text-[10px] font-black uppercase tracking-widest">
              Propriétaire
            </p>
          </div>
          <p className="font-bold text-neutral-900">
            {dispute.owner?.full_name || "—"}
          </p>
          <p className="text-xs text-neutral-400 mt-1">
            {dispute.owner?.phone || dispute.owner?.email || "—"}
          </p>
        </div>
        <div className="bg-white rounded-[24px] border border-neutral-100 shadow-sm p-5">
          <div className="flex items-center gap-2 text-neutral-500 mb-3">
            <UserIcon size={14} weight="bold" />
            <p className="text-[10px] font-black uppercase tracking-widest">
              Locataire
            </p>
          </div>
          <p className="font-bold text-neutral-900">
            {dispute.renter?.full_name || "—"}
          </p>
          <p className="text-xs text-neutral-400 mt-1">
            {dispute.renter?.phone || dispute.renter?.email || "—"}
          </p>
          <p className="text-xs text-neutral-400 mt-2">
            Remboursement:{" "}
            <strong>{dispute.renter_payout_phone || "—"}</strong> ·{" "}
            {dispute.renter_payout_provider || "—"}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-[24px] border border-neutral-100 shadow-sm p-5 space-y-3">
        <div className="flex items-center gap-2 text-neutral-500">
          <HouseLineIcon size={14} weight="bold" />
          <p className="text-[10px] font-black uppercase tracking-widest">
            Réclamation
          </p>
        </div>
        {claim ? (
          <>
            <p className="text-sm font-bold text-neutral-900">
              Montant réclamé: {formatXof(claim.claimed_amount)} sur{" "}
              {formatXof(dispute.amount)}
            </p>
            <p className="text-sm text-neutral-700 leading-relaxed whitespace-pre-wrap bg-neutral-50 p-4 rounded-2xl border border-neutral-100">
              {claim.description}
            </p>
            <p className="text-xs text-neutral-400">
              Soumis le {formatDateTime(claim.created_at)}
            </p>
          </>
        ) : (
          <p className="text-sm text-neutral-400">
            Pas de réclamation active — dispute peut-être auto-ouverte.
          </p>
        )}
      </div>

      {evidence.length > 0 ? (
        <div className="bg-white rounded-[24px] border border-neutral-100 shadow-sm p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-3">
            Preuves ({evidence.length})
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {evidence.map((e) =>
              e.signed_url ? (
                <button
                  key={e.id}
                  onClick={() => setLightbox(e.signed_url!)}
                  className="block aspect-square rounded-2xl overflow-hidden border border-neutral-100 hover:border-primary/50 transition-colors"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={e.signed_url}
                    alt="Preuve"
                    className="w-full h-full object-cover"
                  />
                </button>
              ) : (
                <div
                  key={e.id}
                  className="aspect-square rounded-2xl bg-neutral-50 flex items-center justify-center text-xs text-neutral-300"
                >
                  Indisponible
                </div>
              ),
            )}
          </div>
        </div>
      ) : null}

      {isOpen ? (
        <div className="bg-white rounded-[24px] border border-neutral-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2 text-neutral-500">
            <ScalesIcon size={14} weight="bold" />
            <p className="text-[10px] font-black uppercase tracking-widest">
              Décision
            </p>
          </div>
          <p className="text-xs text-neutral-500">
            Les deux montants doivent additionner à{" "}
            <strong>{formatXof(total)}</strong>.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-neutral-500">
                Part propriétaire (XOF)
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={total}
                value={ownerAmount}
                onChange={(e) => onOwnerChange(e.target.value)}
                className="rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-bold outline-none focus:border-primary"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-neutral-500">
                Part locataire (XOF)
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={total}
                value={renterAmount}
                onChange={(e) => onRenterChange(e.target.value)}
                className="rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-bold outline-none focus:border-primary"
              />
            </label>
          </div>
          <div
            className={cn(
              "text-xs font-bold rounded-xl px-3 py-2 inline-flex items-center gap-2",
              sumValid
                ? "bg-green-50 text-green-700"
                : "bg-amber-50 text-amber-700",
            )}
          >
            {sumValid ? (
              <CheckCircleIcon size={14} weight="fill" />
            ) : (
              <WarningCircleIcon size={14} weight="fill" />
            )}
            Total: {formatXof(sum)} / {formatXof(total)}
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-neutral-500">
              Notes internes
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="rounded-2xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-primary resize-none"
              placeholder="Raisonnement (visible dans l'audit interne)"
            />
          </label>
          {error ? (
            <p className="text-xs font-bold text-red-600">{error}</p>
          ) : null}
          <button
            onClick={submit}
            disabled={!sumValid || submitting}
            className={cn(
              "w-full rounded-full py-3 text-sm font-bold transition-colors",
              !sumValid || submitting
                ? "bg-neutral-100 text-neutral-400 cursor-not-allowed"
                : "bg-primary text-white hover:bg-primary/90",
            )}
          >
            {submitting ? "Résolution en cours…" : "Résoudre le litige"}
          </button>
        </div>
      ) : (
        <div className="bg-violet-50 rounded-[24px] border border-violet-100 p-5 space-y-1">
          <p className="text-sm font-bold text-violet-900">Litige résolu</p>
          <p className="text-sm text-violet-700">
            Propriétaire: {formatXof(dispute.resolved_owner_amount || 0)} ·
            Locataire: {formatXof(dispute.resolved_renter_amount || 0)}
          </p>
          <p className="text-xs text-violet-500">
            Décidé le {formatDateTime(dispute.resolved_at)}
          </p>
        </div>
      )}

      {lightbox ? (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Preuve"
            className="max-w-full max-h-full object-contain"
          />
        </div>
      ) : null}
    </div>
  );
}
