"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  CheckCircleIcon,
  ClockIcon,
  IdentificationCardIcon,
  SealCheckIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type VerificationUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  user_type: string;
  identity_verification_status: string;
};

type VerificationSubmission = {
  id: string;
  user_id: string;
  status: "pending" | "approved" | "rejected";
  submitted_at: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
  review_notes: string | null;
  users: VerificationUser | null;
};

type VerificationDetail = VerificationSubmission & {
  front_storage_path: string;
  back_storage_path: string;
  documents: {
    frontUrl: string | null;
    backUrl: string | null;
  };
};

const statusTabs = [
  { value: "pending", label: "En attente" },
  { value: "approved", label: "Approuvées" },
  { value: "rejected", label: "Rejetées" },
  { value: "all", label: "Toutes" },
];

const statusConfig = {
  pending: {
    label: "En attente",
    className: "bg-amber-50 text-amber-700 border-amber-200",
    Icon: ClockIcon,
  },
  approved: {
    label: "Approuvée",
    className: "bg-green-50 text-green-700 border-green-200",
    Icon: CheckCircleIcon,
  },
  rejected: {
    label: "Rejetée",
    className: "bg-red-50 text-red-600 border-red-200",
    Icon: XCircleIcon,
  },
};

function formatDate(value: string | null) {
  if (!value) return "Non renseigné";
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDisplayName(user: VerificationUser | null) {
  return user?.full_name || user?.email || "Utilisateur sans nom";
}

export default function AdminVerificationsPage() {
  const [status, setStatus] = useState("pending");
  const [submissions, setSubmissions] = useState<VerificationSubmission[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VerificationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewing, setReviewing] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  async function loadSubmissions(nextStatus = status) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/identity-verifications?status=${nextStatus}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Impossible de charger les vérifications");
      setSubmissions(data.submissions || []);
      setSelectedId((current) => {
        if (current && data.submissions?.some((item: VerificationSubmission) => item.id === current)) {
          return current;
        }
        return data.submissions?.[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSubmissions(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    async function loadDetail() {
      if (!selectedId) {
        setDetail(null);
        return;
      }
      setDetailLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/admin/identity-verifications/${selectedId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Impossible de charger la soumission");
        setDetail(data.submission);
        setReason(data.submission?.rejection_reason || "");
        setNotes(data.submission?.review_notes || "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      } finally {
        setDetailLoading(false);
      }
    }
    loadDetail();
  }, [selectedId]);

  const selectedSubmission = useMemo(
    () => submissions.find((submission) => submission.id === selectedId) ?? null,
    [selectedId, submissions],
  );

  async function submitReview(decision: "approve" | "reject") {
    if (!selectedId) return;
    setReviewing(decision);
    setError("");
    try {
      const res = await fetch(`/api/admin/identity-verifications/${selectedId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Impossible d'enregistrer la décision");
      await loadSubmissions(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setReviewing(null);
    }
  }

  const detailStatus = detail?.status ?? selectedSubmission?.status ?? "pending";
  const StatusIcon = statusConfig[detailStatus].Icon;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <IdentificationCardIcon size={24} weight="bold" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-neutral-900">
                Vérifications d&apos;identité
              </h1>
              <p className="mt-1 text-sm font-medium text-neutral-500">
                Validez les propriétaires et agents avant d&apos;afficher le badge public.
              </p>
            </div>
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

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <section className="rounded-[32px] border border-neutral-100 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between px-2">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-neutral-400">
              File de revue
            </h2>
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-500">
              {submissions.length}
            </span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-3xl bg-neutral-50" />
              ))}
            </div>
          ) : submissions.length === 0 ? (
            <div className="rounded-3xl bg-neutral-50 p-8 text-center">
              <SealCheckIcon size={40} weight="duotone" className="mx-auto text-neutral-300" />
              <p className="mt-3 text-sm font-bold text-neutral-500">
                Aucune soumission dans cette vue.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {submissions.map((submission) => {
                const cfg = statusConfig[submission.status];
                const Icon = cfg.Icon;
                return (
                  <button
                    key={submission.id}
                    onClick={() => setSelectedId(submission.id)}
                    className={cn(
                      "w-full rounded-3xl border p-4 text-left transition-all",
                      selectedId === submission.id
                        ? "border-primary bg-primary/5"
                        : "border-neutral-100 hover:border-primary/30 hover:bg-neutral-50",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-2xl bg-neutral-100">
                        {submission.users?.avatar_url ? (
                          <Image
                            src={submission.users.avatar_url}
                            alt=""
                            width={44}
                            height={44}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-primary/10 text-sm font-black text-primary">
                            {getDisplayName(submission.users).charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-neutral-900">
                          {getDisplayName(submission.users)}
                        </p>
                        <p className="mt-0.5 text-xs font-bold uppercase tracking-wider text-neutral-400">
                          {submission.users?.user_type || "utilisateur"} · {formatDate(submission.submitted_at)}
                        </p>
                      </div>
                    </div>
                    <span className={cn("mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider", cfg.className)}>
                      <Icon size={11} weight="fill" />
                      {cfg.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="min-h-[560px] rounded-[32px] border border-neutral-100 bg-white p-6 shadow-sm">
          {!selectedId ? (
            <div className="flex h-full min-h-[420px] items-center justify-center rounded-3xl bg-neutral-50 text-center">
              <div>
                <IdentificationCardIcon size={56} weight="duotone" className="mx-auto text-neutral-300" />
                <p className="mt-4 text-sm font-bold text-neutral-500">
                  Sélectionnez une soumission pour voir les pièces.
                </p>
              </div>
            </div>
          ) : detailLoading || !detail ? (
            <div className="h-[520px] animate-pulse rounded-3xl bg-neutral-50" />
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col gap-4 border-b border-neutral-100 pb-6 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-black tracking-tight text-neutral-900">
                      {getDisplayName(detail.users)}
                    </h2>
                    <span className="rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-neutral-500">
                      {detail.users?.user_type || "utilisateur"}
                    </span>
                    <span className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-[10px] font-black uppercase tracking-widest", statusConfig[detailStatus].className)}>
                      <StatusIcon size={11} weight="fill" />
                      {statusConfig[detailStatus].label}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm font-bold text-neutral-500">
                    <span>{detail.users?.email || "Email non renseigné"}</span>
                    <span>{detail.users?.phone || "Téléphone non renseigné"}</span>
                    <span>Soumis le {formatDate(detail.submitted_at)}</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {[
                  { label: "Recto de la pièce", url: detail.documents.frontUrl },
                  { label: "Verso de la pièce", url: detail.documents.backUrl },
                ].map((doc) => (
                  <div key={doc.label} className="overflow-hidden rounded-3xl border border-neutral-100 bg-neutral-50">
                    <div className="border-b border-neutral-100 bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-neutral-400">
                      {doc.label}
                    </div>
                    {doc.url ? (
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative block h-[360px]"
                      >
                        <Image
                          src={doc.url}
                          alt={doc.label}
                          fill
                          sizes="(max-width: 1024px) 100vw, 50vw"
                          unoptimized
                          className="object-contain"
                        />
                      </a>
                    ) : (
                      <div className="flex h-[360px] items-center justify-center text-sm font-bold text-neutral-400">
                        URL signée indisponible
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {detail.status === "pending" ? (
                <div className="rounded-3xl border border-neutral-100 bg-neutral-50 p-5">
                  <label className="block text-xs font-black uppercase tracking-[0.2em] text-neutral-400">
                    Notes internes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className="mt-2 min-h-20 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-primary"
                    placeholder="Notes visibles seulement par l'équipe..."
                  />

                  <label className="mt-4 block text-xs font-black uppercase tracking-[0.2em] text-neutral-400">
                    Raison du rejet
                  </label>
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    className="mt-2 min-h-20 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-primary"
                    placeholder="Obligatoire uniquement pour rejeter..."
                  />

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <Button
                      onClick={() => submitReview("approve")}
                      disabled={!!reviewing}
                      className="h-12 flex-1 rounded-2xl bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircleIcon size={18} weight="bold" className="mr-2" />
                      {reviewing === "approve" ? "Validation..." : "Approuver"}
                    </Button>
                    <Button
                      onClick={() => submitReview("reject")}
                      disabled={!!reviewing}
                      className="h-12 flex-1 rounded-2xl bg-red-600 hover:bg-red-700"
                    >
                      <XCircleIcon size={18} weight="bold" className="mr-2" />
                      {reviewing === "reject" ? "Rejet..." : "Rejeter"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-neutral-100 bg-neutral-50 p-5">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-400">
                    Décision
                  </p>
                  <p className="mt-2 text-sm font-bold text-neutral-700">
                    {detail.status === "approved"
                      ? "Cette identité a été approuvée."
                      : detail.rejection_reason || "Cette identité a été rejetée."}
                  </p>
                  <p className="mt-1 text-xs font-medium text-neutral-400">
                    Revue le {formatDate(detail.reviewed_at)}
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
