"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  FilePdfIcon,
  ImageIcon,
  SpinnerGapIcon,
  VideoCameraIcon,
  WhatsappLogoIcon,
} from "@phosphor-icons/react";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
  formatTimeLeft,
  getJobRole,
  timeLeft,
  type ApplicationStatus,
  type VideoTestListing,
} from "@/lib/job-applications";

type Row = {
  id: string;
  createdAt: string;
  fullName: string;
  phone: string;
  quartier: string;
  status: ApplicationStatus;
  hasVideo: boolean;
  salesCount: number;
};

type Sale = { propertyType: string; quartier: string; price: number; year: number; buyerSource: string };

type Detail = {
  id: string;
  createdAt: string;
  fullName: string;
  phone: string;
  quartier: string;
  email: string | null;
  cvUrl: string | null;
  cvIsPdf: boolean;
  sales: Sale[];
  reference: { name: string; phone: string; relation: string } | null;
  videoSignedUrl: string | null;
  videoUrl: string | null;
  listing: VideoTestListing | null;
  answers: Record<string, string>;
  canStartOnDate: boolean;
  availableFrom: string | null;
  status: ApplicationStatus;
  reviewerNotes: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
};

const STATUS_STYLES: Record<ApplicationStatus, string> = {
  nouveau: "bg-sky-50 text-sky-800",
  retenu: "bg-emerald-50 text-emerald-800",
  entretien: "bg-amber-50 text-amber-800",
  refuse: "bg-neutral-100 text-neutral-600",
};

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const fcfa = (n: number) => `${Number(n).toLocaleString("fr-FR")} FCFA`;
const waLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, "")}`;

function StatusChip({ status }: { status: ApplicationStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLES[status]}`}>
      {APPLICATION_STATUS_LABELS[status]}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-neutral-500">{children}</h3>;
}

export function RecrutementClient({ roleSlug }: { roleSlug: string }) {
  const role = getJobRole(roleSlug)!;
  const [filter, setFilter] = useState<ApplicationStatus | "tous">("tous");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setListError(null);
    const params = new URLSearchParams({ role: role.slug });
    if (filter !== "tous") params.set("status", filter);
    try {
      const res = await fetch(`/api/admin/recrutement/applications?${params}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error ?? `Erreur ${res.status}`);
      setRows(body.applications);
      setCounts(body.counts ?? {});
    } catch (err) {
      setRows([]);
      setListError(err instanceof Error ? err.message : "Impossible de charger les candidatures.");
    }
  }, [filter, role.slug]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setDetail(null);
    setDetailError(null);
    setSaveMessage(null);
    fetch(`/api/admin/recrutement/applications/${selectedId}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.success) throw new Error(body.error ?? `Erreur ${res.status}`);
        if (!cancelled) {
          setDetail(body.application);
          setNotes(body.application.reviewerNotes ?? "");
        }
      })
      .catch((err) => !cancelled && setDetailError(err instanceof Error ? err.message : "Erreur"));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function save(patch: { status?: ApplicationStatus; reviewerNotes?: string }) {
    if (!detail) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch(`/api/admin/recrutement/applications/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error ?? `Erreur ${res.status}`);
      setDetail({ ...detail, ...body.application });
      setSaveMessage("Enregistré.");
      void loadList();
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Impossible d'enregistrer.");
    } finally {
      setSaving(false);
    }
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const left = timeLeft(role);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-1 border-b border-neutral-200 pb-4">
        <h1 className="text-2xl font-extrabold text-neutral-900">Recrutement</h1>
        <p className="text-sm text-neutral-600">
          {role.title}. {left.closed ? "Candidatures closes." : `${formatTimeLeft(left)} avant la clôture (${role.deadlineLabel}).`}{" "}
          <a href={`/carrieres/${role.slug}`} target="_blank" rel="noopener" className="font-semibold text-[#8a4924] underline underline-offset-2">
            Page publique
          </a>
        </p>
      </header>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {(["tous", ...APPLICATION_STATUSES] as const).map((s) => {
          const active = filter === s;
          const n = s === "tous" ? total : counts[s] ?? 0;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold ${active ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500"}`}
            >
              {s === "tous" ? "Toutes" : APPLICATION_STATUS_LABELS[s]} <span className={active ? "text-white/70" : "text-neutral-400"}>{n}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <section className={selectedId ? "hidden lg:block" : ""} aria-label="Candidatures">
          {rows === null ? (
            <p className="flex items-center gap-2 py-6 text-sm text-neutral-500">
              <SpinnerGapIcon className="animate-spin" size={18} /> Chargement
            </p>
          ) : listError ? (
            <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-3 text-sm font-medium text-red-800">{listError}</p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-sm text-neutral-500">Aucune candidature{filter !== "tous" ? " avec ce statut" : ""} pour l&apos;instant.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-neutral-50 ${selectedId === row.id ? "bg-[#c96a2e]/5" : ""}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-neutral-900">{row.fullName}</span>
                      <span className="block text-xs text-neutral-500">
                        {row.quartier}, {row.salesCount} vente{row.salesCount > 1 ? "s" : ""}, {dateTime(row.createdAt)}
                      </span>
                    </span>
                    <StatusChip status={row.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Détail" className={selectedId ? "" : "hidden lg:block"}>
          {!selectedId ? (
            <p className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
              Choisis une candidature pour voir la vidéo, le CV et les réponses.
            </p>
          ) : detailError ? (
            <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-3 text-sm font-medium text-red-800">{detailError}</p>
          ) : !detail ? (
            <p className="flex items-center gap-2 py-6 text-sm text-neutral-500">
              <SpinnerGapIcon className="animate-spin" size={18} /> Chargement
            </p>
          ) : (
            <article className="space-y-6 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-6">
              <button type="button" onClick={() => setSelectedId(null)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-600 lg:hidden">
                <ArrowLeftIcon size={16} /> Liste
              </button>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-extrabold text-neutral-900">{detail.fullName}</h2>
                  <p className="mt-0.5 text-sm text-neutral-600">
                    {detail.quartier}. Reçue le {dateTime(detail.createdAt)}.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <a href={waLink(detail.phone)} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                      <WhatsappLogoIcon size={16} weight="fill" /> {detail.phone}
                    </a>
                    {detail.email ? <span className="text-neutral-600">{detail.email}</span> : null}
                    {detail.cvUrl ? (
                      <a href={detail.cvUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 font-semibold text-neutral-900 underline underline-offset-2">
                        {detail.cvIsPdf ? <FilePdfIcon size={16} /> : <ImageIcon size={16} />} CV
                      </a>
                    ) : null}
                  </div>
                </div>
                <StatusChip status={detail.status} />
              </div>

              <div>
                <Label>Test vidéo</Label>
                {detail.videoSignedUrl ? (
                  <video src={detail.videoSignedUrl} controls playsInline preload="metadata" className="mt-2 max-h-[70vh] w-full rounded-xl bg-black" />
                ) : detail.videoUrl ? (
                  <a href={detail.videoUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-900 underline underline-offset-2">
                    <VideoCameraIcon size={16} /> Ouvrir le lien de la vidéo <ArrowSquareOutIcon size={14} />
                  </a>
                ) : (
                  <p className="mt-2 text-sm text-neutral-500">Vidéo indisponible.</p>
                )}
                {detail.listing ? (
                  <p className="mt-2 text-sm text-neutral-600">
                    Bien montré :{" "}
                    <a href={detail.listing.path} target="_blank" rel="noopener" className="font-semibold text-neutral-900 underline underline-offset-2">
                      {detail.listing.reference ? `${detail.listing.reference}, ` : ""}
                      {detail.listing.headline}
                    </a>
                    {detail.listing.priceLabel ? `, ${detail.listing.priceLabel}` : ""}
                  </p>
                ) : null}
              </div>

              <div>
                <Label>Ventes</Label>
                <ul className="mt-2 divide-y divide-neutral-100">
                  {detail.sales.map((s, i) => (
                    <li key={i} className="py-2 text-sm">
                      <span className="font-semibold text-neutral-900">
                        {s.propertyType}, {s.quartier}, {fcfa(s.price)}, {s.year}
                      </span>
                      <span className="block text-neutral-600">{s.buyerSource}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {detail.reference ? (
                <div>
                  <Label>Référence</Label>
                  <p className="mt-2 text-sm text-neutral-800">
                    {detail.reference.name} ({detail.reference.relation}),{" "}
                    <a href={`tel:${detail.reference.phone}`} className="font-semibold underline underline-offset-2">{detail.reference.phone}</a>
                  </p>
                </div>
              ) : null}

              <div className="space-y-4">
                <Label>Mises en situation</Label>
                {role.questions.map((q, i) => (
                  <div key={q.id}>
                    <p className="text-sm font-semibold text-neutral-700">
                      {String.fromCharCode(97 + i)}) {q.label}
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm leading-6 text-neutral-900">{detail.answers[q.id] || "(vide)"}</p>
                  </div>
                ))}
                <p className="text-sm text-neutral-800">
                  <span className="font-semibold">Début :</span>{" "}
                  {detail.canStartOnDate
                    ? `peut commencer le ${role.startDateLabel}`
                    : `à partir du ${detail.availableFrom ? new Date(`${detail.availableFrom}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" }) : "?"}`}
                </p>
              </div>

              <div className="space-y-3 border-t border-neutral-200 pt-4">
                <Label>Décision</Label>
                <div className="flex flex-wrap gap-2">
                  {APPLICATION_STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={saving || detail.status === s}
                      onClick={() => save({ status: s })}
                      className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold disabled:cursor-default ${detail.status === s ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500"}`}
                    >
                      {APPLICATION_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
                <label className="block">
                  <span className="text-sm font-semibold text-neutral-800">Notes</span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={4000}
                    className="mt-1.5 block min-h-24 w-full rounded-xl border border-neutral-300 px-3.5 py-3 text-sm focus:border-[#c96a2e] focus:outline-none focus:ring-2 focus:ring-[#c96a2e]/20"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={saving || notes === detail.reviewerNotes}
                    onClick={() => save({ reviewerNotes: notes })}
                    className="rounded-full bg-[#c96a2e] px-4 py-2 text-sm font-bold text-white hover:bg-[#8a4924] disabled:opacity-50"
                  >
                    Enregistrer les notes
                  </button>
                  {saveMessage ? <span className="text-sm text-neutral-600">{saveMessage}</span> : null}
                  {detail.reviewedAt ? (
                    <span className="text-xs text-neutral-500">
                      Dernière modification {detail.reviewedByName ? `par ${detail.reviewedByName} ` : ""}le {dateTime(detail.reviewedAt)}
                    </span>
                  ) : null}
                </div>
              </div>
            </article>
          )}
        </section>
      </div>
    </div>
  );
}
