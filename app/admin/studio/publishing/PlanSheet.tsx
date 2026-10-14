"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { CaretDownIcon, CheckIcon, SparkleIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  TIKTOK_PENDING_TOOLTIP,
  captionChecks,
  isoToDateAndSlot,
  networksLabel,
  slotLabel,
  slotToIso,
  type Network,
  type SlotOption,
} from "@/lib/studio/publishing";
import { NetworkIcon } from "../calendrier/NetworkIcons";
import { readError, type Post } from "../calendrier/calendar-types";
import { chipsIn, isPhone, motionOn, riseIn, shimmer } from "./motion";
import { useDialog } from "./useDialog";

type Phase = "when" | "describe";

export type PlanSheetProps = {
  mode: "plan" | "reschedule";
  artifactId: string;
  publication: Post | null;
  slots: SlotOption[];
  daySlots: string[];
  startPhase?: Phase;
  onClose: () => void;
  onDone: (post: Post) => void;
};

const label = "text-[13px] font-bold text-[#1F1A16]";

/**
 * "Planifier la publication" (design steps 2 to 5): a bottom sheet on a phone,
 * a 480 px drawer on the right on a computer. Quand, Où, then the generated
 * description. The send button stays disabled until a description exists.
 */
export function PlanSheet({ mode, artifactId, publication, slots, daySlots, startPhase, onClose, onDone }: PlanSheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef<HTMLDivElement | null>(null);
  const closing = useRef(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = publication ? publication.scheduledAt : null;
  const options = useMemo(() => {
    const list = [...slots];
    if (current && !list.some((s) => new Date(s.scheduledAt).getTime() === new Date(current).getTime())) {
      list.unshift({ scheduledAt: new Date(current).toISOString(), recommended: false, taken: false, hint: "Date actuelle" });
    }
    return list;
  }, [slots, current]);
  const initial =
    (current && options.find((s) => new Date(s.scheduledAt).getTime() === new Date(current).getTime())) ||
    options.find((s) => s.recommended) ||
    options.find((s) => !s.taken) ||
    null;

  const [phase, setPhase] = useState<Phase>(mode === "reschedule" ? "when" : startPhase ?? "when");
  const [chosen, setChosen] = useState<string | null>(initial?.scheduledAt ?? null);
  const [custom, setCustom] = useState(false);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const [customDate, setCustomDate] = useState(initial ? isoToDateAndSlot(initial.scheduledAt).date : tomorrow);
  const [customSlot, setCustomSlot] = useState(daySlots[daySlots.length - 1] ?? "19:00");
  const [networks, setNetworks] = useState<Network[]>(publication?.networks?.length ? publication.networks : ["facebook", "instagram"]);
  const [caption, setCaption] = useState(publication?.caption ?? "");
  const [hashtags, setHashtags] = useState<string[]>(publication?.hashtags ?? []);
  const [model, setModel] = useState<string | null>(publication?.captionModel ?? null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(publication?.captionGeneratedAt ?? null);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const scheduledAt = custom ? slotToIso(customDate, customSlot) : chosen;
  const hasCaption = caption.trim().length > 0;
  const checks = captionChecks(caption, hashtags);

  // Open: sheet from the bottom on a phone, drawer from the right on a computer.
  useLayoutEffect(() => {
    if (!mounted || !motionOn()) return;
    const panel = panelRef.current;
    if (backdropRef.current) gsap.fromTo(backdropRef.current, { opacity: 0 }, { opacity: 1, duration: 0.25 });
    if (panel) {
      if (isPhone()) gsap.fromTo(panel, { yPercent: 100 }, { yPercent: 0, duration: 0.45, ease: "power3.out" });
      else gsap.fromTo(panel, { xPercent: 100 }, { xPercent: 0, duration: 0.45, ease: "power3.out" });
    }
  }, [mounted]);

  function close(after?: () => void) {
    if (closing.current) return;
    closing.current = true;
    const finish = () => {
      onClose();
      after?.();
    };
    const panel = panelRef.current;
    if (!panel || !motionOn()) return finish();
    const tl = gsap.timeline({ onComplete: finish });
    tl.to(panel, isPhone() ? { yPercent: 100, duration: 0.3, ease: "power2.in" } : { xPercent: 100, duration: 0.3, ease: "power2.in" });
    if (backdropRef.current) tl.to(backdropRef.current, { opacity: 0, duration: 0.2 }, "<");
  }

  useDialog(panelRef, () => close(), mounted);

  // Shimmer while the description is written, then the result rises and the chips pop.
  useEffect(() => {
    if (!generating) return;
    return shimmer(loadingRef.current?.querySelectorAll("[data-shim]") ?? null);
  }, [generating]);

  async function generate() {
    setGenerating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/studio/publications/description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactId }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as { caption: string; hashtags: string[]; model: string; generatedAt: string };
      setCaption(data.caption);
      setHashtags(data.hashtags);
      setModel(data.model);
      setGeneratedAt(data.generatedAt);
      window.requestAnimationFrame(() => {
        riseIn(resultRef.current);
        chipsIn(resultRef.current?.querySelectorAll("[data-chip]") ?? null);
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "La génération a échoué.");
    } finally {
      setGenerating(false);
    }
  }

  async function submit() {
    if (!scheduledAt) {
      setMessage("Choisissez une date.");
      setPhase("when");
      return;
    }
    if (!networks.length) {
      setMessage("Choisissez au moins un réseau.");
      setPhase("when");
      return;
    }
    setSending(true);
    setMessage(null);
    try {
      const res =
        mode === "reschedule" && publication
          ? await fetch(`/api/admin/studio/publications/${publication.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ scheduledAt }),
            })
          : await fetch("/api/admin/studio/publications/propose", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ artifactId, scheduledAt, networks, caption, hashtags, captionModel: model, captionGeneratedAt: generatedAt }),
            });
      if (!res.ok) throw new Error(await readError(res));
      const { post } = (await res.json()) as { post: Post };
      close(() => onDone(post));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setSending(false);
    }
  }

  if (!mounted) return null;

  const title = mode === "reschedule" ? "Changer la date" : "Planifier la publication";
  const whenSection = (
    <section className="grid gap-2" aria-labelledby="plan-when">
      <h3 id="plan-when" className={label}>
        Quand
      </h3>
      <div role="radiogroup" aria-labelledby="plan-when" className="grid gap-2">
        {options.map((s) => {
          const on = !custom && chosen === s.scheduledAt;
          return (
            <button
              key={s.scheduledAt}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={s.taken}
              onClick={() => {
                setCustom(false);
                setChosen(s.scheduledAt);
              }}
              className={cn(
                "flex min-h-14 w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left transition-colors",
                on ? "bg-[#FFF6EE] ring-2 ring-[#C96A2E]" : "bg-white ring-1 ring-[rgba(74,52,36,0.12)] hover:ring-[rgba(201,106,46,0.45)]",
                s.taken && "cursor-not-allowed bg-[#F6F1EA] opacity-60 ring-[rgba(74,52,36,0.08)] hover:ring-[rgba(74,52,36,0.08)]",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className={cn("block text-[15px] font-bold", s.taken ? "text-neutral-500" : "text-[#1F1A16]")}>{slotLabel(s.scheduledAt)}</span>
                <span className={cn("block text-xs", s.recommended ? "font-semibold text-[#A8521D]" : "text-neutral-500")}>{s.hint}</span>
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full",
                  on ? "bg-[#C96A2E] shadow-[inset_0_0_0_4px_#fff] ring-2 ring-[#C96A2E]" : "ring-2 ring-[#D6CBBE]",
                )}
              />
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={custom}
          onClick={() => setCustom(true)}
          className={cn(
            "min-h-12 w-full rounded-2xl border border-dashed px-3.5 text-sm font-semibold transition-colors",
            custom ? "border-[#C96A2E] bg-[#FFF6EE] text-[#A8521D]" : "border-[rgba(74,52,36,0.25)] text-neutral-700 hover:border-[#C96A2E]",
          )}
        >
          Autre date et heure…
        </button>
        {custom && (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,8rem)] gap-2">
            <label className="grid gap-1">
              <span className="text-xs font-semibold text-neutral-600">Date</span>
              <input
                type="date"
                min={tomorrow}
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="h-11 w-full min-w-0 rounded-xl border border-neutral-200 bg-white px-3 text-[15px] outline-none focus:border-[#C96A2E]"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-semibold text-neutral-600">Heure</span>
              <select
                value={customSlot}
                onChange={(e) => setCustomSlot(e.target.value)}
                className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-[15px] outline-none focus:border-[#C96A2E]"
              >
                {daySlots.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>
    </section>
  );

  const whereSection = (
    <section className="grid gap-2" aria-labelledby="plan-where">
      <h3 id="plan-where" className={label}>
        Où
      </h3>
      <div className="grid grid-cols-3 gap-2">
        {(["facebook", "instagram"] as const).map((n) => {
          const on = networks.includes(n);
          return (
            <button
              key={n}
              type="button"
              aria-pressed={on}
              onClick={() => setNetworks((cur) => (on ? cur.filter((x) => x !== n) : [...cur, n]))}
              className={cn(
                "inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-2xl px-2 text-sm font-semibold transition-colors",
                on ? "bg-white text-[#1F1A16] ring-2 ring-[#C96A2E]" : "bg-white/60 text-neutral-500 ring-1 ring-[rgba(74,52,36,0.12)]",
              )}
            >
              <NetworkIcon network={n} size={18} label={false} />
              <span className="truncate">{n === "facebook" ? "Facebook" : "Instagram"}</span>
            </button>
          );
        })}
        <span
          title={TIKTOK_PENDING_TOOLTIP}
          aria-disabled="true"
          className="inline-flex h-12 min-w-0 cursor-help items-center justify-center gap-2 rounded-2xl border border-dashed border-[rgba(74,52,36,0.18)] px-2 text-sm font-semibold text-neutral-400"
        >
          <NetworkIcon network="tiktok" size={18} label={false} className="opacity-50 grayscale" />
          <span className="truncate">Bientôt</span>
        </span>
      </div>
    </section>
  );

  const summary = (
    <div className="flex items-center gap-3 rounded-2xl bg-[#F6F1EA] px-3.5 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-[#1F1A16]">{scheduledAt ? slotLabel(scheduledAt) : "Date à choisir"}</span>
        <span className="block text-xs text-neutral-600">{networks.length ? networksLabel(networks) : "Aucun réseau"}</span>
      </span>
      <span className="inline-flex items-center gap-1">
        {networks.map((n) => (
          <NetworkIcon key={n} network={n} size={18} />
        ))}
      </span>
      <button type="button" onClick={() => setPhase("when")} className="min-h-11 px-1 text-sm font-semibold text-[#A8521D] underline underline-offset-2">
        Changer
      </button>
    </div>
  );

  const describeSection = (
    <section className="grid gap-2.5" aria-labelledby="plan-describe">
      <div className="flex items-center justify-between gap-2">
        <h3 id="plan-describe" className={label}>
          Description et hashtags
        </h3>
        {hasCaption && !generating && (
          <button
            type="button"
            onClick={() => void generate()}
            className="inline-flex h-11 items-center rounded-full px-3.5 text-[13px] font-bold text-[#A8521D] ring-1 ring-[rgba(74,52,36,0.14)] hover:bg-[#FFF6EE] md:h-9"
          >
            Regénérer
          </button>
        )}
      </div>

      {generating ? (
        <div ref={loadingRef} aria-live="polite" aria-busy="true" className="grid gap-2.5 rounded-2xl bg-[#FBF7F2] p-4 ring-1 ring-[rgba(74,52,36,0.08)]">
          <span className="text-xs font-bold text-[#A8521D]">Rédaction en cours…</span>
          {["w-11/12", "w-4/5", "w-full", "w-3/5", "w-2/3"].map((w, i) => (
            <span key={i} data-shim className={cn("h-3 rounded-full bg-[#E6DCD0]", w)} />
          ))}
        </div>
      ) : hasCaption ? (
        <div ref={resultRef} className="grid gap-2.5">
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={8}
            aria-label="Description"
            className="w-full resize-y rounded-2xl border-2 border-[#C96A2E] bg-white px-3.5 py-3 text-[15px] leading-relaxed text-[#1F1A16] outline-none"
          />
          {hashtags.length > 0 && (
            <ul aria-label="Hashtags" className="flex flex-wrap gap-2">
              {hashtags.map((tag) => (
                <li key={tag} data-chip>
                  <button
                    type="button"
                    onClick={() => setHashtags((cur) => cur.filter((t) => t !== tag))}
                    aria-label={`Retirer ${tag}`}
                    className="inline-flex h-11 items-center gap-1.5 rounded-full bg-[#FFF1E4] px-3.5 text-[13px] font-bold text-[#A8521D] hover:bg-[#FCE3CC] md:h-8"
                  >
                    {tag}
                    <XIcon size={12} weight="bold" className="size-3 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ul aria-label="Vérifications" className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold">
            <Check ok={checks.site} label="roogobf.com" />
            <Check ok={checks.phone} label="Téléphone" />
            <Check ok={checks.noEmDash} label="Sans tiret long" />
            <Check ok={checks.hashtags > 0 && checks.hashtags <= 5} label={`${checks.hashtags} hashtag${checks.hashtags > 1 ? "s" : ""}`} />
          </ul>
          {(!checks.site || !checks.phone || !checks.noEmDash) && (
            <p className="text-xs text-neutral-500">Les points manquants sont corrigés automatiquement à l&apos;envoi.</p>
          )}
        </div>
      ) : (
        <button
          type="button"
          data-autofocus
          onClick={() => void generate()}
          className="flex min-h-20 w-full items-center gap-3 rounded-2xl border-2 border-dashed border-[rgba(201,106,46,0.45)] bg-[#FFF6EE] px-4 py-3 text-left transition-colors hover:bg-[#FFEFE0]"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#FCE3CC] text-[#C96A2E]">
            <SparkleIcon size={20} weight="fill" />
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-bold text-[#1F1A16]">Générer la description</span>
            <span className="block text-xs text-neutral-600">À partir du bien, du script et de la voix off</span>
          </span>
        </button>
      )}
    </section>
  );

  const returned = publication?.returnedAt && publication.reviewComment;

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <div ref={backdropRef} className="absolute inset-0 bg-[rgba(31,26,22,0.35)]" onClick={() => close()} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-title"
        aria-describedby="plan-sub"
        tabIndex={-1}
        className={cn(
          "absolute flex flex-col bg-[#FFFDFB] font-[inherit] shadow-[0_-20px_60px_-30px_rgba(31,26,22,0.6)] outline-none",
          "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[28px]",
          "md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[480px] md:max-w-full md:rounded-l-[28px] md:rounded-tr-none",
        )}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-[#E2D8CC] md:hidden" aria-hidden="true" />
        <header className="flex items-start gap-3 px-5 pb-3 pt-3 md:pt-6">
          <div className="min-w-0 flex-1">
            <h2 id="plan-title" className="text-xl font-bold tracking-tight text-[#1F1A16]">
              {title}
            </h2>
            <p id="plan-sub" className="text-[13px] text-neutral-600">
              {mode === "reschedule"
                ? publication?.status === "valide"
                  ? "La nouvelle date repasse par la validation de Salif."
                  : "Salif voit la nouvelle date avant de valider."
                : "Salif valide, puis la vidéo part seule à cette date."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => close()}
            aria-label="Fermer"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#F6F1EA] text-neutral-600 hover:bg-[#EFE7DD]"
          >
            <XIcon size={18} weight="bold" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
          <div className="grid gap-5">
            {returned && mode === "plan" && (
              <div className="flex gap-2.5 rounded-2xl bg-[#FCEFD4] px-3.5 py-3 text-[13px] text-[#6E4300]">
                <WarningCircleIcon size={18} weight="bold" className="mt-0.5 shrink-0" />
                <span className="min-w-0">
                  <span className="block font-bold">{publication?.returnedByName ?? "Salif"} a renvoyé la vidéo</span>
                  <span className="block">« {publication?.reviewComment} »</span>
                </span>
              </div>
            )}
            {phase === "when" ? (
              <>
                {whenSection}
                {mode === "plan" && whereSection}
                {mode === "plan" && (
                  <button
                    type="button"
                    onClick={() => setPhase("describe")}
                    className="flex min-h-11 items-center justify-between rounded-xl text-[13px] font-bold text-neutral-600 hover:text-[#1F1A16]"
                  >
                    Description et hashtags
                    <CaretDownIcon size={14} weight="bold" />
                  </button>
                )}
              </>
            ) : (
              <>
                {summary}
                {describeSection}
              </>
            )}
            {message && (
              <p role="alert" className="text-sm font-semibold text-red-700">
                {message}
              </p>
            )}
          </div>
        </div>

        <footer className="border-t border-[rgba(74,52,36,0.08)] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {mode === "reschedule" ? (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={sending || !scheduledAt}
              className="h-12 w-full rounded-full bg-[#C96A2E] text-[15px] font-bold text-white transition-colors hover:bg-[#B85E26] disabled:opacity-50"
            >
              {sending ? "Enregistrement…" : "Enregistrer la date"}
            </button>
          ) : phase === "when" ? (
            <button
              type="button"
              onClick={() => setPhase("describe")}
              disabled={!scheduledAt || !networks.length}
              className="h-12 w-full rounded-full bg-[#C96A2E] text-[15px] font-bold text-white transition-colors hover:bg-[#B85E26] disabled:opacity-50"
            >
              Continuer
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!hasCaption || sending || generating}
              className={cn(
                "h-12 w-full rounded-full text-[15px] font-bold transition-colors",
                hasCaption ? "bg-[#1F1A16] text-white hover:bg-black disabled:opacity-60" : "bg-[#E9E3DC] text-[#8F867E]",
              )}
            >
              {sending ? "Envoi…" : hasCaption ? "Envoyer à Salif pour validation" : "Générez la description d’abord"}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={cn("inline-flex items-center gap-1", ok ? "text-[#245C33]" : "text-[#8E5A00]")}>
      {ok ? <CheckIcon size={12} weight="bold" aria-hidden="true" /> : <WarningCircleIcon size={12} weight="bold" aria-hidden="true" />}
      <span>
        <span className="sr-only">{ok ? "Vérifié : " : "À compléter : "}</span>
        {label}
      </span>
    </li>
  );
}
