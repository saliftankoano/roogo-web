"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowCounterClockwiseIcon,
  CardsThreeIcon,
  CheckCircleIcon,
  DownloadSimpleIcon,
  SpinnerGapIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import {
  DEFAULT_TREATMENT,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  carouselSlidePage,
  parseCarouselSpec,
  slideFileName,
  type CarouselSlide,
  type CarouselSpec,
} from "@/lib/studio/carousel";
import { renderSlideJpeg } from "@/lib/studio/carousel-export";
import { PublicationCard } from "./publishing/PublicationCard";

const BADGE_URL = "/studio/carousel-badge-roogo.png";
const BUCKET = "content-studio";
const ease = [0.22, 1, 0.36, 1] as const;

/** A carousel picked from disk, not yet in the Studio: previewed from local files. */
export type CarouselDraft = { spec: CarouselSpec; files: Map<string, File> };

type Source = { kind: "draft"; draft: CarouselDraft } | { kind: "saved"; artifactId: string };

type View = {
  spec: CarouselSpec;
  photoUrls: Record<string, string>;
  library: string[];
  slides: string[];
  renderedAt: string | null;
};

async function readError(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return (data as { error?: string }).error ?? `Erreur ${res.status}`;
}

async function uploadSigned(path: string, token: string, body: Blob, contentType: string) {
  const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(path, token, body, { contentType, upsert: true });
  if (error) throw new Error(`Envoi impossible : ${error.message}`);
}

/** One slide drawn live, exactly as it will be exported, scaled to `width`. */
export function SlideFrame({
  spec,
  index,
  resolve,
  width,
  className,
}: {
  spec: CarouselSpec;
  index: number;
  resolve: (ref: string) => string;
  width: number;
  className?: string;
}) {
  const html = useMemo(() => carouselSlidePage(spec, index, { photoUrl: resolve, badgeUrl: BADGE_URL }), [spec, index, resolve]);
  // `width` is the most it takes; on a phone it shrinks to the space it has.
  const box = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState(width);
  useEffect(() => {
    const el = box.current?.parentElement;
    if (!el) return;
    const measure = () => setFit(Math.min(width, el.clientWidth || width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);
  const scale = fit / SLIDE_WIDTH;
  return (
    <div ref={box} className={cn("relative overflow-hidden bg-neutral-200", className)} style={{ width: fit, height: SLIDE_HEIGHT * scale }}>
      <iframe
        title={`Slide ${index}`}
        srcDoc={html}
        sandbox="allow-same-origin"
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
        style={{ width: SLIDE_WIDTH, height: SLIDE_HEIGHT, transform: `scale(${scale})` }}
      />
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="flex items-center justify-between text-xs font-semibold text-neutral-600">
        {label}
        <span className="tabular-nums text-neutral-400">{Math.round(value * 100)} %</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer accent-[#C96A2E]"
      />
    </label>
  );
}

const field =
  "w-full rounded-2xl border border-neutral-200 bg-white px-3.5 py-2.5 text-[15px] text-neutral-900 outline-none focus:border-primary disabled:bg-neutral-50";

/**
 * A social carousel in the Studio (2026-10-22). Everything visual stays a
 * setting of the carousel file (Salif: modular, never baked): the photo of
 * each slide, its framing, brightness and darkening, and the texts. The JPEG
 * slides are rebuilt from it when you press "Enregistrer".
 */
export function CarouselStudio({
  source,
  canWrite,
  madeBy,
  onImported,
  onChanged,
}: {
  source: Source;
  canWrite: boolean;
  madeBy: string | null;
  onImported?: (conversationId: string) => void;
  onChanged?: () => void;
}) {
  const [view, setView] = useState<View | null>(null);
  const [artifactId, setArtifactId] = useState<string | null>(source.kind === "saved" ? source.artifactId : null);
  const [selected, setSelected] = useState(0);
  const [dirty, setDirty] = useState(source.kind === "draft");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const localUrls = useRef(new Map<string, string>());
  const draftFiles = useRef(new Map<string, File>());
  const fileInput = useRef<HTMLInputElement | null>(null);

  // Local files (a draft, or photos just added) show at once from memory.
  const localUrl = useCallback((key: string, file: File) => {
    let url = localUrls.current.get(key);
    if (!url) {
      url = URL.createObjectURL(file);
      localUrls.current.set(key, url);
    }
    return url;
  }, []);
  useEffect(() => {
    const urls = localUrls.current;
    return () => {
      // Clear as well as revoke: a remount (React dev mode) must create fresh links.
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
    };
  }, []);

  const loadSaved = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/studio/carousels/${id}`);
    if (!res.ok) throw new Error(await readError(res));
    const data = (await res.json()) as View;
    setView((current) => ({ ...data, photoUrls: { ...data.photoUrls, ...Object.fromEntries(current ? Object.entries(current.photoUrls).filter(([k]) => !data.photoUrls[k]) : []) } }));
  }, []);

  useEffect(() => {
    setError(null);
    if (source.kind === "draft") {
      draftFiles.current = new Map(source.draft.files);
      const photoUrls: Record<string, string> = {};
      for (const [ref, file] of source.draft.files) photoUrls[ref] = localUrl(ref, file);
      setView({ spec: source.draft.spec, photoUrls, library: [...source.draft.files.keys()], slides: [], renderedAt: null });
      setArtifactId(null);
      setDirty(true);
      setSelected(0);
    } else {
      setArtifactId(source.artifactId);
      setDirty(false);
      setSelected(0);
      loadSaved(source.artifactId).catch((e) => setError(e instanceof Error ? e.message : "Carrousel indisponible"));
    }
  }, [source, loadSaved, localUrl]);

  const resolve = useCallback((ref: string) => view?.photoUrls[ref] ?? ref, [view?.photoUrls]);
  const parsed = useMemo(() => (view ? parseCarouselSpec(view.spec) : null), [view]);
  const blocking = parsed?.problems.filter((p) => p.blocking) ?? [];
  const warnings = parsed?.problems.filter((p) => !p.blocking) ?? [];

  if (!view) {
    return (
      <div className="grid gap-3 p-4 md:p-5">
        {error ? <p className="text-sm font-semibold text-[#9b2c1f]">{error}</p> : <span className="studio-skeleton h-72 rounded-3xl" />}
      </div>
    );
  }

  const spec = view.spec;
  const slide = spec.slides[selected];
  const editable = canWrite && !busy;

  function updateSlide(patch: Partial<CarouselSlide>) {
    setView((v) => (v ? { ...v, spec: { ...v.spec, slides: v.spec.slides.map((s, i) => (i === selected ? { ...s, ...patch } : s)) } } : v));
    setDirty(true);
    setNotice(null);
  }

  function updateTreatment(key: "brightness" | "shade" | "saturation", value: number) {
    updateSlide({ photo_treatment: { ...(slide.photo_treatment ?? {}), [key]: value } });
  }

  const treatment = {
    brightness: slide.photo_treatment?.brightness ?? (slide.type === "cover" ? 1 : DEFAULT_TREATMENT.brightness),
    shade: slide.photo_treatment?.shade ?? DEFAULT_TREATMENT.shade,
  };
  const posY = Number(/^[\d.]+% ([\d.]+)%$/.exec(slide.photo_position ?? "")?.[1] ?? 50);

  async function addPhoto(file: File) {
    setError(null);
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setError("Format non accepté (JPEG, PNG ou WEBP).");
    if (!artifactId) {
      const ref = `photos/${Date.now().toString(36)}-${file.name}`;
      draftFiles.current.set(ref, file);
      setView((v) => (v ? { ...v, photoUrls: { ...v.photoUrls, [ref]: localUrl(ref, file) }, library: [...v.library, ref] } : v));
      updateSlide({ photo: ref, photo_source: "real" });
      return;
    }
    setBusy("Envoi de la photo…");
    try {
      const res = await fetch(`/api/admin/studio/carousels/${artifactId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const up = (await res.json()) as { path: string; token: string };
      await uploadSigned(up.path, up.token, file, file.type);
      setView((v) => (v ? { ...v, photoUrls: { ...v.photoUrls, [up.path]: localUrl(up.path, file) }, library: [...v.library, up.path] } : v));
      updateSlide({ photo: up.path, photo_source: "real" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setBusy(null);
    }
  }

  /** Renders every slide in the browser and uploads them as a new version. */
  async function renderAndCommit(id: string, current: View) {
    const res = await fetch(`/api/admin/studio/carousels/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spec: current.spec }),
    });
    if (!res.ok) throw new Error(await readError(res));
    const { version, uploads } = (await res.json()) as { version: string; uploads: Array<{ path: string; token: string }> };
    const look = (ref: string) => current.photoUrls[ref] ?? ref;
    for (let i = 0; i < uploads.length; i++) {
      setBusy(`Slide ${i + 1} sur ${uploads.length}…`);
      const blob = await renderSlideJpeg({ spec: current.spec, index: i + 1, resolve: look, badgeUrl: BADGE_URL });
      await uploadSigned(uploads[i].path, uploads[i].token, blob, "image/jpeg");
    }
    setBusy("Vérification…");
    const done = await fetch(`/api/admin/studio/carousels/${id}/rendered`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    });
    if (!done.ok) throw new Error(await readError(done));
    const data = (await done.json()) as View & { sentBack: number };
    setView((v) => ({ ...data, photoUrls: { ...(v?.photoUrls ?? {}), ...data.photoUrls } }));
    setDirty(false);
    setNotice(
      data.sentBack
        ? "Slides enregistrées. La publication validée repart chez Salif pour revalidation."
        : "Slides enregistrées.",
    );
  }

  async function save() {
    if (!view || blocking.length) return;
    setError(null);
    setNotice(null);
    try {
      if (!artifactId) {
        // First save of a draft: create the project, send the photos, then render.
        setBusy("Création du projet…");
        const used = new Set(view.spec.slides.map((s) => s.photo));
        const files = [...draftFiles.current.entries()].filter(([ref]) => used.has(ref));
        const res = await fetch("/api/admin/studio/carousels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spec: view.spec,
            files: files.map(([ref, f]) => ({ ref, name: f.name, type: f.type, size: f.size })),
          }),
        });
        if (!res.ok) throw new Error(await readError(res));
        const created = (await res.json()) as {
          conversationId: string;
          artifactId: string;
          uploads: Array<{ ref: string; path: string; token: string; type: string }>;
        };
        for (let i = 0; i < created.uploads.length; i++) {
          const u = created.uploads[i];
          setBusy(`Photo ${i + 1} sur ${created.uploads.length}…`);
          const file = draftFiles.current.get(u.ref);
          if (file) await uploadSigned(u.path, u.token, file, u.type);
        }
        setArtifactId(created.artifactId);
        const fresh = await fetch(`/api/admin/studio/carousels/${created.artifactId}`);
        if (!fresh.ok) throw new Error(await readError(fresh));
        const saved = (await fresh.json()) as View;
        setView(saved);
        await renderAndCommit(created.artifactId, saved);
        onImported?.(created.conversationId);
      } else {
        await renderAndCommit(artifactId, view);
        onChanged?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function downloadAll() {
    if (!view?.slides.length) return;
    setBusy("Téléchargement…");
    try {
      for (let i = 0; i < view.slides.length; i++) {
        const blob = await fetch(view.slides[i]).then((r) => r.blob());
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = slideFileName(view.spec, i + 1);
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
    } finally {
      setBusy(null);
    }
  }

  const saveLabel = !artifactId ? "Importer dans le Studio" : dirty ? "Enregistrer les slides" : "Slides à jour";

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 p-4 md:p-5">
      <header className="flex flex-wrap items-center gap-3">
        <CardsThreeIcon size={20} weight="bold" className="shrink-0 text-primary" />
        <div className="min-w-0 flex-1 basis-56">
          <h2 className="truncate text-lg font-bold tracking-tight text-neutral-900">{spec.file_title}</h2>
          <p className="text-xs text-neutral-500">
            {spec.slides.length} slides · {!artifactId ? "aperçu avant import" : view.renderedAt ? `enregistré le ${new Date(view.renderedAt).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}` : "pas encore enregistré"}
          </p>
        </div>
        {artifactId && view.slides.length > 0 && !dirty && (
          <button
            type="button"
            onClick={() => void downloadAll()}
            disabled={Boolean(busy)}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-neutral-800 ring-1 ring-[rgba(74,52,36,0.14)] hover:bg-[#F6F1EA] disabled:opacity-50"
          >
            <DownloadSimpleIcon size={16} weight="bold" />
            Télécharger
          </button>
        )}
        {canWrite && (
          <button
            type="button"
            onClick={() => void save()}
            disabled={Boolean(busy) || blocking.length > 0 || (Boolean(artifactId) && !dirty)}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#C96A2E] px-5 text-sm font-bold text-white transition-colors hover:bg-[#B85E26] disabled:bg-neutral-300 sm:h-10 sm:w-auto"
          >
            {busy ? <SpinnerGapIcon size={16} weight="bold" className="animate-spin" /> : artifactId && !dirty ? <CheckCircleIcon size={16} weight="bold" /> : null}
            {busy ?? saveLabel}
          </button>
        )}
      </header>

      <AnimatePresence initial={false}>
        {(error || notice || blocking.length > 0) && (
          <motion.div
            key={error ?? notice ?? blocking[0]?.message}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease }}
            className={cn("flex items-start gap-2 text-sm font-semibold", error || blocking.length ? "text-[#9b2c1f]" : "text-[#256b4c]")}
            role="status"
          >
            {error || blocking.length ? <WarningCircleIcon size={18} weight="bold" className="mt-px shrink-0" /> : <CheckCircleIcon size={18} weight="bold" className="mt-px shrink-0" />}
            <span>{error ?? (blocking.length ? blocking.map((p) => p.message).join(" ") : notice)}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The strip: every slide, live. */}
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:thin] md:-mx-5 md:px-5" role="tablist" aria-label="Slides">
        {spec.slides.map((s, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === selected}
            onClick={() => setSelected(i)}
            className={cn(
              "relative shrink-0 overflow-hidden rounded-2xl ring-2 ring-offset-2 ring-offset-[#f3e6d6] transition-shadow",
              i === selected ? "ring-[#C96A2E]" : "ring-transparent hover:ring-[rgba(201,106,46,0.35)]",
            )}
          >
            <SlideFrame spec={spec} index={i + 1} resolve={resolve} width={112} />
            <span className="absolute bottom-1 left-1 rounded-full bg-black/55 px-1.5 text-[10px] font-bold text-white">{i + 1}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-[420px]">
          <motion.div key={selected} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, ease }}>
            <SlideFrame spec={spec} index={selected + 1} resolve={resolve} width={420} className="max-w-full rounded-3xl shadow-[0_24px_60px_-30px_rgba(90,50,26,0.6)]" />
          </motion.div>
        </div>

        <div className="grid content-start gap-6">
          <section className="grid gap-2.5" aria-labelledby="carousel-photo">
            <div className="flex items-center justify-between gap-2">
              <h3 id="carousel-photo" className="text-sm font-bold text-neutral-900">
                Photo de la slide {selected + 1}
                {slide.photo_source && (
                  <span className="ml-2 text-xs font-semibold text-neutral-500">{slide.photo_source === "real" ? "réelle" : "générée"}</span>
                )}
              </h3>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={!editable}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary/10 px-3 text-[13px] font-semibold text-[#a8521d] hover:bg-primary/15 disabled:opacity-50"
                >
                  <UploadSimpleIcon size={14} weight="bold" />
                  Importer une photo
                </button>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void addPhoto(f);
                }}
              />
            </div>
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
              {view.library.map((ref) => (
                <button
                  key={ref}
                  type="button"
                  disabled={!editable}
                  onClick={() =>
                    // Keep the "réelle / générée" tag with the photo, wherever it came from.
                    updateSlide({ photo: ref, photo_source: spec.slides.find((x) => x.photo === ref)?.photo_source })
                  }
                  aria-pressed={slide.photo === ref}
                  className={cn(
                    "relative aspect-[4/5] overflow-hidden rounded-xl bg-neutral-200 ring-2 ring-offset-2 ring-offset-[#f3e6d6]",
                    slide.photo === ref ? "ring-[#C96A2E]" : "ring-transparent",
                  )}
                  title={ref.split("/").pop()}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={resolve(ref)} alt="" className="size-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          </section>

          <section className="grid gap-4" aria-label="Réglages de la photo">
            <Slider label="Cadrage (haut ↔ bas)" value={posY / 100} min={0} max={1} step={0.01} disabled={!editable} onChange={(v) => updateSlide({ photo_position: `50% ${Math.round(v * 100)}%` })} />
            <Slider label="Luminosité" value={treatment.brightness} min={0.4} max={1.3} step={0.01} disabled={!editable} onChange={(v) => updateTreatment("brightness", v)} />
            {slide.type !== "cover" && (
              <Slider label="Voile sombre derrière le texte" value={treatment.shade} min={0.3} max={1.3} step={0.01} disabled={!editable} onChange={(v) => updateTreatment("shade", v)} />
            )}
            {canWrite && (slide.photo_treatment || slide.photo_position) && (
              <button
                type="button"
                disabled={!editable}
                onClick={() => updateSlide({ photo_treatment: undefined, photo_position: undefined })}
                className="inline-flex h-9 w-fit items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-neutral-600 hover:bg-white/70"
              >
                <ArrowCounterClockwiseIcon size={14} weight="bold" />
                Réglages par défaut
              </button>
            )}
          </section>

          <section className="grid gap-3" aria-label="Textes de la slide">
            <h3 className="text-sm font-bold text-neutral-900">Textes</h3>
            <p className="-mt-1.5 text-xs text-neutral-500">Entourez un mot d&apos;astérisques pour l&apos;italique orange : *trois personnes.*</p>
            <label className="grid gap-1">
              <span className="text-xs font-semibold text-neutral-600">Titre</span>
              <textarea value={slide.title} disabled={!editable} rows={2} onChange={(e) => updateSlide({ title: e.target.value })} className={field} />
            </label>
            {slide.type === "cover" && (
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-neutral-600">Sous-titre</span>
                <input value={slide.subtitle ?? ""} disabled={!editable} onChange={(e) => updateSlide({ subtitle: e.target.value })} className={field} />
              </label>
            )}
            {slide.type === "point" && (
              <>
                <label className="grid gap-1">
                  <span className="text-xs font-semibold text-neutral-600">Étiquette</span>
                  <input value={slide.action_label ?? "À faire"} disabled={!editable} onChange={(e) => updateSlide({ action_label: e.target.value })} className={field} />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-semibold text-neutral-600">Action</span>
                  <textarea value={slide.action ?? ""} disabled={!editable} rows={3} onChange={(e) => updateSlide({ action: e.target.value })} className={field} />
                </label>
              </>
            )}
            {slide.type === "roogo" &&
              (slide.steps ?? []).map((step, k) => (
                <label key={k} className="grid gap-1">
                  <span className="text-xs font-semibold text-neutral-600">Étape {k + 1}</span>
                  <input
                    value={step}
                    disabled={!editable}
                    onChange={(e) => updateSlide({ steps: (slide.steps ?? []).map((s, j) => (j === k ? e.target.value : s)) })}
                    className={field}
                  />
                </label>
              ))}
            {slide.type === "cta" && (
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-neutral-600">Ligne WhatsApp</span>
                <input value={slide.whatsapp_line ?? ""} disabled={!editable} onChange={(e) => updateSlide({ whatsapp_line: e.target.value })} className={field} />
              </label>
            )}
            {warnings.filter((w) => w.slide === selected + 1).map((w) => (
              <p key={w.message} className="text-xs font-semibold text-[#8a5a00]">{w.message}</p>
            ))}
          </section>
        </div>
      </div>

      {/* Planned like a video: the same stepper, Salif validates, the worker publishes. */}
      {artifactId && view.slides.length > 0 && !dirty && (
        <div className="max-w-xl">
          <PublicationCard artifactId={artifactId} madeBy={madeBy} noun="carousel" />
        </div>
      )}
    </div>
  );
}
