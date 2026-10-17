"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  CameraIcon,
  CheckCircleIcon,
  FilmStripIcon,
  FolderSimpleIcon,
  ImageIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { fieldMediaKind, formatBytes } from "@/lib/studio/field-media-rules";
import { UploadError, uploadFieldFile, type FieldMedia } from "./field-upload";

type QueueItem = {
  key: string;
  file: File;
  kind: "photo" | "video";
  sent: number;
  state: "waiting" | "sending" | "checking" | "failed";
  error: string | null;
  startedAt: number | null;
};

function clock(seconds: number | null) {
  if (seconds == null) return null;
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function remaining(item: QueueItem): string | null {
  if (item.state !== "sending" || !item.startedAt || item.sent <= 0) return null;
  const elapsed = (Date.now() - item.startedAt) / 1000;
  if (elapsed < 3) return null;
  const left = ((item.file.size - item.sent) / item.sent) * elapsed;
  if (!Number.isFinite(left)) return null;
  return left < 60 ? "moins d'une minute" : `environ ${Math.ceil(left / 60)} min`;
}

/**
 * "Médias du terrain" (2026-10-12): staff drop the visit's photos and videos;
 * each file goes straight to the shared Drive folder of the property
 * (Vente|Location / Quartier - Propriétaire) and is listed here for the
 * Studio's video templates. One file at a time, resumable.
 */
export function FieldMediaPanel({ propertyId, canWrite }: { propertyId: string; canWrite: boolean }) {
  const [media, setMedia] = useState<FieldMedia[]>([]);
  const [folderUrl, setFolderUrl] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const queueRef = useRef<QueueItem[]>([]);
  queueRef.current = queue;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/studio/media?propertyId=${encodeURIComponent(propertyId)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Erreur ${res.status}`);
      setMedia(body.media ?? []);
      setFolderUrl(body.folderUrl ?? null);
      setConfigured(body.driveConfigured !== false);
      setListError(null);
    } catch (error) {
      setListError(`Liste indisponible : ${error instanceof Error ? error.message : "erreur inconnue"}`);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    setLoading(true);
    setQueue([]);
    void load();
  }, [load]);

  const busy = queue.some((q) => q.state === "sending" || q.state === "checking" || q.state === "waiting");

  // Leaving the page stops the upload; warn first.
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  const patch = (key: string, change: Partial<QueueItem>) =>
    setQueue((items) => items.map((item) => (item.key === key ? { ...item, ...change } : item)));

  const pump = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      for (;;) {
        const next = queueRef.current.find((q) => q.state === "waiting");
        if (!next) break;
        const controller = new AbortController();
        abortRef.current = controller;
        patch(next.key, { state: "sending", error: null, startedAt: Date.now(), sent: 0 });
        queueRef.current = queueRef.current.map((q) => (q.key === next.key ? { ...q, state: "sending" } : q));
        try {
          const saved = await uploadFieldFile(
            next.file,
            propertyId,
            (sent) => patch(next.key, { sent, state: sent >= next.file.size ? "checking" : "sending" }),
            controller.signal,
          );
          setMedia((list) => [saved, ...list.filter((m) => m.id !== saved.id)]);
          setQueue((items) => items.filter((item) => item.key !== next.key));
          queueRef.current = queueRef.current.filter((item) => item.key !== next.key);
        } catch (error) {
          const aborted = error instanceof DOMException && error.name === "AbortError";
          const message = aborted
            ? "Envoi annulé."
            : error instanceof UploadError
              ? error.message
              : `Envoi impossible : ${error instanceof Error ? error.message : "erreur inconnue"}`;
          console.error("Studio: field upload failed", next.file.name, next.file.size, message);
          patch(next.key, { state: "failed", error: message });
          queueRef.current = queueRef.current.map((q) => (q.key === next.key ? { ...q, state: "failed" } : q));
        }
      }
    } finally {
      runningRef.current = false;
      abortRef.current = null;
      void load();
    }
  }, [load, propertyId]);

  function add(files: FileList | File[]) {
    const accepted: QueueItem[] = [];
    const refused: string[] = [];
    for (const file of Array.from(files)) {
      const kind = fieldMediaKind(file.type, file.name);
      if (!kind) {
        refused.push(file.name);
        continue;
      }
      accepted.push({
        key: `${file.name}:${file.size}:${file.lastModified}:${Math.random().toString(36).slice(2, 7)}`,
        file,
        kind,
        sent: 0,
        state: "waiting",
        error: null,
        startedAt: null,
      });
    }
    if (refused.length) setListError(`Ignorés (ni photo ni vidéo) : ${refused.join(", ")}`);
    if (!accepted.length) return;
    queueRef.current = [...queueRef.current, ...accepted];
    setQueue(queueRef.current);
    void pump();
  }

  function retry(key: string) {
    queueRef.current = queueRef.current.map((q) => (q.key === key ? { ...q, state: "waiting", error: null } : q));
    setQueue(queueRef.current);
    void pump();
  }

  function remove(key: string) {
    const item = queueRef.current.find((q) => q.key === key);
    if (item?.state === "sending" || item?.state === "checking") abortRef.current?.abort();
    queueRef.current = queueRef.current.filter((q) => q.key !== key);
    setQueue(queueRef.current);
  }

  const ready = media.filter((m) => m.status === "ready");
  const unfinished = media.filter((m) => m.status !== "ready" && !queue.some((q) => q.file.name === m.fileName && q.file.size === m.sizeBytes));
  const totalBytes = ready.reduce((sum, m) => sum + m.sizeBytes, 0);
  const folderPath = media.find((m) => m.folderPath)?.folderPath ?? null;

  return (
    <section className="grid min-w-0 gap-3 rounded-[22px] border border-[rgba(74,52,36,0.10)] bg-white/75 p-3.5" aria-label="Médias du terrain">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <CameraIcon size={16} weight="bold" className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-neutral-900">Médias du terrain</span>
          <span className="block truncate text-xs text-neutral-500">
            {ready.length
              ? `${ready.length} fichier${ready.length > 1 ? "s" : ""} · ${formatBytes(totalBytes)}`
              : "Photos et vidéos de la visite, rangées dans le Drive Roogo"}
          </span>
        </span>
        {folderUrl && (
          <a
            href={folderUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-neutral-100 px-3 text-xs font-semibold text-neutral-700 transition-colors hover:bg-primary/10 hover:text-primary"
          >
            <FolderSimpleIcon size={14} weight="bold" className="size-3.5" />
            Dossier Drive
          </a>
        )}
        {canWrite && configured && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-full bg-primary px-3 text-xs font-semibold text-white transition-transform active:scale-[0.985]"
          >
            <UploadSimpleIcon size={13} weight="bold" className="size-3.5" />
            Ajouter
          </button>
        )}
      </div>

      {folderPath && (
        <p className="truncate px-1 text-xs text-neutral-500">
          Drive Roogo <span className="text-neutral-300">›</span> {folderPath.split("/").join(" › ")}
        </p>
      )}

      {!configured && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          Google Drive n&apos;est pas encore branché au Studio. Les fichiers ne peuvent pas être envoyés pour le moment.
        </p>
      )}

      {canWrite && configured && (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,video/*,.heic,.heif,.mov"
            className="hidden"
            onChange={(event) => {
              if (event.target.files?.length) add(event.target.files);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (event.dataTransfer.files.length) add(event.dataTransfer.files);
            }}
            className={cn(
              "grid cursor-pointer place-items-center gap-1 rounded-[18px] border border-dashed px-4 py-5 text-center transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-[rgba(74,52,36,0.22)] bg-white/50 hover:border-primary/60",
            )}
          >
            <UploadSimpleIcon size={22} weight="bold" className="size-[22px] text-primary" />
            <span className="text-sm font-semibold text-neutral-800">Déposez les photos et vidéos de la visite</span>
            <span className="text-xs text-neutral-500">ou cliquez pour les choisir. Jusqu&apos;à 5 Go par fichier, envoyés directement dans le Drive.</span>
          </button>
        </>
      )}

      {queue.length > 0 && (
        <ul className="grid gap-2" aria-label="Envois en cours">
          {queue.map((item) => {
            const pct = item.file.size ? Math.min(100, Math.floor((item.sent / item.file.size) * 100)) : 0;
            const left = remaining(item);
            return (
              <li key={item.key} className="grid gap-1.5 rounded-xl border border-[rgba(74,52,36,0.08)] bg-white px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  {item.kind === "video" ? (
                    <FilmStripIcon size={16} weight="bold" className="size-4 shrink-0 text-neutral-500" />
                  ) : (
                    <ImageIcon size={16} weight="bold" className="size-4 shrink-0 text-neutral-500" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900">{item.file.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-neutral-500">{formatBytes(item.file.size)}</span>
                  {item.state === "failed" && (
                    <button
                      type="button"
                      onClick={() => retry(item.key)}
                      className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-full bg-primary/10 px-2.5 text-xs font-semibold text-primary"
                    >
                      <ArrowClockwiseIcon size={12} weight="bold" className="size-3" />
                      Réessayer
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(item.key)}
                    aria-label={item.state === "failed" ? "Retirer" : "Annuler l'envoi"}
                    className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                  >
                    <XIcon size={13} weight="bold" className="size-3.5" />
                  </button>
                </div>
                {item.state === "failed" ? (
                  <p className="flex items-start gap-1.5 text-xs font-medium text-red-600" role="alert">
                    <WarningCircleIcon size={14} weight="bold" className="mt-px size-3.5 shrink-0" />
                    {item.error}
                  </p>
                ) : (
                  <>
                    <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs tabular-nums text-neutral-500">
                      {item.state === "waiting"
                        ? "En attente"
                        : item.state === "checking"
                          ? "Vérification dans le Drive"
                          : `${pct} % · ${formatBytes(item.sent)} sur ${formatBytes(item.file.size)}${left ? ` · ${left}` : ""}`}
                    </p>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {listError && (
        <p className="text-xs font-semibold text-red-600" role="alert">
          {listError}
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-2 @xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="studio-skeleton aspect-[4/3] rounded-xl" />
          ))}
        </div>
      ) : ready.length ? (
        <ul className="grid grid-cols-2 gap-2 @xl:grid-cols-4 @4xl:grid-cols-6">
          {ready.map((m) => (
            <MediaCard key={m.id} media={m} />
          ))}
        </ul>
      ) : (
        !queue.length && <p className="px-1 text-xs text-neutral-500">Aucun fichier pour ce bien pour l&apos;instant.</p>
      )}

      {unfinished.length > 0 && (
        <ul className="grid gap-1 px-1">
          {unfinished.map((m) => (
            <li key={m.id} className="flex items-start gap-1.5 text-xs text-neutral-500">
              <WarningCircleIcon size={13} weight="bold" className="mt-px size-3.5 shrink-0 text-amber-600" />
              <span className="min-w-0">
                <span className="font-medium text-neutral-700">{m.fileName}</span>
                {m.status === "uploading"
                  ? " : envoi interrompu. Déposez le même fichier pour reprendre où il s'est arrêté."
                  : ` : ${m.error ?? "échec de l'envoi"}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MediaCard({ media }: { media: FieldMedia }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const duration = clock(media.durationSeconds);
  return (
    <li className="grid min-w-0 content-start gap-1.5 rounded-xl border border-[rgba(74,52,36,0.08)] bg-white p-1.5">
      <span className="relative aspect-[4/3] overflow-hidden rounded-lg bg-[linear-gradient(145deg,#efe4d8,#dcc8b5)]">
        {!thumbFailed && (
          // eslint-disable-next-line @next/next/no-img-element -- streamed from Drive through our API, not optimisable
          <img
            src={`/api/admin/studio/media/${media.id}/stream?thumb=1`}
            alt=""
            loading="lazy"
            onError={() => setThumbFailed(true)}
            className="absolute inset-0 size-full object-cover"
          />
        )}
        {thumbFailed && (
          <span className="absolute inset-0 grid place-items-center text-[#7d5c45]">
            {media.kind === "video" ? <FilmStripIcon size={26} weight="bold" /> : <ImageIcon size={26} weight="bold" />}
          </span>
        )}
        {media.kind === "video" && (
          <span className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            <FilmStripIcon size={11} weight="bold" />
            {duration ?? "Vidéo"}
          </span>
        )}
        <CheckCircleIcon size={16} weight="fill" className="absolute right-1 top-1 size-4 text-[#2f7d4f] drop-shadow" aria-label="Dans le Drive" />
      </span>
      <span className="min-w-0 px-0.5">
        <span className="block truncate text-xs font-semibold text-neutral-900" title={media.fileName}>
          {media.fileName}
        </span>
        <span className="block text-[11px] tabular-nums text-neutral-500">{formatBytes(media.sizeBytes)}</span>
      </span>
      {media.driveUrl && (
        <a
          href={media.driveUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg bg-neutral-100 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10"
        >
          <ArrowSquareOutIcon size={12} weight="bold" className="size-3" />
          Ouvrir dans le Drive
        </a>
      )}
    </li>
  );
}
