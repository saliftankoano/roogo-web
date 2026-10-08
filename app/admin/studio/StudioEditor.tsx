"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FastForwardIcon,
  FilmSlateIcon,
  MusicNotesIcon,
  PauseIcon,
  PlayIcon,
  RewindIcon,
  SkipBackIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { KIND_TABS, KindIcon } from "./StudioWorkspace";
import type { Artifact, PropertySummary } from "./studio-types";

/* ---------- timing helpers (pure, exported for tests) ---------- */

const DEFAULT_SECONDS = 30;
const SKIP_SECONDS = 5;

export type Cue = { start: number; end: number; text: string };
export type PlannedImage = { artifact: Artifact; start: number; end: number };

function seconds(artifact: Artifact | undefined): number | null {
  const value = artifact?.meta?.duration_seconds;
  return typeof value === "number" && value > 0 ? value : null;
}

/** Images share the voice's length evenly, in their running order. */
export function planImages(images: Artifact[], total: number): PlannedImage[] {
  if (!images.length) return [];
  const each = total / images.length;
  return images.map((artifact, i) => ({
    artifact,
    start: i * each,
    end: i === images.length - 1 ? total : (i + 1) * each,
  }));
}

export function imageAt(plan: PlannedImage[], time: number): PlannedImage | null {
  return plan.find((p) => time >= p.start && time < p.end) ?? plan[plan.length - 1] ?? null;
}

function srtClock(value: string): number {
  const match = value.trim().match(/^(\d+):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (!match) return 0;
  const [, h, m, s, ms] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000;
}

/** Minimal SRT reader: enough to show the current line while playing. */
export function parseSrt(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of text.replace(/\r/g, "").split(/\n\s*\n/)) {
    const lines = block.split("\n").filter(Boolean);
    const timing = lines.find((line) => line.includes("-->"));
    if (!timing) continue;
    const [start, end] = timing.split("-->");
    const body = lines.slice(lines.indexOf(timing) + 1).join(" ").trim();
    if (!body) continue;
    cues.push({ start: srtClock(start), end: srtClock(end), text: body });
  }
  return cues;
}

export function cueAt(cues: Cue[], time: number): Cue | null {
  return cues.find((cue) => time >= cue.start && time < cue.end) ?? null;
}

export function clock(total: number): string {
  const whole = Math.max(0, Math.floor(total));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/* ---------- editor ---------- */

/**
 * The editor: every piece of the project on the left, the preview in the
 * middle, the running order underneath with a playhead. Play, pause, skip
 * and drag the playhead to see which image is on screen at each second and
 * hear the voice at that moment. Assembling the final video comes later; this
 * is the plan, played back.
 */
export function StudioEditor({
  property,
  ordered,
  selectedId,
  onSelect,
}: {
  property: PropertySummary | null;
  ordered: Artifact[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const voice = ordered.find((a) => a.kind === "voiceover");
  const captions = ordered.find((a) => a.kind === "captions");
  const images = useMemo(() => ordered.filter((a) => a.kind === "image"), [ordered]);
  const total = Math.max(5, Math.ceil(seconds(voice) ?? DEFAULT_SECONDS));
  const plan = useMemo(() => planImages(images, total), [images, total]);
  const cues = useMemo(() => (captions ? parseSrt(captions.text) : []), [captions]);

  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  // While following, the preview shows whatever the playhead points at.
  // Opening a voice or a subtitle file from the list pauses that.
  const [follow, setFollow] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const frameRef = useRef(0);
  const clockRef = useRef<{ at: number; from: number } | null>(null);

  // Signed URLs change on every reload; keep the first one per voice so the
  // audio element is not reset mid-listen.
  const [voiceSrc, setVoiceSrc] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    if (!voice?.url) {
      setVoiceSrc(null);
      return;
    }
    setVoiceSrc((current) => (current?.id === voice.id ? current : { id: voice.id, url: voice.url as string }));
  }, [voice?.id, voice?.url]);

  const seek = useCallback(
    (next: number) => {
      const target = Math.min(total, Math.max(0, next));
      setTime(target);
      setFollow(true);
      const audio = audioRef.current;
      if (audio && voiceSrc) {
        audio.currentTime = Number.isFinite(audio.duration) ? Math.min(target, audio.duration) : target;
      }
      clockRef.current = { at: performance.now(), from: target };
    },
    [total, voiceSrc],
  );

  // The clock: the voice when there is one, a plain timer otherwise.
  useEffect(() => {
    if (!playing) return;
    const audio = voiceSrc ? audioRef.current : null;
    if (audio) {
      void audio.play().catch(() => setPlaying(false));
    } else {
      clockRef.current = { at: performance.now(), from: clockRef.current?.from ?? 0 };
    }
    const tick = () => {
      let next: number;
      if (audio) {
        next = audio.currentTime;
      } else {
        const start = clockRef.current ?? { at: performance.now(), from: 0 };
        next = start.from + (performance.now() - start.at) / 1000;
      }
      if (next >= total) {
        setTime(total);
        setPlaying(false);
        return;
      }
      setTime(next);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameRef.current);
      audio?.pause();
    };
    // `time` is read through clockRef on purpose: restarting the loop on
    // every frame would stutter.
  }, [playing, voiceSrc, total]);

  function toggle() {
    if (!playing && time >= total) seek(0);
    else clockRef.current = { at: performance.now(), from: time };
    setFollow(true);
    setPlaying((value) => !value);
  }

  function skip(delta: number) {
    seek(time + delta);
  }

  function onKey(event: React.KeyboardEvent) {
    if (event.key === " ") {
      event.preventDefault();
      toggle();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      skip(event.shiftKey ? -SKIP_SECONDS : -1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      skip(event.shiftKey ? SKIP_SECONDS : 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      seek(0);
    }
  }

  // What the preview shows.
  const atPlayhead = imageAt(plan, time)?.artifact ?? null;
  const selected = ordered.find((a) => a.id === selectedId && a.kind !== "script") ?? null;
  const current = follow ? atPlayhead ?? selected : selected ?? atPlayhead;
  const cue = cueAt(cues, time);

  function openFromList(item: Artifact) {
    onSelect(item.id);
    if (item.kind === "image") {
      const planned = plan.find((p) => p.artifact.id === item.id);
      if (planned) seek(planned.start);
    } else {
      setPlaying(false);
      setFollow(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-4 py-3">
        <FilmSlateIcon size={18} weight="bold" className="text-primary" />
        <h2 className="text-sm font-semibold text-neutral-900">Éditeur</h2>
        <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-500">
          Aperçu du montage : l&apos;assemblage de la vidéo finale arrive bientôt
        </span>
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
        <aside className="min-h-0 space-y-4 overflow-y-auto border-neutral-200 p-3 md:border-r">
          {KIND_TABS.filter((t) => t.kind !== "script").map((t) => {
            const items = ordered.filter((a) => a.kind === t.kind);
            return (
              <section key={t.kind} className="space-y-1.5">
                <h3 className="px-1 text-xs font-semibold text-neutral-500">
                  {t.label} ({items.length})
                </h3>
                {items.length === 0 ? (
                  <p className="px-1 text-xs text-neutral-400">Rien pour l&apos;instant.</p>
                ) : t.kind === "image" ? (
                  <div className="grid grid-cols-3 gap-1.5">
                    {items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => openFromList(item)}
                        title={item.title}
                        className={cn(
                          "relative aspect-square overflow-hidden rounded-lg border-2 bg-neutral-100",
                          item.id === current?.id ? "border-primary" : "border-transparent",
                        )}
                      >
                        {item.url && (
                          <Image src={item.url} alt="" fill sizes="90px" unoptimized className="object-cover" />
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openFromList(item)}
                      className={cn(
                        "flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm",
                        item.id === current?.id
                          ? "bg-primary/10 text-neutral-900"
                          : "text-neutral-600 hover:bg-neutral-100",
                      )}
                    >
                      <KindIcon kind={item.kind} size={16} />
                      <span className="truncate">{item.title}</span>
                    </button>
                  ))
                )}
              </section>
            );
          })}
        </aside>

        <div className="relative flex min-h-0 items-center justify-center bg-[#faf7f4] p-4">
          {current?.kind === "image" && current.url ? (
            <div className="relative h-full max-h-[520px] w-full">
              <Image src={current.url} alt={current.title} fill sizes="700px" unoptimized className="object-contain" />
            </div>
          ) : current?.kind === "voiceover" && current.url ? (
            <div className="w-full max-w-lg space-y-3 rounded-2xl border border-neutral-200 bg-white p-5">
              <p className="text-sm font-semibold text-neutral-900">{current.title}</p>
              <audio controls src={current.url} className="w-full" />
            </div>
          ) : current?.kind === "captions" ? (
            <pre className="max-h-full w-full max-w-lg overflow-y-auto whitespace-pre-wrap rounded-2xl border border-neutral-200 bg-white p-4 text-xs leading-relaxed text-neutral-600">
              {current.text}
            </pre>
          ) : property?.image ? (
            <div className="relative h-full max-h-[520px] w-full">
              <Image src={property.image} alt="" fill sizes="700px" unoptimized className="object-contain opacity-60" />
            </div>
          ) : (
            <p className="text-sm text-neutral-500">Les visuels et la voix du projet s&apos;afficheront ici.</p>
          )}
          {follow && cue && current?.kind === "image" && (
            <p
              aria-live="polite"
              className="pointer-events-none absolute inset-x-6 bottom-6 mx-auto max-w-md rounded-xl bg-neutral-900/80 px-4 py-2 text-center text-sm font-semibold leading-snug text-white"
            >
              {cue.text}
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-neutral-200 p-3">
        <StudioTimeline
          ordered={ordered}
          plan={plan}
          total={total}
          time={time}
          playing={playing}
          hasVoice={Boolean(voiceSrc)}
          selectedIds={current ? [current.id] : []}
          onSeek={seek}
          onToggle={toggle}
          onSkip={skip}
          onKey={onKey}
          onSelect={onSelect}
        />
      </div>

      {voiceSrc && (
        <audio
          key={voiceSrc.id}
          ref={audioRef}
          src={voiceSrc.url}
          preload="auto"
          onEnded={() => setPlaying(false)}
          className="hidden"
        />
      )}
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold text-neutral-500">{children}</h2>;
}

/* ---------- timeline ---------- */

const TRACK_HEIGHT = "h-9";

/**
 * The running order over the voice's length, with transport controls and a
 * playhead you can drag. Clicking a clip opens it and moves the playhead.
 */
export function StudioTimeline({
  ordered,
  plan,
  total,
  time,
  playing,
  hasVoice,
  selectedIds,
  onSeek,
  onToggle,
  onSkip,
  onKey,
  onSelect,
}: {
  ordered: Artifact[];
  plan: PlannedImage[];
  total: number;
  time: number;
  playing: boolean;
  hasVoice: boolean;
  selectedIds: string[];
  onSeek: (time: number) => void;
  onToggle: () => void;
  onSkip: (delta: number) => void;
  onKey: (event: React.KeyboardEvent) => void;
  onSelect: (id: string) => void;
}) {
  const voice = ordered.find((a) => a.kind === "voiceover");
  const captions = ordered.find((a) => a.kind === "captions");
  const step = total > 40 ? 10 : 5;
  const ticks = Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step);
  const laneRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  function timeFromPointer(event: React.PointerEvent): number {
    const lane = laneRef.current;
    if (!lane) return time;
    const rect = lane.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    return Math.min(total, Math.max(0, ratio * total));
  }

  function onPointerDown(event: React.PointerEvent) {
    if (event.button !== 0) return;
    dragging.current = true;
    laneRef.current?.setPointerCapture(event.pointerId);
    onSeek(timeFromPointer(event));
  }
  function onPointerMove(event: React.PointerEvent) {
    if (!dragging.current) return;
    onSeek(timeFromPointer(event));
  }
  function onPointerUp(event: React.PointerEvent) {
    dragging.current = false;
    laneRef.current?.releasePointerCapture(event.pointerId);
  }

  const clip = (artifact: Artifact, left: number, width: number, tone: string, label: string) => (
    <button
      key={artifact.id}
      type="button"
      onClick={() => onSelect(artifact.id)}
      title={artifact.title}
      style={{
        left: `${left}%`,
        width: `calc(${width}% - 3px)`,
        ...(artifact.kind === "image" && artifact.url
          ? { backgroundImage: `url("${artifact.url}")`, backgroundSize: "cover", backgroundPosition: "center" }
          : {}),
      }}
      className={cn(
        "absolute inset-y-0 truncate rounded-md border px-2 text-left text-[11px] font-bold text-neutral-900",
        tone,
        selectedIds.includes(artifact.id) && "ring-2 ring-primary",
      )}
    >
      {label}
    </button>
  );

  const control = "flex size-9 items-center justify-center rounded-lg text-neutral-700 hover:bg-neutral-100 disabled:opacity-40";
  const position = `${(time / total) * 100}%`;

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Heading>Chronologie</Heading>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => onSeek(0)} className={control} aria-label="Revenir au début" title="Début">
            <SkipBackIcon size={18} weight="fill" />
          </button>
          <button type="button" onClick={() => onSkip(-SKIP_SECONDS)} className={control} aria-label={`Reculer de ${SKIP_SECONDS} secondes`} title={`Reculer de ${SKIP_SECONDS} s`}>
            <RewindIcon size={18} weight="fill" />
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="flex size-10 items-center justify-center rounded-xl bg-primary text-white active:scale-[0.97]"
            aria-label={playing ? "Pause" : "Lecture"}
            title={playing ? "Pause (espace)" : "Lecture (espace)"}
          >
            {playing ? <PauseIcon size={20} weight="fill" /> : <PlayIcon size={20} weight="fill" />}
          </button>
          <button type="button" onClick={() => onSkip(SKIP_SECONDS)} className={control} aria-label={`Avancer de ${SKIP_SECONDS} secondes`} title={`Avancer de ${SKIP_SECONDS} s`}>
            <FastForwardIcon size={18} weight="fill" />
          </button>
          <span className="ml-2 min-w-[88px] text-right font-mono text-xs tabular-nums text-neutral-700">
            {clock(time)} / {clock(total)}
          </span>
        </div>
        <span className="w-full text-[11px] font-medium text-neutral-500 sm:w-auto sm:basis-full">
          {hasVoice
            ? `${total} s, d'après la voix. Glissez la tête de lecture ou utilisez espace et les flèches.`
            : `Sans voix, l'aperçu dure ${total} s. Générez une voix pour entendre le montage.`}
        </span>
      </div>

      <div className="flex">
        <div className="w-[72px] shrink-0 space-y-2 pt-5">
          {["Images", "Voix", "Sous-titres", "Musique"].map((label) => (
            <span key={label} className={cn(TRACK_HEIGHT, "flex items-center text-[11px] font-bold text-neutral-500")}>
              {label}
            </span>
          ))}
        </div>

        <div
          ref={laneRef}
          role="slider"
          tabIndex={0}
          aria-label="Tête de lecture"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={Math.round(time)}
          aria-valuetext={`${clock(time)} sur ${clock(total)}`}
          onKeyDown={onKey}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative min-w-0 flex-1 cursor-ew-resize touch-none select-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <div className="flex h-5 items-end justify-between border-b border-neutral-200 pb-1 text-[10px] font-medium text-neutral-500">
            {ticks.map((t) => (
              <span key={t}>{t}s</span>
            ))}
          </div>

          <div className="space-y-2 pt-2">
            <div className={cn("relative", TRACK_HEIGHT)}>
              {plan.length ? (
                plan.map((p, i) =>
                  clip(
                    p.artifact,
                    (p.start / total) * 100,
                    ((p.end - p.start) / total) * 100,
                    "border-white bg-neutral-200 text-transparent shadow-[0_0_0_1px_#e5e5e5]",
                    `Image ${i + 1}`,
                  ),
                )
              ) : (
                <Placeholder>Aucune image</Placeholder>
              )}
            </div>
            <div className={cn("relative", TRACK_HEIGHT)}>
              {voice ? clip(voice, 0, 100, "border-green-300 bg-green-100", voice.title) : <Placeholder>Aucune voix</Placeholder>}
            </div>
            <div className={cn("relative", TRACK_HEIGHT)}>
              {captions ? clip(captions, 0, 100, "border-violet-300 bg-violet-100", captions.title) : <Placeholder>Aucun sous-titre</Placeholder>}
            </div>
            <div className={cn("relative", TRACK_HEIGHT)}>
              <Placeholder>
                <MusicNotesIcon size={12} weight="bold" className="mr-1 inline" />
                Bientôt
              </Placeholder>
            </div>
          </div>

          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-primary"
            style={{ left: position }}
          >
            <span className="absolute -top-0.5 left-1/2 size-3 -translate-x-1/2 rotate-45 rounded-[2px] bg-primary shadow" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute inset-0 flex items-center rounded-md border border-dashed border-neutral-200 px-2 text-[11px] font-medium text-neutral-400">
      {children}
    </span>
  );
}
