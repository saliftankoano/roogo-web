"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  FilePdfIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  NotePencilIcon,
  UserCircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { formatTalentStatus } from "@/lib/talent";
import { cn } from "@/lib/utils";

type TalentLead = {
  id: string;
  owner_name: string;
  owner_phone: string;
  owner_address: string;
  notes: string;
  candidate_visible_status: string;
  review_status: string;
  reviewer_notes: string | null;
  partial_credit: boolean;
  credited: boolean;
  submitted_at: string;
  matched_owner_id: string | null;
  matched_property_id: string | null;
  matched_owner?: {
    full_name: string | null;
    phone: string | null;
    whatsapp: string | null;
  } | null;
  matched_property?: {
    id: string;
    status: string | null;
    quartier: string | null;
    city: string | null;
  } | null;
};

type TalentApplication = {
  id: string;
  status: string;
  challenge_deadline_at: string | null;
  submitted_at: string | null;
  appeal_note: string | null;
  reviewer_score: number | null;
  reviewer_notes: string | null;
  talent_candidate_profiles: {
    full_name: string;
    email: string;
    phone: string;
    whatsapp: string | null;
    location: string;
    languages: string[];
    resume_path: string;
    resume_filename: string;
  };
  talent_jobs: {
    title: string;
    company_name: string;
  };
  talent_challenges: {
    title: string;
    target_leads: number;
  };
  leads: TalentLead[];
  metrics: {
    challengeSubmitted: boolean;
    completionRate: number;
    deadlineMet: boolean;
    validLeadCount: number;
    duplicateLeadCount: number;
    invalidLeadCount: number;
    totalLeadCount: number;
    reviewerScore: number | null;
  };
};

const appStatuses = [
  "applied",
  "challenge_assigned",
  "submitted",
  "under_review",
  "shortlisted",
  "rejected",
  "hired",
];

const leadReviewStatuses = [
  ["unreviewed", "Non revu"],
  ["valid_new", "Valide nouveau"],
  ["duplicate", "Doublon"],
  ["invalid", "Invalide"],
  ["converted", "Converti"],
];

const visibleStatusByReview: Record<string, string> = {
  unreviewed: "under_review",
  valid_new: "credited",
  duplicate: "duplicate",
  invalid: "rejected",
  converted: "converted",
};

function formatDate(value: string | null) {
  if (!value) return "Non défini";
  return new Date(value).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function statusColor(status: string) {
  if (status === "hired" || status === "shortlisted") return "bg-green-100 text-green-700";
  if (status === "rejected") return "bg-red-100 text-red-700";
  if (status === "submitted" || status === "under_review") return "bg-primary/10 text-primary";
  return "bg-neutral-100 text-neutral-600";
}

export function TalentAdminClient() {
  const [applications, setApplications] = useState<TalentApplication[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const selected = applications.find((application) => application.id === selectedId) ?? applications[0];

  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();
    return applications.filter((application) => {
      const profile = application.talent_candidate_profiles;
      const matchesSearch =
        !query ||
        profile.full_name.toLowerCase().includes(query) ||
        profile.email.toLowerCase().includes(query) ||
        profile.phone.toLowerCase().includes(query) ||
        application.leads.some((lead) =>
          [lead.owner_name, lead.owner_phone, lead.owner_address, lead.notes]
            .join(" ")
            .toLowerCase()
            .includes(query),
        );
      const matchesStatus =
        statusFilter === "all" || application.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [applications, search, statusFilter]);

  async function loadApplications() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/talent", { cache: "no-store" });
      const payload = await response.json();
      if (!payload.success) throw new Error(payload.error);
      setApplications(payload.applications ?? []);
      setSelectedId((current) => current ?? payload.applications?.[0]?.id ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadApplications();
  }, []);

  async function updateApplication(applicationId: string, updates: Record<string, unknown>) {
    setBusy(applicationId);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/talent/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const payload = await response.json();
      if (!payload.success) throw new Error(payload.error);
      await loadApplications();
      setMessage("Candidature mise à jour.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mise à jour impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function updateLead(leadId: string, updates: Record<string, unknown>) {
    setBusy(leadId);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/talent/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const payload = await response.json();
      if (!payload.success) throw new Error(payload.error);
      await loadApplications();
      setMessage("Contact mis à jour.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mise à jour impossible.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-primary">
            Roogo Talent
          </p>
          <h1 className="mt-2 text-3xl font-black text-neutral-950">
            Pipeline d&apos;évaluation
          </h1>
          <p className="mt-1 text-sm font-medium text-neutral-500">
            Profils, CV, contacts propriétaires, scoring et décisions internes.
          </p>
        </div>
        <Link
          href="/talent"
          className="inline-flex items-center justify-center rounded-full border border-neutral-200 bg-white px-5 py-3 text-sm font-black text-neutral-800 shadow-sm hover:bg-neutral-50"
        >
          Voir le lien candidat
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Candidats" value={applications.length} />
        <Metric
          label="Soumis"
          value={applications.filter((app) => app.metrics.challengeSubmitted).length}
        />
        <Metric
          label="Contacts valides"
          value={applications.reduce((total, app) => total + app.metrics.validLeadCount, 0)}
        />
        <Metric
          label="Recrutés"
          value={applications.filter((app) => app.status === "hired").length}
        />
      </div>

      {message && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm font-bold text-primary">
          {message}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:flex-row">
            <div className="flex flex-1 items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2">
              <MagnifyingGlassIcon size={16} className="text-neutral-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher candidat ou contact"
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
              />
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2">
              <FunnelIcon size={16} className="text-neutral-400" />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="bg-transparent text-sm font-black outline-none"
              >
                <option value="all">Tous</option>
                {appStatuses.map((status) => (
                  <option key={status} value={status}>
                    {formatTalentStatus(status)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
            {loading ? (
              <div className="flex items-center gap-2 p-6 text-sm font-bold text-neutral-500">
                <ArrowClockwiseIcon className="animate-spin" size={18} />
                Chargement...
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center text-sm font-bold text-neutral-400">
                Aucune candidature Talent.
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {filtered.map((application) => {
                  const profile = application.talent_candidate_profiles;
                  const isActive = selected?.id === application.id;
                  return (
                    <button
                      key={application.id}
                      type="button"
                      onClick={() => setSelectedId(application.id)}
                      className={cn(
                        "block w-full p-4 text-left transition hover:bg-neutral-50",
                        isActive && "bg-primary/5",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-black text-neutral-950">
                            {profile.full_name}
                          </p>
                          <p className="truncate text-xs font-semibold text-neutral-500">
                            {profile.email} · {profile.phone}
                          </p>
                        </div>
                        <span className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-black", statusColor(application.status))}>
                          {formatTalentStatus(application.status)}
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                        <MiniMetric label="Total" value={application.metrics.totalLeadCount} />
                        <MiniMetric label="Valides" value={application.metrics.validLeadCount} />
                        <MiniMetric label="Doublons" value={application.metrics.duplicateLeadCount} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {selected ? (
          <ApplicationReviewPanel
            application={selected}
            busy={busy}
            onUpdateApplication={updateApplication}
            onUpdateLead={updateLead}
          />
        ) : (
          <div className="rounded-lg border border-neutral-200 bg-white p-10 text-center text-sm font-bold text-neutral-400 shadow-sm">
            Sélectionnez une candidature.
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-3xl font-black text-neutral-950">{value}</p>
      <p className="mt-1 text-xs font-black uppercase tracking-widest text-neutral-400">
        {label}
      </p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white p-2">
      <p className="text-lg font-black text-neutral-950">{value}</p>
      <p className="text-[10px] font-black uppercase text-neutral-400">{label}</p>
    </div>
  );
}

function ApplicationReviewPanel({
  application,
  busy,
  onUpdateApplication,
  onUpdateLead,
}: {
  application: TalentApplication;
  busy: string | null;
  onUpdateApplication: (applicationId: string, updates: Record<string, unknown>) => Promise<void>;
  onUpdateLead: (leadId: string, updates: Record<string, unknown>) => Promise<void>;
}) {
  const [score, setScore] = useState(application.reviewer_score?.toString() ?? "");
  const [notes, setNotes] = useState(application.reviewer_notes ?? "");

  useEffect(() => {
    setScore(application.reviewer_score?.toString() ?? "");
    setNotes(application.reviewer_notes ?? "");
  }, [application.id, application.reviewer_notes, application.reviewer_score]);

  const profile = application.talent_candidate_profiles;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-lg font-black text-primary">
                {profile.full_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-2xl font-black text-neutral-950">{profile.full_name}</h2>
                <p className="text-sm font-semibold text-neutral-500">
                  {profile.location} · {profile.languages?.join(", ")}
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-2 text-sm font-semibold text-neutral-600">
              <p>{profile.email}</p>
              <p>{profile.phone}{profile.whatsapp ? ` · WhatsApp ${profile.whatsapp}` : ""}</p>
              <div className="flex items-center gap-2">
                <FilePdfIcon size={18} className="text-red-600" weight="fill" />
                {profile.resume_filename}
              </div>
            </div>
          </div>
          <select
            value={application.status}
            onChange={(event) =>
              void onUpdateApplication(application.id, { status: event.target.value })
            }
            className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm font-black outline-none"
          >
            {appStatuses.map((status) => (
              <option key={status} value={status}>
                {formatTalentStatus(status)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Contacts" value={application.metrics.totalLeadCount} />
        <Metric label="Valides" value={application.metrics.validLeadCount} />
        <Metric label="Doublons" value={application.metrics.duplicateLeadCount} />
        <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            {application.metrics.deadlineMet ? (
              <CheckCircleIcon size={22} className="text-green-600" weight="fill" />
            ) : (
              <WarningCircleIcon size={22} className="text-amber-500" weight="fill" />
            )}
            <p className="text-sm font-black text-neutral-950">
              {application.metrics.deadlineMet ? "Délai respecté" : "Délai non confirmé"}
            </p>
          </div>
          <p className="mt-2 text-xs font-semibold text-neutral-500">
            Soumis: {formatDate(application.submitted_at)}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <NotePencilIcon size={20} className="text-primary" weight="bold" />
          <h3 className="text-lg font-black text-neutral-950">Score interne</h3>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-[160px_1fr]">
          <label className="grid gap-2 text-sm font-bold text-neutral-700">
            Score 0-100
            <input
              value={score}
              onChange={(event) => setScore(event.target.value)}
              type="number"
              min={0}
              max={100}
              className="rounded-lg border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-neutral-700">
            Notes reviewer
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="min-h-24 rounded-lg border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-primary"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={busy === application.id}
          onClick={() =>
            void onUpdateApplication(application.id, {
              reviewerScore: score ? Number(score) : null,
              reviewerNotes: notes || null,
            })
          }
          className="mt-4 rounded-full bg-primary px-5 py-3 text-sm font-black text-white disabled:opacity-50"
        >
          Enregistrer l&apos;évaluation
        </button>
      </div>

      {application.appeal_note && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center gap-2 text-amber-800">
            <WarningCircleIcon size={20} weight="fill" />
            <p className="font-black">Explication candidat</p>
          </div>
          <p className="mt-2 text-sm leading-6 text-amber-900">{application.appeal_note}</p>
        </div>
      )}

      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-100 p-6">
          <h3 className="text-lg font-black text-neutral-950">Contacts propriétaires</h3>
          <p className="mt-1 text-sm font-semibold text-neutral-500">
            Vérifiez les leads, reliez-les aux propriétaires/annonces, puis exposez seulement un statut limité au candidat.
          </p>
        </div>
        <div className="divide-y divide-neutral-100">
          {application.leads.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center text-sm font-bold text-neutral-400">
              <UserCircleIcon size={36} />
              Aucun contact soumis.
            </div>
          ) : (
            application.leads.map((lead) => (
              <LeadReviewRow
                key={lead.id}
                lead={lead}
                busy={busy === lead.id}
                onUpdateLead={onUpdateLead}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function LeadReviewRow({
  lead,
  busy,
  onUpdateLead,
}: {
  lead: TalentLead;
  busy: boolean;
  onUpdateLead: (leadId: string, updates: Record<string, unknown>) => Promise<void>;
}) {
  const [reviewStatus, setReviewStatus] = useState(lead.review_status);
  const [reviewerNotes, setReviewerNotes] = useState(lead.reviewer_notes ?? "");

  useEffect(() => {
    setReviewStatus(lead.review_status);
    setReviewerNotes(lead.reviewer_notes ?? "");
  }, [lead.id, lead.review_status, lead.reviewer_notes]);

  return (
    <div className="grid gap-5 p-6 lg:grid-cols-[1fr_260px]">
      <div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-lg font-black text-neutral-950">{lead.owner_name}</p>
            <p className="text-sm font-semibold text-neutral-500">
              {lead.owner_phone} · {lead.owner_address}
            </p>
          </div>
          <span className="w-fit rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-700">
            Candidat: {lead.candidate_visible_status}
          </span>
        </div>
        <p className="mt-4 rounded-lg bg-neutral-50 p-4 text-sm leading-6 text-neutral-700">
          {lead.notes}
        </p>
        {lead.matched_owner && (
          <p className="mt-3 text-xs font-bold text-neutral-500">
            Propriétaire lié: {lead.matched_owner.full_name || "Sans nom"}
          </p>
        )}
        {lead.matched_property && (
          <p className="mt-1 text-xs font-bold text-neutral-500">
            Annonce liée: {lead.matched_property.quartier || "Annonce"} · {lead.matched_property.status || "statut inconnu"}
          </p>
        )}
      </div>
      <div className="space-y-3">
        <label className="grid gap-2 text-sm font-bold text-neutral-700">
          Statut review
          <select
            value={reviewStatus}
            onChange={(event) => setReviewStatus(event.target.value)}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-primary"
          >
            {leadReviewStatuses.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-bold text-neutral-700">
          Notes internes
          <textarea
            value={reviewerNotes}
            onChange={(event) => setReviewerNotes(event.target.value)}
            className="min-h-20 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void onUpdateLead(lead.id, {
              reviewStatus,
              candidateVisibleStatus: visibleStatusByReview[reviewStatus],
              reviewerNotes: reviewerNotes || null,
              partialCredit: reviewStatus === "duplicate",
              credited: ["valid_new", "converted"].includes(reviewStatus),
            })
          }
          className="w-full rounded-full bg-primary px-4 py-3 text-sm font-black text-white disabled:opacity-50"
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
}
