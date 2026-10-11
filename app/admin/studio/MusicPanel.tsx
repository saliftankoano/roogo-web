"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  CheckIcon,
  MusicNotesIcon,
  PauseIcon,
  PlayIcon,
  SparkleIcon,
  SpinnerGapIcon,
  XIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { estimateJobCostUsd } from "@/lib/studio/ai-tools";
import { MUSIC_MOODS, type MusicMood } from "@/lib/studio/music";

export type MusicTrack = {
  id: string;
  title: string;
  source: "library" | "generated";
  seconds: number | null;
  author: string | null;
  createdAt: string;
  url: string | null;
};

export const MUSIC_PRICE_USD = estimateJobCostUsd({ tool: "music" });

function clock(seconds: number | null) {
  if (seconds == null) return "";
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The music drawer (Salif, 2026-10-11): pick a track from the team library or
 * generate an instrumental. Generated tracks join the library for everyone.
 */
export function MusicPanel({
  open,
  onClose,
  tracks,
  loading,
  selectedId,
  onSelect,
  conversationId,
  canWrite,
  money,
  videoSeconds,
  resume,
  onGenerated,
  onGenerationState,
}: {
  open: boolean;
  onClose: () => void;
  tracks: MusicTrack[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  conversationId: string | null;
  canWrite: boolean;
  money: (usd: number) => string;
  videoSeconds: number;
  /** A generation still running from before (after a reload). */
  resume: { id: string; createdAt: string } | null;
  onGenerated: (trackId: string | null) => void;
  /** Shown next to the "Musique" button, since this drawer is often closed. */
  onGenerationState: (state: "running" | "failed" | null, message?: string) => void;
}) {
  const [tab, setTab] = useState<"library" | "generate">("library");
  const setTabRef = useRef(setTab);
  setTabRef.current = setTab;
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!open) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function listen(track: MusicTrack) {
    const audio = audioRef.current;
    if (!audio || !track.url) return;
    if (playingId === track.id) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    audio.src = track.url;
    audio.currentTime = 0;
    void audio.play().then(() => setPlayingId(track.id)).catch(() => setPlayingId(null));
  }

  // Rendered on the page body so it stays in view wherever the editor is scrolled.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const library = tracks.filter((t) => t.source === "library");
  const generated = tracks.filter((t) => t.source === "generated");

  if (!mounted) return null;
  return createPortal(
    // Stays mounted when closed, so a music being generated keeps being followed.
    <motion.aside
          initial={false}
          animate={open ? { x: 0, opacity: 1 } : { x: 16, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          aria-label="Musique"
          aria-hidden={!open}
          inert={!open}
          className={cn(
            "fixed bottom-4 right-4 top-24 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-[#fbf8f5] shadow-[0_24px_60px_-24px_rgba(74,52,36,0.55)]",
            !open && "pointer-events-none",
          )}
        >
          <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3">
            <MusicNotesIcon size={18} weight="bold" className="shrink-0 text-primary" />
            <h3 className="text-sm font-semibold text-neutral-900">Musique</h3>
            {selectedId && canWrite && (
              <button
                type="button"
                onClick={() => onSelect(null)}
                className="ml-auto cursor-pointer text-xs font-semibold text-neutral-500 hover:text-neutral-800"
              >
                Retirer
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className={cn(
                "flex size-8 cursor-pointer items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100",
                !(selectedId && canWrite) && "ml-auto",
              )}
            >
              <XIcon size={16} weight="bold" />
            </button>
          </div>

          <div className="px-4 pt-3">
            <div role="tablist" aria-label="Source de la musique" className="flex rounded-xl border border-neutral-200 bg-white p-0.5">
              {(
                [
                  ["library", "Bibliothèque"],
                  ["generate", "Générer"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={cn(
                    "h-8 flex-1 cursor-pointer rounded-[10px] text-xs font-semibold transition-colors",
                    tab === key ? "bg-primary/10 text-[#b45a22]" : "text-neutral-500 hover:text-neutral-800",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <div hidden={tab !== "generate"}>
              <GenerateForm
                conversationId={conversationId}
                canWrite={canWrite}
                money={money}
                resume={resume}
                onState={onGenerationState}
                onGenerated={(id) => {
                  onGenerated(id);
                  setTab("library");
                }}
                onError={() => setTabRef.current("generate")}
              />
            </div>
            {tab !== "library" ? null : (
              loading ? (
                <div className="space-y-2">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="studio-skeleton h-14 rounded-xl" />
                  ))}
                </div>
              ) : tracks.length === 0 ? (
                <p className="rounded-xl border border-dashed border-neutral-200 p-4 text-center text-xs text-neutral-500">
                  Aucune musique pour l&apos;instant. Générez-en une.
                </p>
              ) : (
                <div className="space-y-4">
                  <TrackGroup
                    label="Roogo"
                    tracks={library}
                    selectedId={selectedId}
                    playingId={playingId}
                    canWrite={canWrite}
                    videoSeconds={videoSeconds}
                    onListen={listen}
                    onSelect={onSelect}
                  />
                  <TrackGroup
                    label="Créées dans le Studio"
                    tracks={generated}
                    selectedId={selectedId}
                    playingId={playingId}
                    canWrite={canWrite}
                    videoSeconds={videoSeconds}
                    onListen={listen}
                    onSelect={onSelect}
                  />
                </div>
              )
            )}
          </div>

          <p className="border-t border-neutral-200 px-4 py-2.5 text-[11px] leading-snug text-neutral-500">
            La musique joue jusqu&apos;à la dernière image : basse sous la voix, plus forte quand personne ne parle.
          </p>
          <audio ref={audioRef} onEnded={() => setPlayingId(null)} className="hidden" />
        </motion.aside>,
    document.body,
  );
}

function TrackGroup({
  label,
  tracks,
  selectedId,
  playingId,
  canWrite,
  videoSeconds,
  onListen,
  onSelect,
}: {
  label: string;
  tracks: MusicTrack[];
  selectedId: string | null;
  playingId: string | null;
  canWrite: boolean;
  videoSeconds: number;
  onListen: (track: MusicTrack) => void;
  onSelect: (id: string) => void;
}) {
  if (!tracks.length) return null;
  return (
    <section className="space-y-1.5">
      <h4 className="px-1 text-[11px] font-bold uppercase tracking-wide text-neutral-400">{label}</h4>
      {tracks.map((track) => {
        const selected = track.id === selectedId;
        const tooShort = track.seconds != null && track.seconds < videoSeconds;
        return (
          <div
            key={track.id}
            className={cn(
              "grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border bg-white px-2.5 py-2 transition-colors",
              selected ? "border-primary/60 shadow-[0_6px_16px_-12px_rgba(201,106,46,0.8)]" : "border-neutral-200",
            )}
          >
            <button
              type="button"
              onClick={() => onListen(track)}
              disabled={!track.url}
              aria-label={playingId === track.id ? `Arrêter ${track.title}` : `Écouter ${track.title}`}
              className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {playingId === track.id ? <PauseIcon size={14} weight="fill" /> : <PlayIcon size={14} weight="fill" />}
            </button>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-neutral-900">{track.title}</span>
              <span className="block truncate text-[11px] text-neutral-500">
                {[
                  track.source === "library" ? "Roogo" : track.author ? `Par ${track.author.split(/\s+/)[0]}` : "Générée",
                  clock(track.seconds),
                  tooShort ? "plus courte que la vidéo" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            {selected ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-bold text-green-700">
                <CheckIcon size={11} weight="bold" />
                Choisie
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onSelect(track.id)}
                disabled={!canWrite}
                className="h-8 cursor-pointer rounded-lg border border-neutral-200 px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Choisir
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}

function GenerateForm({
  conversationId,
  canWrite,
  money,
  resume,
  onState,
  onGenerated,
  onError,
}: {
  conversationId: string | null;
  canWrite: boolean;
  money: (usd: number) => string;
  resume: { id: string; createdAt: string } | null;
  onState: (state: "running" | "failed" | null, message?: string) => void;
  onGenerated: (trackId: string | null) => void;
  onError: () => void;
}) {
  const [mood, setMood] = useState<MusicMood | null>("joyful");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "running"; id: string; startedAt: number } | { kind: "starting" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (resume) setState({ kind: "running", id: resume.id, startedAt: new Date(resume.createdAt).getTime() });
  }, [resume]);

  const onStateRef = useRef(onState);
  onStateRef.current = onState;
  useEffect(() => {
    if (state.kind === "running" || state.kind === "starting") onStateRef.current("running");
    else if (state.kind === "error") onStateRef.current("failed", state.message);
    else onStateRef.current(null);
  }, [state]);

  const runningId = state.kind === "running" ? state.id : null;
  const onGeneratedRef = useRef(onGenerated);
  onGeneratedRef.current = onGenerated;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  useEffect(() => {
    if (!runningId) return;
    let stopped = false;
    const tick = async () => {
      setNow(Date.now());
      try {
        const res = await fetch(`/api/admin/studio/jobs/${runningId}`);
        const data = (await res.json().catch(() => ({}))) as { state?: string; artifactId?: string | null; error?: string };
        if (stopped) return;
        if (data.state === "done") {
          setState({ kind: "idle" });
          setDetails("");
          onGeneratedRef.current(data.artifactId ?? null);
        } else if (data.state === "failed" || res.status === 404) {
          setState({ kind: "error", message: data.error ?? "La création a échoué." });
          onErrorRef.current();
        }
      } catch {
        // Transient: next tick.
      }
    };
    const timer = window.setInterval(tick, 4000);
    const clockTimer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.clearInterval(clockTimer);
    };
  }, [runningId]);

  const busy = state.kind === "starting" || state.kind === "running";
  const blocker = !canWrite ? "Lecture seule" : !conversationId ? "Ouvrez un projet" : !mood && !details.trim() ? "Choisissez une ambiance" : null;

  async function generate() {
    if (blocker || busy) return;
    setState({ kind: "starting" });
    try {
      const res = await fetch("/api/admin/studio/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "music",
          conversation_id: conversationId,
          params: { mood, details },
          acknowledged_cost_usd: MUSIC_PRICE_USD,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setState({ kind: "error", message: data.error ?? "La création n'a pas pu démarrer." });
        return;
      }
      setState({ kind: "running", id: data.id, startedAt: Date.now() });
    } catch {
      setState({ kind: "error", message: "Connexion impossible. Réessayez." });
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <span className="px-1 text-xs font-semibold text-neutral-500">Ambiance</span>
        <div className="flex flex-wrap gap-1.5">
          {MUSIC_MOODS.map((m) => (
            <button
              key={m.key}
              type="button"
              aria-pressed={mood === m.key}
              onClick={() => setMood(mood === m.key ? null : m.key)}
              disabled={busy}
              className={cn(
                "h-8 cursor-pointer rounded-full border px-3 text-xs font-semibold transition-colors",
                mood === m.key
                  ? "border-primary/50 bg-primary/10 text-[#b45a22]"
                  : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <label className="block space-y-1.5">
        <span className="px-1 text-xs font-semibold text-neutral-500">Détails (facultatif)</span>
        <textarea
          value={details}
          onChange={(event) => setDetails(event.target.value.slice(0, 240))}
          disabled={busy}
          rows={3}
          placeholder="Ex. : guitare douce, ambiance matin à Ouaga"
          className="w-full resize-none rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-primary/50"
        />
      </label>
      <button
        type="button"
        onClick={() => void generate()}
        disabled={busy || blocker !== null}
        className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-[0_6px_16px_-8px_rgba(201,106,46,0.8)] transition-transform active:scale-[0.985] disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500 disabled:shadow-none"
      >
        {busy ? <SpinnerGapIcon size={16} className="size-4 animate-spin" /> : <SparkleIcon size={16} weight="bold" className="size-4" />}
        {busy ? "Création en cours" : (blocker ?? "Générer")}
        {!busy && !blocker && (
          <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-xs font-bold tabular-nums">≈ {money(MUSIC_PRICE_USD)}</span>
        )}
      </button>
      <p role="status" className={cn("px-1 text-xs", state.kind === "error" ? "font-semibold text-red-700" : "text-neutral-500")}>
        {state.kind === "running"
          ? `${Math.max(0, Math.round((now - state.startedAt) / 1000))} s · environ 40 s. Vous pouvez continuer à travailler.`
          : state.kind === "error"
            ? state.message
            : "Instrumentale d'environ 1 min 30, sans voix. Elle rejoint la bibliothèque de toute l'équipe."}
      </p>
    </div>
  );
}
