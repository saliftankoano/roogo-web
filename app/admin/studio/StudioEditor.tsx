"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DownloadSimpleIcon,
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
  SpinnerGapIcon,
  VideoCameraIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Nunito } from "next/font/google";
import { CONTACT_NUMBER } from "@/lib/studio/chat-prompt";
import {
  TAIL,
  VIDEO_TEMPLATES,
  VOICE_DELAY,
  MAX_VOICE_DELAY,
  clampVoiceDelay,
  defaultOutro,
  estimateVideoCostUsd,
  OUTRO_ONLY_SECONDS,
  outroStart,
  type OutroText,
  planShots,
  musicEnvelope,
  musicLevelAt,
  MUSIC_ALONE,
  type Shot,
} from "@/lib/studio/video-templates";
import { mergeOrder, moveItem } from "@/lib/studio/photo-order";
import { OutroEditor } from "./OutroEditor";
import { MusicPanel, type MusicTrack } from "./MusicPanel";
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

// Where the voice starts, per project (dragged on the timeline); used by the render too.
const DELAY_KEY = (conversationId: string) => `roogo-studio-voice-delay:${conversationId}`;

function readDelay(conversationId: string | null): number {
  if (!conversationId) return VOICE_DELAY;
  try {
    const raw = window.localStorage.getItem(DELAY_KEY(conversationId));
    return raw === null ? VOICE_DELAY : clampVoiceDelay(Number(raw));
  } catch {
    return VOICE_DELAY;
  }
}

function writeDelay(conversationId: string | null, value: number) {
  if (!conversationId) return;
  try {
    window.localStorage.setItem(DELAY_KEY(conversationId), String(value));
  } catch {
    // Not critical: the voice falls back to its default start.
  }
}

// The outro's photo and text, per project (edited in the Éditeur, used by the render).
const OUTRO_KEY = (conversationId: string) => `roogo-studio-outro:${conversationId}`;

function readOutro(conversationId: string | null): Partial<OutroText> | null {
  if (!conversationId) return null;
  try {
    const raw = window.localStorage.getItem(OUTRO_KEY(conversationId));
    return raw ? (JSON.parse(raw) as Partial<OutroText>) : null;
  } catch {
    return null;
  }
}

function writeOutro(conversationId: string | null, value: OutroText | null) {
  if (!conversationId) return;
  try {
    if (value) window.localStorage.setItem(OUTRO_KEY(conversationId), JSON.stringify(value));
    else window.localStorage.removeItem(OUTRO_KEY(conversationId));
  } catch {
    // Not critical: the outro falls back to the listing's text.
  }
}

// The chosen music, per project (Salif, 2026-10-11).
const MUSIC_KEY = (conversationId: string) => `roogo-studio-music:${conversationId}`;

function readMusic(conversationId: string | null): string | null {
  if (!conversationId) return null;
  try {
    return window.localStorage.getItem(MUSIC_KEY(conversationId));
  } catch {
    return null;
  }
}

function writeMusic(conversationId: string | null, id: string | null) {
  if (!conversationId) return;
  try {
    if (id) window.localStorage.setItem(MUSIC_KEY(conversationId), id);
    else window.localStorage.removeItem(MUSIC_KEY(conversationId));
  } catch {
    // Not critical: the video is made without music.
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
  money,
  videoRemainingUsd,
  onRendered,
  onOpenArtifact,
}: {
  conversationId: string | null;
  property: PropertySummary | null;
  ordered: Artifact[];
  canWrite: boolean;
  money: (usd: number) => string;
  videoRemainingUsd: number | null;
  onRendered: () => void;
  onOpenArtifact: (artifactId: string) => void;
}) {
  const template = VIDEO_TEMPLATES[0];
  // The newest finished video of this project, offered for download in the header.
  const latestVideo = ordered
    .filter((a) => a.kind === "video" && a.downloadUrl)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  // The newest voice-over, by date (pinning must not change which one is used):
  // the render route picks the same one.
  const voice = ordered
    .filter((a) => a.kind === "voiceover")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const script = ordered.find((a) => a.kind === "script" && a.pinned) ?? ordered.find((a) => a.kind === "script");
  const voiceSeconds = seconds(voice) ?? DEFAULT_VOICE_SECONDS;
  const [voiceDelay, setVoiceDelay] = useState(VOICE_DELAY);
  useEffect(() => setVoiceDelay(readDelay(conversationId)), [conversationId]);
  const moveVoice = useCallback(
    (next: number) => {
      const value = clampVoiceDelay(next);
      setVoiceDelay(value);
      writeDelay(conversationId, value);
    },
    [conversationId],
  );
  const total = Math.round((voiceDelay + voiceSeconds + TAIL) * 100) / 100;
  const outroFrom = outroStart(voiceSeconds, script?.text, voiceDelay);

  const listingPhotos = useMemo(() => property?.photos ?? [], [property?.photos]);

  // "Vidéo complète" builds the whole Visite POV; "Fin seule" makes only the outro,
  // for videos the team filmed in person (Salif, 2026-10-10).
  const [mode, setMode] = useState<"full" | "outro">("full");
  const listingOutro = useMemo(
    () => (property ? defaultOutro(property, CONTACT_NUMBER) : null),
    [property],
  );
  const [outro, setOutro] = useState<OutroText | null>(listingOutro);
  useEffect(() => {
    // Saved edits apply to the text and photo only; the price always comes from the listing.
    const saved = readOutro(conversationId) ?? {};
    setOutro(listingOutro ? { ...listingOutro, ...saved, price: listingOutro.price, currency: listingOutro.currency } : null);
  }, [conversationId, listingOutro]);
  const changeOutro = useCallback(
    (next: OutroText) => {
      setOutro(next);
      writeOutro(conversationId, next);
    },
    [conversationId],
  );
  const resetOutro = useCallback(() => {
    setOutro(listingOutro);
    writeOutro(conversationId, null);
  }, [conversationId, listingOutro]);

  /* ---- music ---- */
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [tracksLoading, setTracksLoading] = useState(true);
  const [musicResume, setMusicResume] = useState<{ id: string; createdAt: string } | null>(null);
  const [musicId, setMusicId] = useState<string | null>(null);
  const [musicOpen, setMusicOpen] = useState(false);
  useEffect(() => setMusicId(readMusic(conversationId)), [conversationId]);
  const loadTracks = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/studio/music");
      if (!res.ok) return;
      const data = (await res.json()) as { tracks?: MusicTrack[]; running?: { id: string; createdAt: string }[] };
      // Keep the first signed URL per track: re-signing would restart the preview.
      setTracks((current) =>
        (data.tracks ?? []).map((t) => ({ ...t, url: current.find((c) => c.id === t.id)?.url ?? t.url })),
      );
      setMusicResume(data.running?.[0] ?? null);
    } finally {
      setTracksLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadTracks();
  }, [loadTracks]);
  const chooseMusic = useCallback(
    (id: string | null) => {
      setMusicId(id);
      writeMusic(conversationId, id);
    },
    [conversationId],
  );
  const music = tracks.find((t) => t.id === musicId) ?? null;
  const musicPoints = useMemo(
    () => musicEnvelope(total, voice ? { start: voiceDelay, end: voiceDelay + voiceSeconds } : null),
    [total, voice, voiceDelay, voiceSeconds],
  );

  /* ---- rendering (HeyGen) ---- */
  const [render, setRender] = useState<
    | { state: "idle" }
    | { state: "starting" }
    | { state: "running"; id: string; startedAt: number }
    | { state: "done"; artifactId: string | null }
    | { state: "failed"; error: string }
  >({ state: "idle" });
  const [now, setNow] = useState(() => Date.now());

  // Resume a render still running after a reload or a switch of view.
  useEffect(() => {
    setRender({ state: "idle" });
    if (!conversationId) return;
    let cancelled = false;
    void fetch(`/api/admin/studio/videos?conversation_id=${conversationId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { running?: { id: string; createdAt: string }[] } | null) => {
        const job = data?.running?.[0];
        if (!cancelled && job) setRender({ state: "running", id: job.id, startedAt: new Date(job.createdAt).getTime() });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const renderId = render.state === "running" ? render.id : null;
  const onRenderedRef = useRef(onRendered);
  onRenderedRef.current = onRendered;
  useEffect(() => {
    if (!renderId) return;
    let stopped = false;
    const tick = async () => {
      setNow(Date.now());
      try {
        const res = await fetch(`/api/admin/studio/videos/${renderId}`);
        const data = (await res.json().catch(() => ({}))) as { state?: string; artifactId?: string; error?: string };
        if (stopped) return;
        if (data.state === "done") {
          setRender({ state: "done", artifactId: data.artifactId ?? null });
          onRenderedRef.current();
        } else if (data.state === "failed" || res.status === 404) {
          setRender({ state: "failed", error: data.error ?? "Le rendu a échoué." });
          onRenderedRef.current();
        }
      } catch {
        // Transient: next tick.
      }
    };
    const timer = window.setInterval(tick, 4000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.clearInterval(clock);
    };
  }, [renderId]);
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
  const musicRef = useRef<HTMLAudioElement | null>(null);
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

  const syncMusic = useCallback(
    (at: number, shouldPlay: boolean) => {
      const audio = musicRef.current;
      if (!audio) return;
      const length = Number.isFinite(audio.duration) ? audio.duration : Infinity;
      if (at >= length) {
        audio.pause();
        return;
      }
      audio.volume = Math.min(1, Math.max(0, musicLevelAt(musicPoints, at)));
      if (Math.abs(audio.currentTime - at) > 0.25) audio.currentTime = at;
      if (shouldPlay && audio.paused) void audio.play().catch(() => {});
      if (!shouldPlay) audio.pause();
    },
    [musicPoints],
  );

  const syncAudio = useCallback(
    (at: number, shouldPlay: boolean) => {
      syncMusic(at, shouldPlay);
      const audio = audioRef.current;
      if (!audio) return;
      const offset = at - voiceDelay;
      if (offset < 0 || offset >= (Number.isFinite(audio.duration) ? audio.duration : voiceSeconds)) {
        audio.pause();
        if (offset < 0) audio.currentTime = 0;
        return;
      }
      if (Math.abs(audio.currentTime - offset) > 0.25) audio.currentTime = offset;
      if (shouldPlay && audio.paused) void audio.play().catch(() => setPlaying(false));
      if (!shouldPlay) audio.pause();
    },
    [voiceSeconds, voiceDelay, syncMusic],
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
      musicRef.current?.pause();
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

  const renderSeconds = mode === "outro" ? OUTRO_ONLY_SECONDS : total;
  const estimateUsd = estimateVideoCostUsd(renderSeconds);
  const blocker = !canWrite
    ? "Lecture seule"
    : mode === "full" && !voice
      ? "Générez d'abord la voix off"
      : mode === "full" && photos.length === 0
        ? "Ce bien n'a pas de photo"
        : videoRemainingUsd !== null && estimateUsd > videoRemainingUsd
          ? "Budget vidéo du mois atteint"
          : null;

  async function createVideo() {
    if (!conversationId || blocker) return;
    setRender({ state: "starting" });
    try {
      const res = await fetch("/api/admin/studio/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          mode,
          photos,
          voice_delay: voiceDelay,
          outro,
          music_track_id: music?.id ?? null,
          acknowledged_cost_usd: estimateUsd,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string; estimateUsd?: number };
      if (!res.ok || !data.id) {
        setRender({
          state: "failed",
          error: res.status === 409 ? "Le prix a changé. Vérifiez-le puis relancez." : (data.error ?? "Le rendu n'a pas pu démarrer."),
        });
        return;
      }
      setRender({ state: "running", id: data.id, startedAt: Date.now() });
      onRendered();
    } catch {
      setRender({ state: "failed", error: "Connexion impossible. Réessayez." });
    }
  }

  const action = {
    label: mode === "outro" ? "Créer la fin" : "Créer la vidéo",
    price: money(estimateUsd),
    blocker,
    busy: render.state === "starting" || render.state === "running",
    status:
      render.state === "running"
        ? `Rendu en cours · ${Math.max(0, Math.round((now - render.startedAt) / 1000))} s (environ 1 min)`
        : render.state === "starting"
          ? "Envoi au rendu…"
          : render.state === "failed"
            ? render.error
            : render.state === "done"
              ? "Vidéo prête"
              : null,
    tone: render.state === "failed" ? ("error" as const) : render.state === "done" ? ("ok" as const) : ("info" as const),
    onCreate: () => void createVideo(),
    downloadUrl: latestVideo?.downloadUrl ?? null,
    downloadLabel: latestVideo?.title === "Fin seule" ? "Télécharger la fin" : "Télécharger la vidéo",
    onOpen:
      render.state === "done" && render.artifactId
        ? () => onOpenArtifact((render as { artifactId: string }).artifactId)
        : undefined,
  };

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
    <EditorFrame
      templateLabel={mode === "outro" ? "Fin seule" : template.label}
      description={mode === "outro" ? `${OUTRO_ONLY_SECONDS} s à ajouter à la fin d'une vidéo filmée sur place.` : template.description}
      mode={mode}
      onMode={setMode}
      action={action}
    >
      <div className="relative grid md:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
        <MusicPanel
          open={musicOpen}
          onClose={() => setMusicOpen(false)}
          tracks={tracks}
          loading={tracksLoading}
          selectedId={music?.id ?? null}
          onSelect={chooseMusic}
          conversationId={conversationId}
          canWrite={canWrite}
          money={money}
          videoSeconds={renderSeconds}
          resume={musicResume}
          onGenerated={(id) => {
            void loadTracks().then(() => {
              if (id) chooseMusic(id);
            });
          }}
        />
        <aside className="space-y-4 border-neutral-200 p-3 md:border-r">
          {mode === "full" && (
          <>
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

          </>
          )}

          <section className="space-y-1.5">
            <h3 className="px-1 text-xs font-semibold text-neutral-500">Musique</h3>
            <button
              type="button"
              onClick={() => setMusicOpen(true)}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                music
                  ? "bg-[rgba(91,58,122,0.08)] text-neutral-800 hover:bg-[rgba(91,58,122,0.12)]"
                  : "border border-dashed border-neutral-300 text-neutral-500 hover:border-primary/50 hover:text-primary",
              )}
            >
              <MusicNotesIcon size={16} weight="bold" className={cn("shrink-0", music ? "text-[#5b3a7a]" : "")} />
              <span className="min-w-0 flex-1 truncate">{music ? music.title : "Ajouter une musique"}</span>
              <span className="shrink-0 text-xs font-semibold text-primary">{music ? "Changer" : "Choisir"}</span>
            </button>
          </section>

          <section className="space-y-2">
            <h3 className="px-1 text-xs font-semibold text-neutral-500">
              {mode === "outro" ? "La fin" : "Fin de la vidéo"}
            </h3>
            {outro && (
              <OutroEditor outro={outro} photos={listingPhotos} canWrite={canWrite} onChange={changeOutro} onReset={resetOutro} />
            )}
          </section>
        </aside>

        <div className="relative min-h-[440px] overflow-hidden bg-[#faf7f4] lg:min-h-[560px]">
          {/* Absolute so the 9:16 frame takes the pane's height, never more. */}
          <div className="absolute inset-4 flex items-center justify-center">
          <div className="relative aspect-[9/16] h-full max-h-[520px] overflow-hidden rounded-2xl bg-neutral-900 shadow-lg">
            {(mode === "outro" || inOutro) && outro ? (
              <OutroPreview outro={outro} />
            ) : shot ? (
              <ShotPreview shot={shot} time={time} />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-xs text-neutral-400">Aucune photo</span>
            )}
            {/* The corner watermark steps aside during the outro, which shows the full logo. */}
            {mode === "full" && !inOutro && (
              <span className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-white/90 shadow">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png?v=2" alt="" className="size-5 object-contain" />
              </span>
            )}
          </div>
          </div>
        </div>
      </div>

      <div className={cn("shrink-0 border-t border-neutral-200 p-3", mode === "outro" && "hidden")}>
        <Timeline
          shots={shots}
          total={total}
          outroFrom={outroFrom}
          voiceSeconds={voiceSeconds}
          voiceDelay={voiceDelay}
          onMoveVoice={canWrite ? moveVoice : undefined}
          hasVoice={Boolean(voiceSrc)}
          musicTitle={music?.title ?? null}
          musicPoints={musicPoints}
          onOpenMusic={() => setMusicOpen(true)}
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
      {music?.url && <audio key={music.id} ref={musicRef} src={music.url} preload="auto" className="hidden" />}
    </EditorFrame>
  );
}

function EditorFrame({
  templateLabel,
  description,
  mode,
  onMode,
  action,
  children,
}: {
  templateLabel: string;
  description?: string;
  mode?: "full" | "outro";
  onMode?: (mode: "full" | "outro") => void;
  action?: {
    label: string;
    price: string;
    blocker: string | null;
    busy: boolean;
    status: string | null;
    tone: "info" | "ok" | "error";
    onCreate: () => void;
    onOpen?: () => void;
    downloadUrl?: string | null;
    downloadLabel?: string;
  };
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-4 py-3">
        <FilmSlateIcon size={18} weight="bold" className="shrink-0 text-primary" />
        <h2 className="text-sm font-semibold text-neutral-900">Éditeur</h2>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
          Modèle : {templateLabel}
        </span>
        {mode && onMode && (
          <div role="tablist" aria-label="Que créer" className="flex rounded-xl border border-neutral-200 bg-white p-0.5">
            {(
              [
                ["full", "Vidéo complète"],
                ["outro", "Fin seule"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={mode === key}
                onClick={() => onMode(key)}
                className={cn(
                  "h-8 cursor-pointer rounded-[10px] px-3 text-xs font-semibold transition-colors",
                  mode === key ? "bg-primary/10 text-[#b45a22]" : "text-neutral-500 hover:text-neutral-800",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {description && <span className="hidden text-xs text-neutral-500 lg:inline">{description}</span>}
        {action ? (
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
            {action.status && (
              <span
                role="status"
                className={cn(
                  "inline-flex min-w-0 items-center gap-1.5 truncate text-xs font-semibold",
                  action.tone === "error" ? "text-red-700" : action.tone === "ok" ? "text-green-700" : "text-neutral-600",
                )}
              >
                {action.busy && <SpinnerGapIcon size={14} className="size-3.5 shrink-0 animate-spin" />}
                {action.status}
                {action.onOpen && (
                  <button type="button" onClick={action.onOpen} className="cursor-pointer underline underline-offset-2">
                    Voir
                  </button>
                )}
              </span>
            )}
            {action.downloadUrl && (
              <a
                href={action.downloadUrl}
                title="La vidéo la plus récente de ce projet"
                className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-neutral-200 bg-white px-3.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/5 active:scale-[0.985]"
              >
                <DownloadSimpleIcon size={16} weight="bold" className="size-4 shrink-0" />
                {action.downloadLabel ?? "Télécharger la vidéo"}
              </a>
            )}
            <button
              type="button"
              onClick={action.onCreate}
              disabled={action.busy || action.blocker !== null}
              title={action.blocker ?? `Prix estimé : ${action.price}, pris sur le budget vidéo du mois`}
              className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-[0_6px_16px_-8px_rgba(201,106,46,0.8)] transition-transform active:scale-[0.985] disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500 disabled:shadow-none"
            >
              {action.busy ? (
                <SpinnerGapIcon size={16} className="size-4 shrink-0 animate-spin" />
              ) : (
                <VideoCameraIcon size={16} weight="bold" className="size-4 shrink-0" />
              )}
              {action.blocker ?? action.label}
              {!action.blocker && <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-xs font-bold tabular-nums">≈ {action.price}</span>}
            </button>
          </div>
        ) : null}
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

// The rendered outro is set in Nunito; the preview must use it too or lines wrap differently.
const nunito = Nunito({ subsets: ["latin"], weight: ["700", "800", "900"], display: "swap" });

/**
 * Mirrors the rendered outro (lib/studio/video-templates.ts, council version D,
 * approved 2026-10-10): the phone pill is the only filled orange, orange text on
 * the small label, white for place and price, dimmed cream for the rest.
 * Sizes are in container units so the preview matches the 1080x1920 frame.
 */
function OutroPreview({ outro }: { outro: OutroText }) {
  const dim = "rgba(244,232,215,0.72)";
  const photo = outro.backgroundUrl;
  return (
    <div className={`absolute inset-0 animate-[studio-fade_0.4s_ease-out] overflow-hidden bg-[linear-gradient(180deg,#cb7215,#a85c0e)] [container-type:inline-size] ${nunito.className}`}>
      {photo && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt="" className="absolute inset-0 size-full object-cover" />
          <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(43,36,29,.55)_0%,rgba(43,36,29,.78)_45%,rgba(43,36,29,.92)_100%)]" />
        </>
      )}
      <span className="absolute left-1/2 top-[15.6%] flex size-[16.7cqw] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png?v=2" alt="" className="size-[11.5cqw] object-contain" />
      </span>
      {outro.headline && (
        <p className="absolute inset-x-0 top-[29.2%] px-[5cqw] text-center text-[3.5cqw] font-extrabold uppercase tracking-[0.55cqw]" style={{ color: photo ? "#f5a36a" : "#fff" }}>
          {outro.headline}
        </p>
      )}
      {outro.location && (
        <p className="absolute inset-x-0 top-[32%] px-[5cqw] text-center text-[5.9cqw] font-black text-white">{outro.location}</p>
      )}
      {outro.price && (
        <p className="absolute inset-x-0 top-[39.6%] px-[3cqw] text-center text-white">
          <span
            className="block whitespace-nowrap font-black leading-none tabular-nums"
            style={{ fontSize: `${outro.price.length > 10 ? Math.max(8.9, 138.9 / outro.price.length) : 13.9}cqw` }}
          >
            {outro.price}
          </span>
          {outro.currency && (
            <span className="mt-[1.3cqw] block text-[4.4cqw] font-extrabold tracking-[0.55cqw]" style={{ color: dim }}>
              {outro.currency}
            </span>
          )}
        </p>
      )}
      <span className="absolute left-1/2 top-[52.1%] h-[0.4cqw] w-[12cqw] -translate-x-1/2 rounded-full bg-[rgba(244,232,215,0.35)]" />
      {outro.note && (
        <p className="absolute inset-x-0 top-[53.4%] px-[5cqw] text-center text-[3.3cqw] font-bold" style={{ color: dim }}>{outro.note}</p>
      )}
      {outro.phone && (
        <div className="absolute inset-x-0 top-[67.7%] px-[5cqw] text-center">
          {outro.contactLabel && <p className="text-[3.5cqw] font-extrabold" style={{ color: dim }}>{outro.contactLabel}</p>}
          <p
            className="mt-[2.4cqw] inline-block whitespace-nowrap rounded-full px-[5.5cqw] py-[2.4cqw] text-[7.4cqw] font-black leading-none tracking-[0.18cqw] text-white tabular-nums"
            style={{ background: photo ? "#cb7215" : "#2b241d" }}
          >
            {outro.phone}
          </p>
        </div>
      )}
      {outro.footer && (
        <p className="absolute inset-x-0 top-[91.7%] text-center text-[3.15cqw] font-extrabold" style={{ color: dim }}>{outro.footer}</p>
      )}
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
  voiceDelay,
  onMoveVoice,
  hasVoice,
  musicTitle,
  musicPoints,
  onOpenMusic,
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
  voiceDelay: number;
  onMoveVoice?: (delay: number) => void;
  hasVoice: boolean;
  musicTitle: string | null;
  musicPoints: { t: number; v: number }[];
  onOpenMusic: () => void;
  time: number;
  playing: boolean;
  onSeek: (time: number) => void;
  onToggle: () => void;
  onKey: (event: React.KeyboardEvent) => void;
}) {
  const laneRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  // Voice drag: remember where it started, in pixels and seconds, and the scale at that moment
  // (the video grows as the voice moves, so the scale must not shift mid-drag).
  const voiceDrag = useRef<{ x: number; delay: number; secondsPerPx: number } | null>(null);
  const [movingVoice, setMovingVoice] = useState(false);
  const step = total > 40 ? 10 : 5;
  const ticks = Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step);
  const pct = (value: number) => `${(value / total) * 100}%`;

  const fromPointer = (event: React.PointerEvent) => {
    const rect = laneRef.current?.getBoundingClientRect();
    if (!rect) return time;
    return Math.min(total, Math.max(0, ((event.clientX - rect.left) / rect.width) * total));
  };

  // Only the ruler and the playhead handle move the playhead (Salif, 2026-10-10):
  // the tracks below are for arranging, not scrubbing.
  const startScrub = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    dragging.current = true;
    onSeek(fromPointer(event));
    try {
      laneRef.current?.setPointerCapture(event.pointerId);
    } catch {
      // Capture is a nicety: moves over the lane still scrub.
    }
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
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-transform active:scale-[0.985]"
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
            ? "Cliquez sur la règle ou glissez la tête de lecture. Glissez la voix off pour la décaler."
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
          onPointerMove={(event) => dragging.current && onSeek(fromPointer(event))}
          onPointerUp={(event) => {
            if (!dragging.current) return;
            dragging.current = false;
            try {
              laneRef.current?.releasePointerCapture(event.pointerId);
            } catch {
              // Already released.
            }
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
          className="relative min-w-0 flex-1 touch-none select-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <div
            onPointerDown={startScrub}
            title="Cliquez ou glissez pour déplacer la tête de lecture"
            className="flex h-5 cursor-ew-resize items-end justify-between border-b border-neutral-200 pb-1 text-[10px] font-medium tabular-nums text-neutral-500"
          >
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
                role={onMoveVoice ? "slider" : undefined}
                tabIndex={onMoveVoice ? 0 : undefined}
                aria-label={onMoveVoice ? "Début de la voix off" : undefined}
                aria-valuemin={0}
                aria-valuemax={MAX_VOICE_DELAY}
                aria-valuenow={voiceDelay}
                aria-valuetext={`La voix commence à ${voiceDelay.toFixed(1).replace(".", ",")} s`}
                title={onMoveVoice ? "Glissez pour décaler la voix off" : undefined}
                onPointerDown={(event) => {
                  if (!onMoveVoice || event.button !== 0) return;
                  event.stopPropagation();
                  const rect = laneRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  voiceDrag.current = { x: event.clientX, delay: voiceDelay, secondsPerPx: total / rect.width };
                  setMovingVoice(true);
                  try {
                    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
                  } catch {
                    // Capture is a nicety: the drag still follows the pointer over the clip.
                  }
                }}
                onPointerMove={(event) => {
                  const drag = voiceDrag.current;
                  if (!drag || !onMoveVoice) return;
                  onMoveVoice(drag.delay + (event.clientX - drag.x) * drag.secondsPerPx);
                }}
                onPointerUp={(event) => {
                  if (!voiceDrag.current) return;
                  voiceDrag.current = null;
                  setMovingVoice(false);
                  try {
                    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
                  } catch {
                    // Already released.
                  }
                }}
                onKeyDown={(event) => {
                  if (!onMoveVoice) return;
                  const step = event.shiftKey ? 1 : 0.1;
                  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    event.preventDefault();
                    event.stopPropagation();
                    onMoveVoice(voiceDelay + (event.key === "ArrowRight" ? step : -step));
                  }
                }}
                className={cn(
                  "absolute inset-y-0 flex items-center gap-2 truncate rounded-md border px-2 text-[11px] font-bold outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-primary/40",
                  hasVoice ? "border-green-300 bg-green-100 text-neutral-900" : "border-dashed border-neutral-300 text-neutral-400",
                  onMoveVoice && (movingVoice ? "cursor-grabbing shadow-md ring-2 ring-green-400/60" : "cursor-grab hover:shadow-sm"),
                )}
                style={{ left: pct(voiceDelay), width: pct(voiceSeconds) }}
              >
                {onMoveVoice && <DotsSixVerticalIcon size={14} weight="bold" className="shrink-0 text-green-700/70" />}
                <span className="truncate">{hasVoice ? "Voix off" : "Voix à générer"}</span>
                {(movingVoice || voiceDelay !== VOICE_DELAY) && (
                  <span className="shrink-0 rounded bg-white/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-green-800">
                    début {voiceDelay.toFixed(1).replace(".", ",")} s
                  </span>
                )}
              </span>
            </div>
            <div className={cn("relative", TRACK)}>
              {musicTitle ? (
                <button
                  type="button"
                  onClick={onOpenMusic}
                  title="Changer la musique"
                  className="absolute inset-0 cursor-pointer overflow-hidden rounded-md border border-[rgba(91,58,122,0.25)] bg-[rgba(91,58,122,0.08)] text-left"
                >
                  {/* The music's level over the video: low under the voice, up when nobody speaks. */}
                  <svg aria-hidden viewBox="0 0 100 10" preserveAspectRatio="none" className="absolute inset-0 size-full">
                    <polygon
                      points={`0,10 ${musicPoints.map((p) => `${(p.t / total) * 100},${10 - (p.v / MUSIC_ALONE) * 8}`).join(" ")} 100,10`}
                      fill="rgba(91,58,122,0.22)"
                    />
                  </svg>
                  <span className="relative flex h-full items-center gap-1 px-2 text-[11px] font-bold text-[#5b3a7a]">
                    <MusicNotesIcon size={12} weight="bold" className="shrink-0" />
                    <span className="truncate">{musicTitle}</span>
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenMusic}
                  className="absolute inset-0 flex cursor-pointer items-center rounded-md border border-dashed border-neutral-300 px-2 text-[11px] font-semibold text-neutral-500 transition-colors hover:border-primary/50 hover:text-primary"
                >
                  <MusicNotesIcon size={12} weight="bold" className="mr-1 shrink-0" />
                  Ajouter une musique
                </button>
              )}
            </div>
          </div>

          <div aria-hidden className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-primary" style={{ left: pct(time) }}>
            <span
              onPointerDown={startScrub}
              title="Glissez la tête de lecture"
              className="pointer-events-auto absolute -top-1 left-1/2 size-4 -translate-x-1/2 rotate-45 cursor-ew-resize rounded-[3px] bg-primary shadow"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
