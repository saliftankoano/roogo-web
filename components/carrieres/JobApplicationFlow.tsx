"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowSquareOutIcon,
  CheckCircleIcon,
  FileArrowUpIcon,
  LinkSimpleIcon,
  LockSimpleIcon,
  PlusIcon,
  SpinnerGapIcon,
  TrashIcon,
  VideoCameraIcon,
} from "@phosphor-icons/react";
import { compressImageToBase64 } from "@/lib/clientImageCompression";
import {
  ANSWER_MAX,
  APPLICATIONS_CLOSED_MESSAGE,
  SALE_PROPERTY_TYPES,
  buildApplicationSchema,
  firstIssueMessage,
  getJobRole,
  isAllowedVideoLink,
  isApplicationOpen,
  resolveUploadMime,
  stepSalesSchema,
  stepYouSchema,
  uploadSizeError,
  videoDurationError,
  type UploadKind,
  type VideoTestListing,
} from "@/lib/job-applications";
import { useNow } from "./JobDeadlineBadge";

// Four short steps, mobile first (most candidates are on Android phones with
// costly data). The draft, including the paths of files already sent, stays
// in this browser between steps and reloads, and is cleared once sent.

type SaleDraft = { propertyType: string; quartier: string; price: string; year: string; buyerSource: string };
type UploadedFile = { path: string; name: string; size: number };

type Draft = {
  step: 1 | 2 | 3 | 4;
  fullName: string;
  phone: string;
  quartier: string;
  email: string;
  cv: UploadedFile | null;
  sales: SaleDraft[];
  reference: { name: string; phone: string; relation: string };
  videoMode: "file" | "link";
  video: UploadedFile | null;
  videoUrl: string;
  listing: VideoTestListing | null;
  answers: Record<string, string>;
  canStartOnDate: boolean;
  availableFrom: string;
  consent: boolean;
};

const emptySale = (): SaleDraft => ({ propertyType: "", quartier: "", price: "", year: "", buyerSource: "" });

const STEP_TITLES = ["Toi", "Tes ventes", "Le test vidéo", "Mises en situation"] as const;

function newDraft(listing: VideoTestListing | null): Draft {
  return {
    step: 1,
    fullName: "",
    phone: "",
    quartier: "",
    email: "",
    cv: null,
    sales: [emptySale()],
    reference: { name: "", phone: "", relation: "" },
    videoMode: "file",
    video: null,
    videoUrl: "",
    listing,
    answers: {},
    canStartOnDate: true,
    availableFrom: "",
    consent: false,
  };
}

const storageKey = (slug: string) => `roogo:candidature:${slug}:v1`;
const sentKey = (slug: string) => `roogo:candidature:${slug}:envoyee`;

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // private mode or full storage: the form still works, it just won't resume
  }
}

const filledSales = (sales: SaleDraft[]) =>
  sales
    .filter((s) => Object.values(s).some((v) => v.trim() !== ""))
    .map((s) => ({ ...s, price: s.price.replace(/\D/g, "") }));

const formatMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} Mo`;

// ---------------------------------------------------------------------------
// Upload: signed URL from our API, then a PUT straight to Supabase Storage
// with progress. The bucket checks type and size at PUT time (413 / 415).

class UploadFailure extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

function base64ToBlob(base64: string, type: string): Blob {
  const bytes = atob(base64);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) out[i] = bytes.charCodeAt(i);
  return new Blob([out], { type });
}

async function prepareCv(file: File): Promise<{ blob: Blob; type: string; name: string }> {
  const mime = resolveUploadMime("cv", file.type, file.name);
  const isImage = (mime && mime.startsWith("image/")) || /\.(hei[cf]|jpe?g|png|webp)$/i.test(file.name) || file.type.startsWith("image/");
  if (mime === "application/pdf") return { blob: file, type: mime, name: file.name };
  if (!isImage) throw new UploadFailure("CV : PDF ou photo seulement.", false);
  // Photos (HEIC included) are resized to 1920 px and re-encoded as JPEG.
  const compressed = await compressImageToBase64(file);
  if (compressed.ext !== "jpg") {
    throw new UploadFailure("Cette photo ne peut pas être lue. Essaie une autre photo ou un PDF.", false);
  }
  return { blob: base64ToBlob(compressed.data, "image/jpeg"), type: "image/jpeg", name: file.name.replace(/\.[^.]+$/, ".jpg") };
}

async function uploadFile(
  slug: string,
  kind: UploadKind,
  blob: Blob,
  fileName: string,
  type: string,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch("/api/careers/job-applications/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: slug, kind, contentType: type, fileName, size: blob.size }),
    signal,
  }).catch(() => null);
  if (!res) throw new UploadFailure("Pas de connexion. Vérifie ton réseau puis réessaie.", true);
  const body = (await res.json().catch(() => ({}))) as { signedUrl?: string; path?: string; contentType?: string; error?: string };
  if (!res.ok || !body.signedUrl || !body.path) {
    throw new UploadFailure(body.error ?? `Envoi refusé (${res.status}).`, res.status >= 500 || res.status === 429);
  }

  const status = await new Promise<number>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", body.signedUrl!);
    xhr.setRequestHeader("Content-Type", body.contentType ?? type);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => resolve(0);
    xhr.ontimeout = () => resolve(0);
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(blob);
  });

  if (status >= 200 && status < 300) return body.path;
  if (status === 0) throw new UploadFailure("La connexion a coupé pendant l'envoi.", true);
  if (status === 413) {
    throw new UploadFailure("Fichier trop lourd pour le serveur. Compresse la vidéo ou colle un lien.", false);
  }
  if (status === 415 || status === 400) {
    throw new UploadFailure("Format refusé. Vidéo MP4, MOV ou WebM ; CV en PDF ou photo.", false);
  }
  throw new UploadFailure(`Envoi interrompu (${status}). Réessaie.`, true);
}

function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (value: number | null) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => done(null), 5000);
    video.preload = "metadata";
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

// ---------------------------------------------------------------------------
// Small inputs

const inputClass =
  "mt-1.5 block w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-3 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-[#c96a2e] focus:outline-none focus:ring-2 focus:ring-[#c96a2e]/20";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-neutral-800">{label}</span>
      {hint ? <span className="ml-1 text-sm text-neutral-500">{hint}</span> : null}
      {children}
    </label>
  );
}

function ProgressBar({ fraction }: { fraction: number }) {
  return (
    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200" role="progressbar" aria-valuenow={Math.round(fraction * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-[#c96a2e] transition-[width] duration-300" style={{ width: `${Math.round(fraction * 100)}%` }} />
    </div>
  );
}

type UploadState = { status: "idle" } | { status: "uploading"; fraction: number; name: string } | { status: "error"; message: string; retryable: boolean };

function FilePicker({
  kind,
  accept,
  uploaded,
  state,
  onPick,
  onRetry,
  onRemove,
  label,
  emptyText,
}: {
  kind: UploadKind;
  accept: string;
  uploaded: UploadedFile | null;
  state: UploadState;
  onPick: (file: File) => void;
  onRetry: () => void;
  onRemove: () => void;
  label: string;
  emptyText: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const Icon = kind === "video" ? VideoCameraIcon : FileArrowUpIcon;

  if (uploaded && state.status !== "uploading") {
    return (
      <div className="mt-1.5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3">
        <CheckCircleIcon size={22} weight="fill" className="shrink-0 text-emerald-600" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-neutral-900">{uploaded.name}</p>
          <p className="text-xs text-neutral-600">Envoyé, {formatMb(uploaded.size)}</p>
        </div>
        <button type="button" onClick={onRemove} className="rounded-full p-2 text-neutral-500 hover:bg-white hover:text-neutral-800" aria-label={`Retirer ${label}`}>
          <TrashIcon size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="mt-1.5">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
      {state.status === "uploading" ? (
        <div className="rounded-xl border border-neutral-300 bg-white px-3.5 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
            <SpinnerGapIcon size={18} className="animate-spin text-[#c96a2e]" />
            Envoi en cours, {Math.round(state.fraction * 100)} %
          </p>
          <p className="mt-0.5 truncate text-xs text-neutral-500">{state.name}. Garde cette page ouverte.</p>
          <ProgressBar fraction={state.fraction} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center gap-3 rounded-xl border border-dashed border-neutral-400 bg-white px-3.5 py-4 text-left hover:border-[#c96a2e]"
        >
          <Icon size={24} className="shrink-0 text-[#c96a2e]" />
          <span className="text-sm font-semibold text-neutral-800">{emptyText}</span>
        </button>
      )}
      {state.status === "error" ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-medium text-red-700">{state.message}</span>
          {state.retryable ? (
            <button type="button" onClick={onRetry} className="font-bold text-[#8a4924] underline underline-offset-2">
              Réessayer
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function JobApplicationFlow({
  slug,
  listing,
  renderedAt,
}: {
  slug: string;
  listing: VideoTestListing | null;
  renderedAt: string;
}) {
  const role = getJobRole(slug)!;
  const now = useNow(renderedAt);
  const open = isApplicationOpen(role, now);

  const [draft, setDraft] = useState<Draft>(() => newDraft(listing));
  const [loaded, setLoaded] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cvState, setCvState] = useState<UploadState>({ status: "idle" });
  const [videoState, setVideoState] = useState<UploadState>({ status: "idle" });
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [website, setWebsite] = useState(""); // honeypot
  const lastFiles = useRef<Partial<Record<UploadKind, File>>>({});
  const aborts = useRef<Partial<Record<UploadKind, AbortController>>>({});
  const topRef = useRef<HTMLDivElement>(null);

  // Restore the draft (and a sent application) saved in this browser.
  useEffect(() => {
    if (readStorage(sentKey(slug))) setSent(true);
    const saved = readStorage(storageKey(slug));
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<Draft>;
        setDraft((d) => ({ ...d, ...parsed, listing: parsed.listing ?? d.listing }));
      } catch {
        writeStorage(storageKey(slug), null);
      }
    }
    setLoaded(true);
  }, [slug]);

  useEffect(() => {
    if (loaded && !sent) writeStorage(storageKey(slug), JSON.stringify(draft));
  }, [draft, loaded, sent, slug]);

  const update = useCallback((patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch })), []);

  const goTo = (step: Draft["step"]) => {
    setError(null);
    update({ step });
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const startUpload = useCallback(
    async (kind: UploadKind, file: File) => {
      lastFiles.current[kind] = file;
      const setState = kind === "cv" ? setCvState : setVideoState;
      aborts.current[kind]?.abort();
      const controller = new AbortController();
      aborts.current[kind] = controller;
      try {
        setState({ status: "uploading", fraction: 0, name: file.name });
        let blob: Blob = file;
        let type = resolveUploadMime(kind, file.type, file.name) ?? "";
        let name = file.name;
        if (kind === "cv") {
          ({ blob, type, name } = await prepareCv(file));
        } else {
          if (!type) throw new UploadFailure("Vidéo : MP4, MOV ou WebM seulement. Sinon, colle un lien.", false);
          // Checked before sending, so a candidate never spends data on a video we refuse.
          const seconds = await readVideoDuration(file);
          setVideoDuration(seconds);
          const durationProblem = videoDurationError(seconds);
          if (durationProblem) throw new UploadFailure(durationProblem, false);
        }
        const tooBig = uploadSizeError(kind, blob.size);
        if (tooBig) throw new UploadFailure(kind === "video" ? `${tooBig} Compresse-la ou colle un lien.` : tooBig, false);
        const path = await uploadFile(
          slug,
          kind,
          blob,
          name,
          type,
          (fraction) => setState({ status: "uploading", fraction, name }),
          controller.signal,
        );
        const uploaded = { path, name, size: blob.size };
        update(kind === "cv" ? { cv: uploaded } : { video: uploaded });
        setState({ status: "idle" });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : "Envoi impossible.";
        console.warn(`[candidature] ${kind} upload failed:`, message);
        setState({ status: "error", message, retryable: err instanceof UploadFailure ? err.retryable : true });
      }
    },
    [slug, update],
  );

  // -------------------------------------------------------------------------
  // Step checks

  async function nextFromYou() {
    const result = stepYouSchema.safeParse({ ...draft, cvPath: draft.cv?.path ?? "" });
    if (!result.success) return setError(firstIssueMessage(result.error));
    setBusy(true);
    try {
      const res = await fetch("/api/careers/job-applications/check-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: slug, phone: draft.phone }),
      });
      const body = (await res.json().catch(() => ({}))) as { alreadyApplied?: boolean; message?: string; error?: string };
      if (body.alreadyApplied) return setError(body.message ?? "Ce numéro a déjà postulé.");
      if (!res.ok && body.error) return setError(body.error);
    } catch {
      // offline check: the server checks again on submit
    } finally {
      setBusy(false);
    }
    goTo(2);
  }

  function nextFromSales() {
    const result = stepSalesSchema.safeParse({ sales: filledSales(draft.sales), reference: draft.reference });
    if (!result.success) return setError(firstIssueMessage(result.error));
    goTo(3);
  }

  function nextFromVideo() {
    if (draft.videoMode === "file" && !draft.video) {
      return setError(videoState.status === "uploading" ? "Attends la fin de l'envoi de la vidéo." : "Ajoute ta vidéo, ou colle un lien.");
    }
    if (draft.videoMode === "file" && videoDurationError(videoDuration)) {
      return setError(videoDurationError(videoDuration) as string);
    }
    if (draft.videoMode === "link" && !isAllowedVideoLink(draft.videoUrl)) {
      return setError("Colle un lien TikTok, YouTube, Google Drive ou Facebook.");
    }
    goTo(4);
  }

  async function submit() {
    const payload = {
      role: slug,
      website,
      fullName: draft.fullName,
      phone: draft.phone,
      quartier: draft.quartier,
      email: draft.email,
      cvPath: draft.cv?.path ?? "",
      sales: filledSales(draft.sales),
      reference: draft.reference,
      videoPath: draft.videoMode === "file" ? draft.video?.path ?? null : null,
      videoUrl: draft.videoMode === "link" ? draft.videoUrl.trim() : null,
      listingId: draft.listing?.id ?? null,
      answers: Object.fromEntries(role.questions.map((q) => [q.id, draft.answers[q.id] ?? ""])),
      canStartOnDate: draft.canStartOnDate,
      availableFrom: draft.canStartOnDate ? null : draft.availableFrom || null,
      consent: draft.consent,
    };
    const check = buildApplicationSchema(role).safeParse(payload);
    if (!check.success) return setError(firstIssueMessage(check.error));

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/careers/job-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; field?: string };
      if (!res.ok || !body.success) {
        if (body.field === "cvPath") update({ cv: null });
        if (body.field === "videoPath") update({ video: null });
        return setError(body.error ?? `Envoi impossible (${res.status}). Réessaie.`);
      }
      writeStorage(storageKey(slug), null);
      writeStorage(sentKey(slug), new Date().toISOString());
      setSent(true);
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      setError("Pas de connexion. Tes réponses sont gardées sur ce téléphone : réessaie quand le réseau revient.");
    } finally {
      setBusy(false);
    }
  }

  // -------------------------------------------------------------------------

  const shell = "rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7";

  if (sent) {
    return (
      <div ref={topRef} className={shell}>
        <CheckCircleIcon size={40} weight="fill" className="text-emerald-600" />
        <h2 className="mt-4 text-2xl font-extrabold">Candidature reçue.</h2>
        <p className="mt-2 text-base leading-7 text-neutral-700">{role.confirmation}</p>
        <Link href="/proprietes?transaction=vendre" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#8a4924] underline underline-offset-2">
          Voir nos biens en vente
          <ArrowRightIcon size={16} weight="bold" />
        </Link>
      </div>
    );
  }

  if (!open) {
    return (
      <div ref={topRef} className={shell}>
        <LockSimpleIcon size={36} className="text-neutral-500" />
        <h2 className="mt-4 text-2xl font-extrabold">{APPLICATIONS_CLOSED_MESSAGE}</h2>
        <p className="mt-2 text-base leading-7 text-neutral-700">
          Merci de ton intérêt. Les prochaines offres seront publiées sur la page Carrières.
        </p>
        <Link href="/carrieres" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#8a4924] underline underline-offset-2">
          Voir la page Carrières
          <ArrowRightIcon size={16} weight="bold" />
        </Link>
      </div>
    );
  }

  const step = draft.step;

  return (
    <div ref={topRef} className={`${shell} scroll-mt-24`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-neutral-500">
          Étape {step} sur 4
        </p>
        <p className="text-sm font-bold text-neutral-900">{STEP_TITLES[step - 1]}</p>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5" aria-hidden>
        {STEP_TITLES.map((t, i) => (
          <div key={t} className={`h-1.5 rounded-full ${i < step ? "bg-[#c96a2e]" : "bg-neutral-200"}`} />
        ))}
      </div>

      {/* Honeypot: hidden from people, bots fill it. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Site web
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" />
        </label>
      </div>

      <div className="mt-6 space-y-5">
        {step === 1 ? (
          <>
            <Field label="Nom complet">
              <input className={inputClass} value={draft.fullName} onChange={(e) => update({ fullName: e.target.value })} autoComplete="name" />
            </Field>
            <Field label="Téléphone WhatsApp">
              <div className="mt-1.5 flex items-stretch overflow-hidden rounded-xl border border-neutral-300 bg-white focus-within:border-[#c96a2e] focus-within:ring-2 focus-within:ring-[#c96a2e]/20">
                <span className="flex items-center border-r border-neutral-200 bg-neutral-50 px-3 text-base font-semibold text-neutral-600">+226</span>
                <input
                  className="w-full px-3.5 py-3 text-base text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
                  value={draft.phone}
                  onChange={(e) => update({ phone: e.target.value })}
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="70 12 34 56"
                />
              </div>
            </Field>
            <Field label="Quartier où tu habites">
              <input className={inputClass} value={draft.quartier} onChange={(e) => update({ quartier: e.target.value })} placeholder="Ex. Karpala" />
            </Field>
            <Field label="Email" hint="(optionnel)">
              <input className={inputClass} type="email" value={draft.email} onChange={(e) => update({ email: e.target.value })} autoComplete="email" inputMode="email" />
            </Field>
            <div>
              <span className="text-sm font-semibold text-neutral-800">CV</span>
              <span className="ml-1 text-sm text-neutral-500">(PDF ou photo, 10 Mo max.)</span>
              <FilePicker
                kind="cv"
                accept="application/pdf,image/*"
                uploaded={draft.cv}
                state={cvState}
                onPick={(file) => startUpload("cv", file)}
                onRetry={() => lastFiles.current.cv && startUpload("cv", lastFiles.current.cv)}
                onRemove={() => update({ cv: null })}
                label="le CV"
                emptyText="Choisir un PDF ou prendre une photo du CV"
              />
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div>
              <h3 className="text-base font-bold">Tes 3 dernières ventes</h3>
              <p className="mt-1 text-sm text-neutral-600">Au moins une. Des ventes réelles : on peut vérifier.</p>
            </div>
            {draft.sales.map((sale, index) => {
              const set = (patch: Partial<SaleDraft>) =>
                update({ sales: draft.sales.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
              return (
                <div key={index} role="group" aria-label={`Vente ${index + 1}`} className="space-y-3 border-t border-neutral-200 pt-4">
                  <div className="flex w-full items-center justify-between text-sm font-bold text-neutral-900">
                    Vente {index + 1}
                    {draft.sales.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => update({ sales: draft.sales.filter((_, i) => i !== index) })}
                        className="rounded-full p-1.5 text-neutral-500 hover:bg-neutral-100"
                        aria-label={`Retirer la vente ${index + 1}`}
                      >
                        <TrashIcon size={16} />
                      </button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Type de bien">
                      <select className={inputClass} value={sale.propertyType} onChange={(e) => set({ propertyType: e.target.value })}>
                        <option value="">Choisir</option>
                        {SALE_PROPERTY_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Quartier">
                      <input className={inputClass} value={sale.quartier} onChange={(e) => set({ quartier: e.target.value })} />
                    </Field>
                    <Field label="Prix (FCFA)">
                      <input className={inputClass} value={sale.price} onChange={(e) => set({ price: e.target.value })} inputMode="numeric" placeholder="25 000 000" />
                    </Field>
                    <Field label="Année">
                      <input className={inputClass} value={sale.year} onChange={(e) => set({ year: e.target.value })} inputMode="numeric" placeholder="2025" maxLength={4} />
                    </Field>
                  </div>
                  <Field label="Comment tu as trouvé l'acheteur">
                    <input className={inputClass} value={sale.buyerSource} onChange={(e) => set({ buyerSource: e.target.value })} maxLength={300} placeholder="Ex. recommandation d'un ancien client" />
                  </Field>
                </div>
              );
            })}
            {draft.sales.length < 3 ? (
              <button
                type="button"
                onClick={() => update({ sales: [...draft.sales, emptySale()] })}
                className="inline-flex items-center gap-2 text-sm font-bold text-[#8a4924]"
              >
                <PlusIcon size={16} weight="bold" />
                Ajouter une vente
              </button>
            ) : null}

            <div role="group" aria-label="Une référence" className="space-y-3 border-t border-neutral-200 pt-4">
              <h3 className="text-base font-bold">Une référence</h3>
              <p className="text-sm text-neutral-600">Quelqu&apos;un qui peut confirmer tes ventes : ancien patron, client, notaire.</p>
              <Field label="Nom">
                <input className={inputClass} value={draft.reference.name} onChange={(e) => update({ reference: { ...draft.reference, name: e.target.value } })} />
              </Field>
              <Field label="Téléphone">
                <input className={inputClass} value={draft.reference.phone} onChange={(e) => update({ reference: { ...draft.reference, phone: e.target.value } })} inputMode="tel" placeholder="70 12 34 56" />
              </Field>
              <Field label="Lien avec toi">
                <input className={inputClass} value={draft.reference.relation} onChange={(e) => update({ reference: { ...draft.reference, relation: e.target.value } })} placeholder="Ex. ancien patron" />
              </Field>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            {draft.listing ? (
              <div className="overflow-hidden rounded-2xl border border-neutral-200">
                <div className="relative aspect-[16/10] w-full bg-neutral-100">
                  <Image src={draft.listing.image} alt={draft.listing.headline} fill sizes="(min-width: 1024px) 520px, 100vw" className="object-cover" />
                </div>
                <div className="p-4">
                  <p className="text-base font-bold leading-snug">{draft.listing.headline}</p>
                  <p className="mt-1 text-sm text-neutral-600">{draft.listing.quartier}</p>
                  {draft.listing.priceLabel ? <p className="mt-1 text-lg font-extrabold text-[#8a4924]">{draft.listing.priceLabel}</p> : null}
                  <a
                    href={draft.listing.path}
                    target="_blank"
                    rel="noopener"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-neutral-900 underline underline-offset-2"
                  >
                    Voir l&apos;annonce
                    <ArrowSquareOutIcon size={16} />
                  </a>
                </div>
              </div>
            ) : (
              <p className="rounded-2xl bg-neutral-100 p-4 text-sm text-neutral-700">
                Choisis un de nos biens en vente sur{" "}
                <a href="/proprietes?transaction=vendre" target="_blank" rel="noopener" className="font-bold underline">
                  roogobf.com/proprietes
                </a>
                .
              </p>
            )}

            <p className="text-base font-semibold leading-7 text-neutral-900">
              Enregistre une vidéo de 60 à 90 secondes où tu vends ce bien à un acheteur. Parle comme si l&apos;acheteur était devant toi.
            </p>

            <div className="grid grid-cols-2 gap-1 rounded-full bg-neutral-100 p-1 text-sm font-bold" role="tablist">
              {(["file", "link"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={draft.videoMode === mode}
                  onClick={() => update({ videoMode: mode })}
                  className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-2.5 ${draft.videoMode === mode ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
                >
                  {mode === "file" ? <VideoCameraIcon size={16} /> : <LinkSimpleIcon size={16} />}
                  {mode === "file" ? "Envoyer la vidéo" : "Coller un lien"}
                </button>
              ))}
            </div>

            {draft.videoMode === "file" ? (
              <div>
                <FilePicker
                  kind="video"
                  accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
                  uploaded={draft.video}
                  state={videoState}
                  onPick={(file) => startUpload("video", file)}
                  onRetry={() => lastFiles.current.video && startUpload("video", lastFiles.current.video)}
                  onRemove={() => {
                    update({ video: null });
                    setVideoDuration(null);
                  }}
                  label="la vidéo"
                  emptyText="Choisir la vidéo (MP4, MOV ou WebM, 150 Mo max.)"
                />
                <p className="mt-2 text-xs text-neutral-500">
                  Connexion lente ? Publie la vidéo sur TikTok, YouTube, Google Drive ou Facebook et colle le lien.
                </p>
              </div>
            ) : (
              <Field label="Lien de ta vidéo" hint="(TikTok, YouTube, Google Drive ou Facebook)">
                <input
                  className={inputClass}
                  value={draft.videoUrl}
                  onChange={(e) => update({ videoUrl: e.target.value })}
                  inputMode="url"
                  placeholder="https://"
                />
                <span className="mt-1.5 block text-xs text-neutral-500">Vérifie que la vidéo est visible par tous ceux qui ont le lien.</span>
              </Field>
            )}
          </>
        ) : null}

        {step === 4 ? (
          <>
            {role.questions.map((q, i) => {
              const value = draft.answers[q.id] ?? "";
              return (
                <label key={q.id} className="block">
                  <span className="text-sm font-semibold leading-6 text-neutral-900">
                    {String.fromCharCode(97 + i)}) {q.label}
                  </span>
                  <textarea
                    className={`${inputClass} min-h-28 resize-y`}
                    value={value}
                    maxLength={ANSWER_MAX}
                    onChange={(e) => update({ answers: { ...draft.answers, [q.id]: e.target.value } })}
                  />
                  <span className={`mt-1 block text-right text-xs ${value.length >= ANSWER_MAX ? "font-bold text-[#8a4924]" : "text-neutral-500"}`}>
                    {value.length} / {ANSWER_MAX}
                  </span>
                </label>
              );
            })}

            <div className="space-y-3 border-t border-neutral-200 pt-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[#c96a2e]"
                  checked={draft.canStartOnDate}
                  onChange={(e) => update({ canStartOnDate: e.target.checked })}
                />
                <span className="text-sm font-semibold text-neutral-900">Je peux commencer le {role.startDateLabel}</span>
              </label>
              {!draft.canStartOnDate ? (
                <Field label="Sinon, à partir de quelle date ?">
                  <input
                    className={inputClass}
                    type="date"
                    min={role.startDate}
                    value={draft.availableFrom}
                    onChange={(e) => update({ availableFrom: e.target.value })}
                  />
                </Field>
              ) : null}
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[#c96a2e]"
                  checked={draft.consent}
                  onChange={(e) => update({ consent: e.target.checked })}
                />
                <span className="text-sm text-neutral-700">
                  J&apos;accepte que Roogo utilise ces informations et ma vidéo uniquement pour ce recrutement.
                </span>
              </label>
            </div>
          </>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-5 rounded-xl bg-red-50 px-3.5 py-3 text-sm font-medium text-red-800">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex items-center gap-3">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => goTo((step - 1) as Draft["step"])}
            className="inline-flex items-center justify-center gap-1.5 rounded-full border border-neutral-300 px-4 py-3.5 text-sm font-bold text-neutral-700 hover:bg-neutral-50"
          >
            <ArrowLeftIcon size={16} weight="bold" />
            <span className="sr-only sm:not-sr-only">Retour</span>
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy || cvState.status === "uploading" || videoState.status === "uploading"}
          onClick={() => {
            if (step === 1) void nextFromYou();
            else if (step === 2) nextFromSales();
            else if (step === 3) nextFromVideo();
            else void submit();
          }}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#c96a2e] px-5 py-3.5 text-base font-bold text-white shadow-lg shadow-[#c96a2e]/20 hover:bg-[#8a4924] disabled:opacity-60"
        >
          {busy ? <SpinnerGapIcon size={18} className="animate-spin" /> : null}
          {step === 4 ? "Envoyer ma candidature" : "Continuer"}
          {step < 4 && !busy ? <ArrowRightIcon size={18} weight="bold" /> : null}
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-neutral-500">Tes réponses sont gardées sur ce téléphone jusqu&apos;à l&apos;envoi.</p>
    </div>
  );
}

