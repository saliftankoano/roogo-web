"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  BuildingsIcon,
  UserCircleIcon,
  ArrowRightIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

type PropertyInfo = {
  id: string;
  address: string | null;
  quartier: string | null;
  city: string | null;
  property_type: string | null;
  price: number | null;
  status: string | null;
};

type UserInfo = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

type PendingEditRow = {
  id: string;
  status: string;
  payload: Record<string, unknown>;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  property: PropertyInfo | null;
  submitted_by_user: UserInfo | null;
  reviewed_by_user: { id: string; full_name: string | null } | null;
};

const FIELD_LABELS: Record<string, string> = {
  price: "Prix (FCFA)",
  caution_mois: "Caution (mois)",
  loyer_avance_mois: "Loyer d'avance (mois)",
  caution_type: "Type de caution",
  caution_valeur: "Valeur caution",
  city: "Ville",
  quartier: "Quartier",
  latitude: "Latitude",
  longitude: "Longitude",
  property_type: "Type de bien",
  bedrooms: "Chambres",
  bathrooms: "Salles de bain",
  area: "Superficie (m²)",
  parking_spaces: "Parking",
  sejour_minimum: "Séjour minimum (jours)",
  capacite_max: "Capacité max",
  description: "Description",
  dos_and_donts: "Règles",
  interdictions: "Interdictions",
  amenities: "Équipements",
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(vide)";
  if (Array.isArray(value))
    return value.length > 0 ? value.join(", ") : "(vide)";
  return String(value);
}

function PropertyLabel({ row }: { row: PendingEditRow }) {
  const p = row.property;
  if (!p)
    return <span className="text-neutral-400 italic">Bien introuvable</span>;
  return (
    <span>
      {p.quartier && p.city ? `${p.quartier}, ${p.city}` : (p.address ?? "—")}
    </span>
  );
}

const statusConfig: Record<
  string,
  { label: string; color: string; Icon: typeof ClockIcon }
> = {
  pending: {
    label: "En attente",
    color: "bg-amber-50 text-amber-700 border-amber-200",
    Icon: ClockIcon,
  },
  approved: {
    label: "Approuvé",
    color: "bg-green-50 text-green-700 border-green-200",
    Icon: CheckCircleIcon,
  },
  rejected: {
    label: "Refusé",
    color: "bg-red-50 text-red-700 border-red-200",
    Icon: XCircleIcon,
  },
};

export default function AdminModificationsPage() {
  const [statusFilter, setStatusFilter] = useState<
    "pending" | "approved" | "rejected"
  >("pending");
  const [rows, setRows] = useState<PendingEditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewModal, setReviewModal] = useState<{
    row: PendingEditRow;
    action: "approve" | "reject";
  } | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/pending-edits?status=${status}`);
      if (!res.ok) throw new Error("Fetch failed");
      const json = (await res.json()) as { pendingEdits: PendingEditRow[] };
      setRows(json.pendingEdits ?? []);
    } catch (err) {
      console.error("Error loading pending edits:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(statusFilter);
  }, [statusFilter, load]);

  const openReview = (row: PendingEditRow, action: "approve" | "reject") => {
    setReviewNote("");
    setReviewModal({ row, action });
  };

  const submitReview = async () => {
    if (!reviewModal) return;
    setIsSubmittingReview(true);
    try {
      const res = await fetch(
        `/api/admin/pending-edits/${reviewModal.row.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: reviewModal.action, reviewNote }),
        },
      );
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok) {
        alert(json.error ?? "Erreur lors de la soumission de la décision");
        return;
      }
      setReviewModal(null);
      await load(statusFilter);
    } catch (err) {
      console.error("Error submitting review:", err);
      alert("Erreur lors de la soumission.");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const tabs: { key: "pending" | "approved" | "rejected"; label: string }[] = [
    { key: "pending", label: "En attente" },
    { key: "approved", label: "Approuvés" },
    { key: "rejected", label: "Refusés" },
  ];

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-10 space-y-8">
      {/* Review modal */}
      <Portal>
        <AnimatePresence>
          {reviewModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={() => setReviewModal(null)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl relative z-10"
              >
                <h3 className="text-lg font-black text-neutral-900 mb-1">
                  {reviewModal.action === "approve"
                    ? "Approuver les modifications"
                    : "Refuser les modifications"}
                </h3>
                <p className="text-sm text-neutral-500 mb-4">
                  <PropertyLabel row={reviewModal.row} />
                </p>

                {/* Field diff */}
                <div className="space-y-2 mb-5 max-h-56 overflow-y-auto">
                  {Object.entries(reviewModal.row.payload).map(
                    ([key, value]) => (
                      <div
                        key={key}
                        className="text-xs bg-neutral-50 rounded-xl px-3 py-2.5"
                      >
                        <span className="font-black text-neutral-600 uppercase tracking-wider text-[10px]">
                          {FIELD_LABELS[key] ?? key}
                        </span>
                        <p className="mt-0.5 text-neutral-700 leading-relaxed">
                          {formatValue(value)}
                        </p>
                      </div>
                    ),
                  )}
                </div>

                <label className="block text-xs font-bold text-neutral-600 uppercase tracking-wider mb-1.5">
                  Note (optionnel)
                </label>
                <textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder={
                    reviewModal.action === "reject"
                      ? "Expliquez pourquoi la demande est refusée..."
                      : "Commentaire optionnel..."
                  }
                  className="w-full h-24 p-3 text-sm bg-neutral-50 border border-neutral-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                />

                <div className="flex gap-3 mt-4">
                  <Button
                    variant="ghost"
                    className="flex-1"
                    onClick={() => setReviewModal(null)}
                    disabled={isSubmittingReview}
                  >
                    Annuler
                  </Button>
                  <Button
                    className={cn(
                      "flex-1 text-white",
                      reviewModal.action === "approve"
                        ? "bg-green-600 hover:bg-green-700"
                        : "bg-red-600 hover:bg-red-700",
                    )}
                    onClick={submitReview}
                    disabled={isSubmittingReview}
                  >
                    {isSubmittingReview
                      ? "Traitement..."
                      : reviewModal.action === "approve"
                        ? "Approuver"
                        : "Refuser"}
                  </Button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </Portal>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-neutral-900">Modifications</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Modifications soumises par les propriétaires sur leurs annonces
          publiées.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-neutral-100 pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={cn(
              "px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 -mb-px transition-all",
              statusFilter === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-neutral-400 hover:text-neutral-600",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center py-24 gap-3 text-center">
          <WarningCircleIcon size={40} className="text-neutral-200" />
          <p className="text-sm font-bold text-neutral-400">
            Aucune modification{" "}
            {statusFilter === "pending"
              ? "en attente"
              : statusFilter === "approved"
                ? "approuvée"
                : "refusée"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => {
            const sc = statusConfig[row.status] ?? statusConfig.pending;
            return (
              <div
                key={row.id}
                className="bg-white rounded-[24px] border border-neutral-100 shadow-sm overflow-hidden"
              >
                {/* Row header */}
                <div className="flex items-start justify-between gap-4 p-6 pb-4">
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center shrink-0">
                      <BuildingsIcon
                        size={18}
                        weight="bold"
                        className="text-primary"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-black text-neutral-900 text-sm">
                          <PropertyLabel row={row} />
                        </p>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border",
                            sc.color,
                          )}
                        >
                          <sc.Icon size={10} weight="fill" />
                          {sc.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-neutral-400 font-medium">
                        <div className="flex items-center gap-1">
                          <UserCircleIcon size={12} weight="bold" />
                          <span>{row.submitted_by_user?.full_name ?? "—"}</span>
                        </div>
                        <span>•</span>
                        <span>
                          {new Date(row.created_at).toLocaleDateString(
                            "fr-FR",
                            {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            },
                          )}
                        </span>
                        {row.property && (
                          <>
                            <span>•</span>
                            <Link
                              href={`/admin/annonces/${row.property.id}`}
                              className="text-primary hover:underline inline-flex items-center gap-1"
                            >
                              Voir l&apos;annonce
                              <ArrowRightIcon size={10} weight="bold" />
                            </Link>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions — only for pending */}
                  {row.status === "pending" && (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        className="text-xs font-black text-red-600 hover:bg-red-50 border border-red-100"
                        onClick={() => openReview(row, "reject")}
                      >
                        <XCircleIcon size={14} weight="bold" className="mr-1" />
                        Refuser
                      </Button>
                      <Button
                        className="text-xs font-black text-white bg-green-600 hover:bg-green-700"
                        onClick={() => openReview(row, "approve")}
                      >
                        <CheckCircleIcon
                          size={14}
                          weight="bold"
                          className="mr-1"
                        />
                        Approuver
                      </Button>
                    </div>
                  )}
                </div>

                {/* Diff fields */}
                <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {Object.entries(row.payload).map(([key, value]) => (
                    <div
                      key={key}
                      className="bg-neutral-50 rounded-xl px-3 py-2.5"
                    >
                      <p className="text-[10px] font-black text-neutral-400 uppercase tracking-wider">
                        {FIELD_LABELS[key] ?? key}
                      </p>
                      <p className="text-sm font-semibold text-neutral-800 mt-0.5 wrap-break-word">
                        {formatValue(value)}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Review note (if any) */}
                {row.review_note && (
                  <div className="px-6 pb-5">
                    <div className="bg-neutral-50 rounded-xl px-4 py-3 text-sm text-neutral-600 border border-neutral-100">
                      <span className="font-black text-neutral-400 uppercase tracking-wider text-[10px]">
                        Note du staff
                      </span>
                      <p className="mt-0.5">{row.review_note}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
