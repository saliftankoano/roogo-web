"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  DotsSixVerticalIcon,
  FastForwardIcon,
  FilmSlateIcon,
  LockSimpleIcon,
  MusicNotesIcon,
  PauseIcon,
  PlayIcon,
  RewindIcon,
  SkipBackIcon,
  VideoCameraIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { CONTACT_NUMBER } from "@/lib/studio/chat-prompt";
import {
  TAIL,
  VIDEO_TEMPLATES,
  VOICE_DELAY,
  outroStart,
  planShots,
  type Shot,
} from "@/lib/studio/video-templates";
import { mergeOrder, moveItem } from "@/lib/studio/photo-order";
import type { Artifact, PropertySummary } from "./studio-types";

/* ---------- pure helpers (exported for tests) ---------- */

const DEFAULT_VOICE_SECONDS = 30;
const SKIP_SECONDS = 5;

export function clock(total: number): string {
  const whole = Math.max(0, Math.floor(total));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function seconds(artifact: Artifact | undefined): number | null {
  const value = artifact?.meta?.duration_seconds;
  return typeof value === "number" && value > 0 ? value : null;
}

const ORDER_KEY = (conversationId: string) => `roogo-studio-photo-order:${conversationId}`;

function readOrder(conversationId: string | null): string[] {
  if (!conversationId) return [];
  try {
    const raw = window.localStorage.getItem(ORDER_KEY(conversationId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeOrder(conversationId: string | null, order: string[]) {
  if (!conversationId) return;
  try {
    window.localStorage.setItem(ORDER_KEY(conversationId), JSON.stringify(order));
  } catch {
    // Not critical: the order falls back to the listing's own order.
  }
}

/* ---------- editor ---------- */

/**
 * The editor is a template, not a free canvas. Visite POV takes the listing's
 * own photos (reorder them by dragging), the project's voice-over, and ends on
 * the fixed price outro. Visuals generated in the Visuels tab never enter the
 * video. Play, pause, skip and drag the playhead to preview the cut.
 */
export function StudioEditor({
  conversationId,
  property,
  ordered,
  canWrite,
}: {
  conversationId: string | null;
  property: PropertySummary | null;
  ordered: Artifact[];
  canWrite: boolean;
}) {
  const template = VIDEO_TEMPLATES[0];
  const voice = [...ordered].reverse().find((a) => a.kind === "voiceover");
  const script = ordered.find((a) => a.kind === "script" && a.pinned) ?? ordered.find((a) => a.kind === "script");
  const voiceSeconds = seconds(voice) ?? DEFAULT_VOICE_SECONDS;
  const total = Math.round((VOICE_DELAY + voiceSeconds + TAIL) * 100) / 100;
  const outroFrom = outroStart(voiceSeconds, script?.text);

  const listingPhotos = useMemo(() => property?.photos ?? [], [property?.photos]);
  const [photos, setPhotos] = useState<string[]>(listingPhotos);
  useEffect(() => {
    setPhotos(mergeOrder(readOrder(conversationId), listingPhotos));
  }, [conversationId, listingPhotos]);

  const reorder = useCallback(
    (from: number, to: number) => {
      setPhotos((current) => {
        const next = moveItem(current, from, to);
        writeOrder(conversationId, next);
        return next;
      });
    },
    [conversationId],
  );

  const shots = useMemo(() => planShots(photos, outroFrom), [photos, outroFrom]);

  /* ---- playback clock ---- */
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const frameRef = useRef(0);
  const startRef = useRef<{ at: number; from: number }>({ at: 0, from: 0 });
  const timeRef = useRef(0);

  // Keep the first signed URL per voice: reloads re-sign and would reset audio.
  const [voiceSrc, setVoiceSrc] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    setVoiceSrc((current) =>
      !voice?.url ? null : current?.id === voice.id ? current : { id: voice.id, url: voice.url },
    );
  }, [voice?.id, voice?.url]);

  const syncAudio = useCallback(
    (at: number, shouldPlay: boolean) => {
      const audio = audioRef.current;
      if (!audio) return;
      const offset = at - VOICE_DELAY;
      if (offset < 0 || offset >= (Number.isFinite(audio.duration) ? audio.duration : voiceSeconds)) {
        audio.pause();
        if (offset < 0) audio.currentTime = 0;
        return;
      }
      if (Math.abs(audio.currentTime - offset) > 0.25) audio.currentTime = offset;
      if (shouldPlay && audio.paused) void audio.play().catch(() => setPlaying(false));
      if (!shouldPlay) audio.pause();
    },
    [voiceSeconds],
  );

  const seek = useCallback(
    (next: number) => {
      const target = Math.min(total, Math.max(0, next));
      timeRef.current = target;
      setTime(target);
      startRef.current = { at: performance.now(), from: target };
      syncAudio(target, playing);
    },
    [total, syncAudio, playing],
  );

  useEffect(() => {
    if (!playing) {
      audioRef.current?.pause();
      return;
    }
    startRef.current = { at: performance.now(), from: timeRef.current };
    const tick = () => {
      const next = startRef.current.from + (performance.now() - startRef.current.at) / 1000;
      if (next >= total) {
        timeRef.current = total;
        setTime(total);
        setPlaying(false);
        return;
      }
      timeRef.current = next;
      setTime(next);
      syncAudio(next, true);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [playing, total, syncAudio]);

  function toggle() {
    if (!playing && timeRef.current >= total) seek(0);
    setPlaying((value) => !value);
  }

  function onKey(event: React.KeyboardEvent) {
    const step = event.shiftKey ? SKIP_SECONDS : 1;
    if (event.key === " ") {
      event.preventDefault();
      toggle();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      seek(timeRef.current - step);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      seek(timeRef.current + step);
    } else if (event.key === "Home") {
      event.preventDefault();
      seek(0);
    }
  }

  const inOutro = time >= outroFrom;
  const shotIndex = inOutro ? -1 : shots.findIndex((s) => time >= s.start && time < s.end);
  const shot = shotIndex >= 0 ? shots[shotIndex] : null;

  if (!property) {
    return (
      <EditorFrame templateLabel={template.label}>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-neutral-500">
          <VideoCameraIcon size={28} weight="bold" className="text-neutral-400" />
          <p className="max-w-sm text-sm">
            Le modèle {template.label} part des photos d&apos;un bien. Choisissez un bien en haut de la page pour
            préparer la vidéo.
          </p>
        </div>
      </EditorFrame>
    );
  }

  return (
    <EditorFrame templateLabel={template.label} description={template.description}>
      <div className="grid min-h-[300px] flex-1 overflow-hidden md:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
        <aside className="min-h-0 space-y-4 overflow-y-auto border-neutral-200 p-3 md:border-r">
          <section className="space-y-2">
            <div className="flex items-baseline justify-between gap-2 px-1">
              <h3 className="text-xs font-semibold text-neutral-500">Photos du bien ({photos.length})</h3>
              <span className="text-[11px] text-neutral-400">{canWrite ? "Glissez pour l'ordre" : "Lecture seule"}</span>
            </div>
            {photos.length === 0 ? (
              <p className="px-1 text-xs text-neutral-500">Ce bien n&apos;a pas encore de photos.</p>
            ) : (
              <PhotoOrder photos={photos} activeIndex={shot ? photos.indexOf(shot.src) : -1} canWrite={canWrite} onMove={reorder} />
            )}
          </section>

          <section className="space-y-1.5">
            <h3 className="px-1 text-xs font-semibold text-neutral-500">Voix off</h3>
            {voice ? (
              <p className="rounded-lg bg-green-50 px-2 py-2 text-sm text-neutral-800">
                {voice.title} · {clock(voiceSeconds)}
              </p>
            ) : (
              <p className="px-1 text-xs text-neutral-500">
                Aucune voix. Générez-la depuis le script dans le Chat ; l&apos;aperçu suppose {DEFAULT_VOICE_SECONDS} s.
              </p>
            )}
          </section>

          <section className="space-y-1.5">
            <h3 className="px-1 text-xs font-semibold text-neutral-500">Fin de la vidéo</h3>
            <p className="flex items-center gap-1.5 px-1 text-xs text-neutral-500">
              <LockSimpleIcon size={12} weight="bold" className="shrink-0" />
              Fin standard Roogo : prix et numéro, identique sur toutes les vidéos.
            </p>
          </section>
        </aside>

        <div className="relative min-h-[320px] overflow-hidden bg-[#faf7f4]">
          {/* Absolute so the 9:16 frame takes the pane's height, never more. */}
          <div className="absolute inset-4 flex items-center justify-center">
          <div className="relative aspect-[9/16] h-full max-h-[520px] overflow-hidden rounded-2xl bg-neutral-900 shadow-lg">
            {inOutro ? (
              <OutroPreview property={property} />
            ) : shot ? (
              <ShotPreview shot={shot} time={time} />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-xs text-neutral-400">Aucune photo</span>
            )}
            <span className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-white/90 shadow">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png?v=2" alt="" className="size-5 object-contain" />
            </span>
          </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-neutral-200 p-3">
        <Timeline
          shots={shots}
          total={total}
          outroFrom={outroFrom}
          voiceSeconds={voiceSeconds}
          hasVoice={Boolean(voiceSrc)}
          time={time}
          playing={playing}
          onSeek={seek}
          onToggle={toggle}
          onKey={onKey}
        />
      </div>

      {voiceSrc && (
        <audio key={voiceSrc.id} ref={audioRef} src={voiceSrc.url} preload="auto" className="hidden" />
      )}
    </EditorFrame>
  );
}

function EditorFrame({
  templateLabel,
  description,
  children,
}: {
  templateLabel: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-4 py-3">
        <FilmSlateIcon size={18} weight="bold" className="shrink-0 text-primary" />
        <h2 className="text-sm font-semibold text-neutral-900">Éditeur</h2>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
          Modèle : {templateLabel}
        </span>
        {description && <span className="hidden text-xs text-neutral-500 lg:inline">{description}</span>}
        <button
          type="button"
          disabled
          title="Le rendu de la vidéo arrive bientôt"
          className="ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-neutral-100 px-3 text-sm font-semibold text-neutral-400"
        >
          <VideoCameraIcon size={16} weight="bold" className="size-4 shrink-0" />
          Créer la vidéo
          <span className="text-xs font-medium">(bientôt)</span>
        </button>
      </div>
      {children}
    </div>
  );
}

/* ---------- photo order ---------- */

function PhotoOrder({
  photos,
  activeIndex,
  canWrite,
  onMove,
}: {
  photos: string[];
  activeIndex: number;
  canWrite: boolean;
  onMove: (from: number, to: number) => void;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  return (
    <ol className="grid grid-cols-3 gap-1.5">
      {photos.map((url, index) => (
        <li
          key={url}
          draggable={canWrite}
          onDragStart={(event) => {
            setDragFrom(index);
            event.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(event) => {
            if (dragFrom === null) return;
            event.preventDefault();
            setOver(index);
          }}
          onDragLeave={() => setOver((current) => (current === index ? null : current))}
          onDrop={(event) => {
            event.preventDefault();
            if (dragFrom !== null) onMove(dragFrom, index);
            setDragFrom(null);
            setOver(null);
          }}
          onDragEnd={() => {
            setDragFrom(null);
            setOver(null);
          }}
          className={cn(
            "group relative aspect-square overflow-hidden rounded-lg border-2 bg-neutral-100 transition-[transform,border-color,opacity] duration-150",
            index === activeIndex ? "border-primary" : "border-transparent",
            canWrite && "cursor-grab active:cursor-grabbing",
            dragFrom === index && "opacity-40",
            over === index && dragFrom !== index && "scale-[0.96] border-primary/60",
          )}
        >
          <Image src={url} alt={`Photo ${index + 1}`} fill sizes="96px" unoptimized className="pointer-events-none object-cover" />
          <span className="absolute left-1 top-1 rounded-md bg-white/90 px-1.5 text-[10px] font-bold tabular-nums text-neutral-800">
            {index + 1}
          </span>
          {canWrite && (
            <>
              <DotsSixVerticalIcon
                size={14}
                weight="bold"
                className="absolute right-1 top-1 shrink-0 text-white drop-shadow"
              />
              <span className="absolute inset-x-1 bottom-1 flex justify-between opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => onMove(index, index - 1)}
                  aria-label={`Avancer la photo ${index + 1}`}
                  className="flex size-6 items-center justify-center rounded-md bg-white/90 text-neutral-800 disabled:opacity-30"
                >
                  <ArrowLeftIcon size={12} weight="bold" className="shrink-0" />
                </button>
                <button
                  type="button"
                  disabled={index === photos.length - 1}
                  onClick={() => onMove(index, index + 1)}
                  aria-label={`Reculer la photo ${index + 1}`}
                  className="flex size-6 items-center justify-center rounded-md bg-white/90 text-neutral-800 disabled:opacity-30"
                >
                  <ArrowRightIcon size={12} weight="bold" className="shrink-0" />
                </button>
              </span>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}

/* ---------- previews ---------- */

/** One photo with the template's slow camera drift at the current time. */
function ShotPreview({ shot, time }: { shot: Shot; time: number }) {
  const progress = Math.min(1, Math.max(0, (time - shot.start) / Math.max(0.01, shot.end - shot.start)));
  const scale = shot.zoom[0] + (shot.zoom[1] - shot.zoom[0]) * progress;
  const x = (shot.pan[0] + (shot.pan[1] - shot.pan[0]) * progress) * 100;
  return (
    <div key={shot.start} className="absolute inset-0 animate-[studio-fade_0.4s_ease-out]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={shot.src}
        alt=""
        className="size-full object-cover will-change-transform"
        style={{ transform: `scale(${scale})`, transformOrigin: `${x}% ${shot.y * 100}%` }}
      />
    </div>
  );
}

/** Mirrors the fixed HyperFrames outro: headline, place, price, call number. */
function OutroPreview({ property }: { property: PropertySummary }) {
  const [headline] = property.title.split(",");
  return (
    <div className="absolute inset-0 flex animate-[studio-fade_0.4s_ease-out] flex-col items-center justify-end gap-2 bg-primary p-5 pb-10 text-center text-white">
      {property.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={property.image} alt="" className="absolute inset-x-0 top-0 h-1/2 w-full object-cover opacity-90" />
      )}
      <p className="relative text-2xl font-black leading-tight">{headline}</p>
      <p className="relative text-xs font-semibold opacity-90">{property.place}</p>
      <p className="relative whitespace-nowrap rounded-full bg-neutral-900 px-4 py-1.5 text-sm font-black tabular-nums">{property.price}</p>
      <p className="relative text-xs font-bold tabular-nums">Appelez ou WhatsApp {CONTACT_NUMBER}</p>
    </div>
  );
}

/* ---------- timeline ---------- */

const TRACK = "h-9";

function Timeline({
  shots,
  total,
  outroFrom,
  voiceSeconds,
  hasVoice,
  time,
  playing,
  onSeek,
  onToggle,
  onKey,
}: {
  shots: Shot[];
  total: number;
  outroFrom: number;
  voiceSeconds: number;
  hasVoice: boolean;
  time: number;
  playing: boolean;
  onSeek: (time: number) => void;
  onToggle: () => void;
  onKey: (event: React.KeyboardEvent) => void;
}) {
  const laneRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const step = total > 40 ? 10 : 5;
  const ticks = Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step);
  const pct = (value: number) => `${(value / total) * 100}%`;

  const fromPointer = (event: React.PointerEvent) => {
    const rect = laneRef.current?.getBoundingClientRect();
    if (!rect) return time;
    return Math.min(total, Math.max(0, ((event.clientX - rect.left) / rect.width) * total));
  };

  const control =
    "flex size-9 shrink-0 items-center justify-center rounded-lg text-neutral-700 transition-colors hover:bg-neutral-100";

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xs font-semibold text-neutral-500">Chronologie</h2>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => onSeek(0)} className={control} aria-label="Revenir au début" title="Début">
            <SkipBackIcon size={18} weight="fill" className="size-[18px] shrink-0" />
          </button>
          <button type="button" onClick={() => onSeek(time - SKIP_SECONDS)} className={control} aria-label={`Reculer de ${SKIP_SECONDS} secondes`}>
            <RewindIcon size={18} weight="fill" className="size-[18px] shrink-0" />
          </button>
          <button
            type="button"
            onClick={onToggle}
            aria-label={playing ? "Pause" : "Lecture"}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-transform active:scale-[0.96]"
          >
            {playing ? (
              <PauseIcon size={20} weight="fill" className="size-5 shrink-0" />
            ) : (
              <PlayIcon size={20} weight="fill" className="size-5 shrink-0" />
            )}
          </button>
          <button type="button" onClick={() => onSeek(time + SKIP_SECONDS)} className={control} aria-label={`Avancer de ${SKIP_SECONDS} secondes`}>
            <FastForwardIcon size={18} weight="fill" className="size-[18px] shrink-0" />
          </button>
          <span className="ml-2 w-[5.5rem] text-right font-mono text-xs tabular-nums text-neutral-700">
            {clock(time)} / {clock(total)}
          </span>
        </div>
        <p className="w-full text-[11px] text-neutral-500">
          {hasVoice
            ? "Glissez la tête de lecture, ou utilisez espace et les flèches."
            : `Sans voix, l'aperçu suppose ${DEFAULT_VOICE_SECONDS} s de narration.`}
        </p>
      </div>

      <div className="flex">
        <div className="w-[72px] shrink-0 space-y-2 pt-5">
          {["Photos", "Voix", "Musique"].map((label) => (
            <span key={label} className={cn(TRACK, "flex items-center text-[11px] font-bold text-neutral-500")}>
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
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(time)}
          aria-valuetext={`${clock(time)} sur ${clock(total)}`}
          onKeyDown={onKey}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            dragging.current = true;
            laneRef.current?.setPointerCapture(event.pointerId);
            onSeek(fromPointer(event));
          }}
          onPointerMove={(event) => dragging.current && onSeek(fromPointer(event))}
          onPointerUp={(event) => {
            dragging.current = false;
            laneRef.current?.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
          className="relative min-w-0 flex-1 cursor-ew-resize touch-none select-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <div className="flex h-5 items-end justify-between border-b border-neutral-200 pb-1 text-[10px] font-medium tabular-nums text-neutral-500">
            {ticks.map((t) => (
              <span key={t}>{t}s</span>
            ))}
          </div>

          <div className="space-y-2 pt-2">
            <div className={cn("relative", TRACK)}>
              {shots.map((s, i) => (
                <span
                  key={`${s.start}-${i}`}
                  className="absolute inset-y-0 overflow-hidden rounded-md border border-white bg-neutral-200 shadow-[0_0_0_1px_#e5e5e5]"
                  style={{
                    left: pct(s.start),
                    width: `calc(${pct(s.end - s.start)} - 3px)`,
                    backgroundImage: `url("${s.src}")`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
              ))}
              <span
                className="absolute inset-y-0 flex items-center gap-1 overflow-hidden rounded-md border border-primary/30 bg-primary/15 px-2 text-[11px] font-bold text-primary"
                style={{ left: pct(outroFrom), width: pct(total - outroFrom) }}
              >
                <LockSimpleIcon size={11} weight="bold" className="shrink-0" />
                <span className="truncate">Fin fixe</span>
              </span>
            </div>
            <div className={cn("relative", TRACK)}>
              <span
                className={cn(
                  "absolute inset-y-0 flex items-center truncate rounded-md border px-2 text-[11px] font-bold",
                  hasVoice ? "border-green-300 bg-green-100 text-neutral-900" : "border-dashed border-neutral-300 text-neutral-400",
                )}
                style={{ left: pct(VOICE_DELAY), width: pct(voiceSeconds) }}
              >
                {hasVoice ? "Voix off" : "Voix à générer"}
              </span>
            </div>
            <div className={cn("relative", TRACK)}>
              <span className="absolute inset-0 flex items-center rounded-md border border-dashed border-neutral-200 px-2 text-[11px] font-medium text-neutral-400">
                <MusicNotesIcon size={12} weight="bold" className="mr-1 shrink-0" />
                Bientôt
              </span>
            </div>
          </div>

          <div aria-hidden className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-primary" style={{ left: pct(time) }}>
            <span className="absolute -top-0.5 left-1/2 size-3 -translate-x-1/2 rotate-45 rounded-[2px] bg-primary shadow" />
          </div>
        </div>
      </div>
    </section>
  );
}
