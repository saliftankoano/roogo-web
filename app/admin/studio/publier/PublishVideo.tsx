"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowSquareOutIcon,
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  CloudArrowUpIcon,
  FilmSlateIcon,
  InfoIcon,
  SparkleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { TimeSelect24h } from "@/components/ui/TimeSelect24h";
import { notifyApprovalsChanged } from "@/components/admin/useStudioApprovals";
import type { TikTokPublishInfo } from "@/lib/social/tiktok-publish";
import { NETWORK_LABELS, slotLabel, type Network } from "@/lib/studio/publishing";
import {
  DESTINATION_FORMATS,
  DESTINATION_LABELS,
  NO_FACTS,
  checkFinalVideo,
  defaultTicks,
  durationLabel,
  finalizeNetworkCopy,
  uploaderStatus,
  type CopyDraft,
  type CopyFacts,
  type Destination,
  type DestinationOption,
} from "@/lib/studio/publish-everywhere";
import { formatBytes } from "@/lib/studio/field-media-rules";
import { StudioHeader } from "../StudioHeader";
import { readVideoShape, uploadResumableToDrive, UploadError } from "../field-upload";
import { DestinationIcon } from "../calendrier/NetworkIcons";
import { readError, type FinalVideo, type Post } from "../calendrier/calendar-types";
import { ApprovalPreview } from "../publishing/ApprovalPreview";
import { TikTokNote } from "../publishing/TikTokChoice";
import { Toast, type ToastMessage } from "../publishing/Toast";
import { CopyTabs } from "./CopyTabs";
import { PropertyLink, type LinkedProperty } from "./PropertyLink";

type Item = { video: FinalVideo; post: Post | null };

type PageData = {
  me: { id: string; role: "staff" | "founder" };
  destinations: DestinationOption[];
  tiktok: TikTokPublishInfo | null;
  driveConfigured: boolean;
  slots: string[];
  items: Item[];
};

type Upload =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "refused"; message: string }
  | { state: "uploading"; sent: number; total: number }
  | { state: "ready"; video: FinalVideo }
  | { state: "failed"; message: string };

type Copy = { base: CopyDraft; versions: Partial<Record<Destination, CopyDraft>>; model: string | null };

const EMPTY: CopyDraft = { text: "", hashtags: [] };

function todayPlus(days: number) {
  const d = new Date(Date.now() + days * 86400_000);
  return d.toISOString().slice(0, 10);
}

/**
 * Studio › Publier (PRD 2 and 3, approved 2026-10-23): one finished vertical
 * video, sent once to Drive « Vidéos finales », texts per network, then
 * « Envoyer à Salif ». Below: « Mes vidéos » with each network's result and
 * « Réessayer » per network. The founder opens a video from his Accueil task
 * (?publication=<id>) and validates it in the same preview as the calendar.
 */
export function PublishVideo() {
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<PageData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  // Composer
  const [file, setFile] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [upload, setUpload] = useState<Upload>({ state: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [property, setProperty] = useState<LinkedProperty | null>(null);
  const [facts, setFacts] = useState<CopyFacts>(NO_FACTS);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [ticks, setTicks] = useState<Destination[] | null>(null);
  const [copy, setCopy] = useState<Copy | null>(null);
  const [sameText, setSameText] = useState(false);
  const [tab, setTab] = useState<Destination>("facebook");
  const [when, setWhen] = useState<"approval" | "date">("approval");
  const [date, setDate] = useState(todayPlus(1));
  const [time, setTime] = useState("19:00");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /** A video Salif sent back, loaded to be corrected and sent again. */
  const [fixing, setFixing] = useState<Item | null>(null);
  const [preview, setPreview] = useState<Post | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/studio/final-videos");
      if (!res.ok) throw new Error(await readError(res));
      const next = (await res.json()) as PageData;
      setData(next);
      setLoadError(null);
      setTicks((cur) => cur ?? defaultTicks(next.destinations));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Page indisponible");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The founder's task links here with ?publication=<id>.
  const wanted = params?.get("publication") ?? null;
  const handledLink = useRef<string | null>(null);
  useEffect(() => {
    if (!wanted || !data || handledLink.current === wanted) return;
    const item = data.items.find((i) => i.post?.id === wanted);
    if (!item?.post) return;
    handledLink.current = wanted;
    if (data.me.role === "founder" && item.post.status === "a_valider") setPreview(item.post);
    else if (item.post.status === "a_faire" && item.post.returnedAt) startFix(item);
    // Opens once per link; startFix only sets state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, data]);

  // Facts of the linked listing, for the live checks.
  useEffect(() => {
    let alive = true;
    const id = property?.id ?? fixing?.post?.propertyId ?? null;
    if (!id) {
      setFacts(NO_FACTS);
      return;
    }
    void (async () => {
      try {
        const res = await fetch(`/api/admin/studio/final-videos/facts/copy?propertyId=${encodeURIComponent(id)}`);
        if (!res.ok) return;
        const body = (await res.json()) as { facts: CopyFacts };
        if (alive) setFacts(body.facts);
      } catch {
        // Checks then run without the listing; the server checks again.
      }
    })();
    return () => {
      alive = false;
    };
  }, [property?.id, fixing?.post?.propertyId]);

  useEffect(() => () => {
    if (localUrl) URL.revokeObjectURL(localUrl);
  }, [localUrl]);

  const destinations = useMemo(() => data?.destinations ?? [], [data]);
  const chosen = useMemo(() => (ticks ?? []).filter((t) => destinations.some((d) => d.id === t && d.available)), [ticks, destinations]);
  const video = fixing?.video ?? (upload.state === "ready" ? upload.video : null);

  function resetComposer() {
    abortRef.current?.abort();
    setFile(null);
    if (localUrl) URL.revokeObjectURL(localUrl);
    setLocalUrl(null);
    setUpload({ state: "idle" });
    setProperty(null);
    setTitle("");
    setNote("");
    setCopy(null);
    setSameText(false);
    setWhen("approval");
    setFixing(null);
    setMessage(null);
    if (data) setTicks(defaultTicks(data.destinations));
    if (inputRef.current) inputRef.current.value = "";
  }

  async function pick(next: File | null) {
    if (!next) return;
    resetComposer();
    setFile(next);
    setUpload({ state: "checking" });
    const shape = await readVideoShape(next);
    const check = checkFinalVideo({ fileName: next.name, mimeType: next.type, sizeBytes: next.size, ...shape });
    if (!check.ok) {
      setUpload({ state: "refused", message: check.message });
      return;
    }
    setLocalUrl(URL.createObjectURL(next));
    await send(next, shape);
  }

  async function send(f: File, shape: { durationSeconds: number | null; width: number | null; height: number | null }) {
    const controller = new AbortController();
    abortRef.current = controller;
    setUpload({ state: "uploading", sent: 0, total: f.size });
    try {
      const done = await uploadResumableToDrive<FinalVideo>(
        "/api/admin/studio/final-videos",
        f,
        { fileName: f.name, mimeType: f.type, sizeBytes: f.size, ...shape, title: title || undefined, propertyId: property?.id ?? null },
        (sent) => setUpload({ state: "uploading", sent, total: f.size }),
        controller.signal,
      );
      if (done.status !== "ready") throw new UploadError(done.error ?? "Le Drive n'a pas confirmé la vidéo.");
      setUpload({ state: "ready", video: done });
      setTitle((t) => t || done.title);
      void load();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setUpload({ state: "failed", message: e instanceof Error ? e.message : "Envoi échoué" });
    }
  }

  function startFix(item: Item) {
    if (!item.post) {
      // A video already in the Drive but never sent (page closed after the upload): continue it.
      if (item.video.status !== "ready") return;
      resetComposer();
      setFixing(item);
      setTitle(item.video.title);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const p = item.post;
    setFixing(item);
    setFile(null);
    setUpload({ state: "idle" });
    setTitle(p.title);
    setNote(p.notes ?? "");
    setTicks(p.networks);
    setSameText(Boolean(p.sameText));
    setCopy({ base: { text: p.caption, hashtags: p.hashtags }, versions: { ...(p.networkCopy ?? {}) }, model: p.captionModel });
    setWhen(p.publishOnApproval ? "approval" : "date");
    setProperty(p.propertyId && p.property ? { id: p.propertyId, title: p.property.title, place: p.property.place, price: "", reference: null } : null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function generate(only?: Destination) {
    if (!video) return;
    setBusy(only ? `regen-${only}` : "generate");
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/studio/final-videos/${video.id}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          networks: chosen,
          only: only ?? null,
          propertyId: property?.id ?? null,
          title,
          note,
          existingBase: copy?.base.text ?? null,
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const out = (await res.json()) as {
        base: { text: string; hashtags: string[] } | null;
        versions: Partial<Record<Destination, { text: string; hashtags: string[] }>>;
        model: string;
        facts: CopyFacts;
      };
      setFacts(out.facts);
      setCopy((cur) => ({
        base: out.base ? { text: out.base.text, hashtags: out.base.hashtags } : cur?.base ?? EMPTY,
        versions: { ...(cur?.versions ?? {}), ...Object.fromEntries(Object.entries(out.versions).map(([k, v]) => [k, { text: v!.text, hashtags: v!.hashtags }])) },
        model: out.model,
      }));
      if (!only) setTab(chosen[0] ?? "facebook");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "La génération a échoué.");
    } finally {
      setBusy(null);
    }
  }

  function writeMyself() {
    const start: CopyDraft = { text: title ? `${title}.` : "", hashtags: ["#Roogo"] };
    setCopy({ base: start, versions: Object.fromEntries(chosen.map((n) => [n, { ...start }])), model: null });
    setTab(chosen[0] ?? "facebook");
  }

  const blocking = useMemo(() => {
    if (!copy) return [] as string[];
    const out: string[] = [];
    for (const n of chosen) {
      const draft = sameText ? copy.base : copy.versions[n] ?? copy.base;
      const final = finalizeNetworkCopy(sameText ? "base" : n, draft, facts);
      for (const c of final.checks) if (c.level === "error") out.push(`${NETWORK_LABELS[n as Network] ?? n} : ${c.message}`);
    }
    return out;
  }, [copy, chosen, sameText, facts]);

  const scheduledIso = when === "date" ? new Date(`${date}T${time}:00.000Z`).toISOString() : null;
  const canSend = Boolean(video && copy && chosen.length && copy.base.text.trim() && !blocking.length && busy === null && (when === "approval" || (scheduledIso && new Date(scheduledIso).getTime() > Date.now())));

  async function sendToSalif() {
    if (!video || !copy) return;
    setBusy("send");
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/studio/final-videos/${video.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          propertyId: property?.id ?? null,
          networks: chosen,
          base: copy.base,
          networkCopy: copy.versions,
          sameText,
          when: when === "approval" ? "approval" : scheduledIso,
          note,
          model: copy.model,
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      notifyApprovalsChanged();
      setToast({ id: Date.now(), text: "Envoyée à Salif. Il la voit dans ses tâches sur Accueil." });
      resetComposer();
      if (wanted) router.replace("/admin/studio/publier");
      void load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Envoi impossible");
    } finally {
      setBusy(null);
    }
  }

  async function retry(post: Post, network: Network) {
    setBusy(`retry-${post.id}-${network}`);
    try {
      const res = await fetch(`/api/admin/studio/publications/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry", network }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setToast({ id: Date.now(), text: `${NETWORK_LABELS[network]} : nouvel essai lancé.` });
      void load();
    } catch (e) {
      setToast({ id: Date.now(), text: e instanceof Error ? e.message : "Nouvel essai impossible", tone: "warn" });
    } finally {
      setBusy(null);
    }
  }

  const label = "text-[11px] font-bold uppercase tracking-[0.08em] text-[#A8521D]";
  const step = "grid gap-2.5 border-t border-[rgba(74,52,36,0.10)] pt-4";

  const dropZone = (
    <div className="grid gap-2">
      <input
        ref={inputRef}
        id="final-video-input"
        type="file"
        accept="video/mp4,video/quicktime,.mp4,.mov"
        className="sr-only"
        onChange={(e) => void pick(e.target.files?.[0] ?? null)}
      />
      {video || localUrl ? (
        <div className="relative mx-auto aspect-[9/16] w-full max-w-[170px] overflow-hidden rounded-[22px] bg-[#1F1A16] md:max-w-[300px]">
          <video src={localUrl ?? video?.streamUrl ?? undefined} controls playsInline preload="metadata" className="size-full object-cover" aria-label="Aperçu de la vidéo" />
        </div>
      ) : (
        <label
          htmlFor="final-video-input"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void pick(e.dataTransfer.files?.[0] ?? null);
          }}
          className="mx-auto grid aspect-[9/16] w-full max-w-[170px] cursor-pointer place-items-center rounded-[22px] border-2 border-dashed border-[rgba(74,52,36,0.25)] bg-white px-4 text-center hover:border-[#C96A2E] md:max-w-[300px]"
        >
          <span className="grid justify-items-center gap-2">
            <CloudArrowUpIcon size={34} weight="duotone" className="text-[#C96A2E]" />
            <span className="text-[15px] font-bold text-[#1F1A16]">Choisir la vidéo</span>
            <span className="text-[12px] leading-snug text-neutral-600">Verticale 9:16, 3 minutes et 500 Mo au plus, MP4 ou MOV</span>
          </span>
        </label>
      )}
      <UploadState upload={upload} file={file} video={video} onRetry={() => file && void pick(file)} onOther={() => inputRef.current?.click()} />
    </div>
  );

  return (
    <div className="relative left-1/2 w-[calc(100vw-1rem)] max-w-[1840px] -translate-x-1/2 md:w-[calc(100vw-3rem)]">
      <StudioHeader className="mx-1" />
      <div className="mx-auto mt-4 grid max-w-[1120px] gap-6 px-1 pb-24 md:mt-6">
        <div>
          <h2 className="text-[22px] font-extrabold tracking-[-0.01em] text-[#1F1A16] md:text-[26px]">{fixing?.post ? "Corriger la vidéo" : "Publier une vidéo"}</h2>
          <p className="mt-1 text-[14px] text-neutral-600">Une vidéo verticale, tous les réseaux, après l&apos;accord de Salif.</p>
        </div>

        {loadError && (
          <p role="alert" className="flex items-start gap-2 text-sm font-semibold text-red-700">
            <WarningCircleIcon size={18} weight="bold" className="shrink-0" />
            {loadError}
          </p>
        )}
        {data && !data.driveConfigured && (
          <p className="flex items-start gap-2 text-sm text-[#6E4300]">
            <InfoIcon size={18} weight="bold" className="shrink-0" />
            Google Drive n&apos;est pas encore branché au Studio : l&apos;envoi est impossible pour le moment.
          </p>
        )}

        {fixing?.post?.reviewComment && (
          <div className="grid gap-1 border-l-2 border-[#C96A2E] pl-3">
            <span className={label}>Salif demande</span>
            <p className="text-[15px] text-[#1F1A16]">{fixing.post.reviewComment}</p>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-[300px_minmax(0,1fr)] md:gap-10">
          <div className="md:sticky md:top-24 md:self-start">{fixing ? <FixVideo video={fixing.video} /> : dropZone}</div>

          <div className={cn("grid content-start gap-4", !video && "opacity-60")} aria-disabled={!video}>
            <section className="grid gap-2.5">
              <span className={label}>Titre et bien</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex. Villa Balkuy"
                aria-label="Titre de la vidéo"
                maxLength={120}
                className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-3.5 text-[15px] text-[#1F1A16] outline-none focus:border-[#C96A2E]"
              />
              <PropertyLink
                value={property}
                disabled={busy !== null}
                onChange={(p) => {
                  setProperty(p);
                  if (p && !title) setTitle(p.title.replace(/ à (vendre|louer),? /i, " "));
                }}
              />
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Ce que montre la vidéo, en une phrase (facultatif)"
                aria-label="Ce que montre la vidéo"
                className="w-full rounded-2xl border border-neutral-200 bg-white px-3.5 py-2.5 text-[15px] text-[#1F1A16] outline-none focus:border-[#C96A2E]"
              />
            </section>

            <section className={step}>
              <span className={label}>Réseaux</span>
              <div role="group" aria-label="Réseaux" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {destinations.map((d) => {
                  const on = chosen.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      aria-pressed={d.available ? on : undefined}
                      aria-disabled={!d.available}
                      aria-label={d.label}
                      title={d.reason ?? undefined}
                      onClick={() => d.available && setTicks((cur) => (on ? (cur ?? []).filter((x) => x !== d.id) : [...(cur ?? []), d.id]))}
                      className={cn(
                        "flex min-h-14 min-w-0 items-center gap-2 rounded-2xl px-3 py-2 text-left",
                        !d.available
                          ? "cursor-not-allowed border border-dashed border-[rgba(74,52,36,0.2)] text-neutral-400"
                          : on
                            ? "bg-white text-[#1F1A16] ring-2 ring-[#C96A2E]"
                            : "bg-white/60 text-neutral-500 ring-1 ring-[rgba(74,52,36,0.12)]",
                      )}
                    >
                      <DestinationIcon destination={d.id} size={20} className={cn(!d.available && "opacity-50 grayscale")} />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-bold leading-tight">{DESTINATION_LABELS[d.id]}</span>
                        <span className="block truncate text-[11px] leading-tight">
                          {d.available ? DESTINATION_FORMATS[d.id] : d.id === "youtube" ? "(à connecter)" : "Pas disponible"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {destinations
                .filter((d) => !d.available && d.id !== "youtube")
                .map((d) => (
                  <p key={d.id} className="text-[12px] text-neutral-500">
                    {d.label} : {d.reason}
                  </p>
                ))}
              {chosen.includes("tiktok") && <TikTokNote info={data?.tiktok} />}
            </section>

            <section className={step}>
              <span className={label}>Textes</span>
              {!copy ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void generate()}
                    disabled={!video || !chosen.length || busy !== null}
                    className="inline-flex h-12 items-center gap-2 rounded-full bg-[#1F1A16] px-5 text-[15px] font-bold text-white disabled:opacity-50"
                  >
                    <SparkleIcon size={16} weight="fill" />
                    {busy === "generate" ? "Préparation…" : "Préparer les textes"}
                  </button>
                  <button
                    type="button"
                    onClick={writeMyself}
                    disabled={!video || !chosen.length || busy !== null}
                    className="h-12 rounded-full px-4 text-[14px] font-bold text-[#1F1A16] ring-1 ring-[rgba(74,52,36,0.18)] disabled:opacity-50"
                  >
                    Écrire moi-même
                  </button>
                </div>
              ) : (
                <CopyTabs
                  networks={chosen}
                  facts={facts}
                  base={copy.base}
                  versions={copy.versions}
                  sameText={sameText}
                  tab={tab}
                  busy={busy}
                  onTab={setTab}
                  onBase={(d) => setCopy((c) => (c ? { ...c, base: d } : c))}
                  onVersion={(n, d) => setCopy((c) => (c ? { ...c, versions: { ...c.versions, [n]: d } } : c))}
                  onSameText={(on) => {
                    setSameText(on);
                    // Switching on: the base becomes the text everywhere; switching off keeps each version.
                    if (on) setCopy((c) => (c && !c.base.text.trim() ? { ...c, base: c.versions[tab] ?? c.base } : c));
                  }}
                  onRegenerate={(n) => void generate(n)}
                />
              )}
            </section>

            <section className={step}>
              <span className={label}>Quand publier</span>
              <div role="radiogroup" aria-label="Quand publier" className="grid gap-2 sm:grid-cols-2">
                {(["approval", "date"] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    role="radio"
                    aria-checked={when === w}
                    onClick={() => setWhen(w)}
                    className={cn(
                      "min-h-12 rounded-2xl px-3.5 py-2 text-left text-[14px] font-bold",
                      when === w ? "bg-white text-[#1F1A16] ring-2 ring-[#C96A2E]" : "bg-white/60 text-neutral-600 ring-1 ring-[rgba(74,52,36,0.12)]",
                    )}
                  >
                    {w === "approval" ? "Dès que Salif valide" : "À une date et une heure"}
                  </button>
                ))}
              </div>
              {when === "date" && (
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <input type="date" aria-label="Date" value={date} min={todayPlus(0)} onChange={(e) => setDate(e.target.value)} className="h-11 min-w-0 rounded-xl border border-neutral-200 bg-white px-3 text-[15px] outline-none focus:border-[#C96A2E]" />
                  <TimeSelect24h value={time} onChange={setTime} label="Heure de Ouagadougou" fromHour={6} toHour={22} />
                  <p className="col-span-2 text-[12px] text-neutral-500">Heure de Ouagadougou. Si Salif valide après, la vidéo part tout de suite.</p>
                </div>
              )}
            </section>

            <div className="grid gap-2 border-t border-[rgba(74,52,36,0.10)] pt-4">
              {blocking.slice(0, 3).map((b) => (
                <p key={b} className="text-[13px] font-semibold text-[#8E2A1E]">
                  {b}
                </p>
              ))}
              {message && (
                <p role="alert" className="text-sm font-semibold text-red-700">
                  {message}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {fixing && (
                  <button type="button" onClick={resetComposer} className="h-12 rounded-full px-5 text-[15px] font-bold text-[#1F1A16] ring-1 ring-[rgba(74,52,36,0.18)]">
                    Annuler
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void sendToSalif()}
                  disabled={!canSend}
                  className="h-12 min-w-0 flex-1 rounded-full bg-[#C96A2E] px-6 text-[15px] font-bold text-white hover:bg-[#B85E26] disabled:opacity-50 sm:flex-none"
                >
                  {busy === "send" ? "Envoi…" : fixing?.post ? "Renvoyer à Salif" : "Envoyer à Salif"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <MyVideos data={data} busy={busy} onRetry={retry} onFix={startFix} onPreview={setPreview} onReload={() => void load()} />
      </div>

      {preview && data && (
        <ApprovalPreview
          queue={[preview]}
          daySlots={data.slots}
          tiktok={data.tiktok}
          onClose={() => {
            setPreview(null);
            if (wanted) router.replace("/admin/studio/publier");
          }}
          onChanged={() => void load()}
        />
      )}
      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}

function UploadState({ upload, file, video, onRetry, onOther }: { upload: Upload; file: File | null; video: FinalVideo | null; onRetry: () => void; onOther: () => void }) {
  if (upload.state === "idle" && !video) return null;
  if (upload.state === "checking") return <p className="text-center text-[13px] text-neutral-600">Vérification du format…</p>;
  if (upload.state === "refused" || upload.state === "failed") {
    return (
      <div className="grid justify-items-center gap-2 text-center">
        <p role="alert" className="text-[14px] font-semibold text-[#8E2A1E]">
          {upload.message}
        </p>
        <div className="flex gap-2">
          {upload.state === "failed" && file && (
            <button type="button" onClick={onRetry} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-[#1F1A16] px-4 text-[14px] font-bold text-white">
              <ArrowsClockwiseIcon size={14} weight="bold" />
              Reprendre l&apos;envoi
            </button>
          )}
          <button type="button" onClick={onOther} className="h-11 rounded-full px-4 text-[14px] font-bold text-[#1F1A16] ring-1 ring-[rgba(74,52,36,0.18)]">
            Choisir une autre vidéo
          </button>
        </div>
      </div>
    );
  }
  if (upload.state === "uploading") {
    const pct = upload.total ? Math.min(100, Math.round((upload.sent / upload.total) * 100)) : 0;
    return (
      <div className="grid gap-1.5" aria-live="polite">
        <div className="h-2 overflow-hidden rounded-full bg-[#EFE7DD]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Envoi de la vidéo">
          <div className="h-full rounded-full bg-[#C96A2E] transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <p className="flex justify-between text-[12px] tabular-nums text-neutral-600">
          <span>Envoi vers le Drive… {pct} %</span>
          <span>
            {formatBytes(upload.sent)} / {formatBytes(upload.total)}
          </span>
        </p>
        <p className="text-[12px] text-neutral-500">Si la connexion coupe, l&apos;envoi reprend là où il s&apos;est arrêté.</p>
      </div>
    );
  }
  if (video) {
    return (
      <p className="flex items-start justify-center gap-1.5 text-center text-[13px] text-[#245C33]">
        <CheckCircleIcon size={16} weight="fill" className="mt-px shrink-0" />
        <span>
          Dans le Drive « Vidéos finales » : {video.driveName}
          {video.durationSeconds ? ` · ${durationLabel(video.durationSeconds)}` : ""}
        </span>
      </p>
    );
  }
  return null;
}

function FixVideo({ video }: { video: FinalVideo }) {
  return (
    <div className="grid gap-2">
      <div className="relative mx-auto aspect-[9/16] w-full max-w-[170px] overflow-hidden rounded-[22px] bg-[#1F1A16] md:max-w-[300px]">
        {video.streamUrl ? <video src={video.streamUrl} controls playsInline preload="metadata" className="size-full object-cover" aria-label="Vidéo" /> : null}
      </div>
      <p className="text-center text-[12px] text-neutral-600">{video.driveName}</p>
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  "À valider par Salif": "bg-[#FCEFD4] text-[#6E4300]",
  "À corriger": "bg-[#FBE3DF] text-[#8E2A1E]",
  "Échec sur un réseau": "bg-[#FBE3DF] text-[#8E2A1E]",
  "Publiée partout": "bg-[#E3F1E6] text-[#245C33]",
  "Validée, publication en attente": "bg-[#E1EFF8] text-[#1F5F80]",
  "Publication en cours": "bg-[#E1EFF8] text-[#1F5F80]",
};

function MyVideos({
  data,
  busy,
  onRetry,
  onFix,
  onPreview,
  onReload,
}: {
  data: PageData | null;
  busy: string | null;
  onRetry: (post: Post, n: Network) => void;
  onFix: (item: Item) => void;
  onPreview: (post: Post) => void;
  onReload: () => void;
}) {
  if (!data) return null;
  const founder = data.me.role === "founder";
  return (
    <section aria-labelledby="my-videos" className="grid gap-3 border-t border-[rgba(74,52,36,0.12)] pt-5">
      <div className="flex items-center justify-between gap-2">
        <h3 id="my-videos" className="text-[17px] font-extrabold text-[#1F1A16]">
          {founder ? "Vidéos de l'équipe" : "Mes vidéos"}
        </h3>
        <button type="button" onClick={onReload} className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold text-neutral-600 hover:bg-[#F6F1EA] md:h-9">
          <ArrowsClockwiseIcon size={14} weight="bold" />
          Actualiser
        </button>
      </div>
      {!data.items.length && <p className="text-[14px] text-neutral-500">Aucune vidéo envoyée pour le moment.</p>}
      <ul className="grid gap-0">
        {data.items.map((item) => {
          const { video, post } = item;
          const status = uploaderStatus(post ? { status: post.status, returned_at: post.returnedAt, publishing: post.publishing } : null, video.status);
          return (
            <li key={video.id} className="grid gap-2 border-b border-[rgba(74,52,36,0.08)] py-3.5 last:border-b-0">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-16 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1F1A16] text-white/80">
                  <FilmSlateIcon size={16} weight="bold" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold text-[#1F1A16]">{post?.title || video.title}</p>
                  <p className="truncate text-[12px] text-neutral-500">
                    {[post ? (post.publishOnApproval && (post.status === "a_faire" || post.status === "a_valider") ? "Dès validation" : slotLabel(post.scheduledAt)) : null, video.durationSeconds ? durationLabel(video.durationSeconds) : null, formatBytes(video.sizeBytes)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <span className={cn("mt-1 inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-bold", STATUS_TONE[status] ?? "bg-[#EEEBE7] text-[#4A4540]")}>{status}</span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {founder && post?.status === "a_valider" && (
                    <button type="button" onClick={() => onPreview(post)} className="h-11 rounded-full bg-[#C96A2E] px-4 text-[13px] font-bold text-white md:h-9">
                      Voir et valider
                    </button>
                  )}
                  {post?.status === "a_faire" && post.returnedAt && (
                    <button type="button" onClick={() => onFix(item)} className="h-11 rounded-full bg-[#1F1A16] px-4 text-[13px] font-bold text-white md:h-9">
                      Corriger
                    </button>
                  )}
                  {!post && video.status === "ready" && (
                    <button type="button" onClick={() => onFix(item)} className="h-11 rounded-full bg-[#1F1A16] px-4 text-[13px] font-bold text-white md:h-9">
                      Continuer
                    </button>
                  )}
                  {video.driveUrl && (
                    <a href={video.driveUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1 text-[12px] font-semibold text-neutral-600 underline underline-offset-2">
                      Drive
                      <ArrowSquareOutIcon size={12} weight="bold" />
                    </a>
                  )}
                </div>
              </div>
              {post?.status === "a_faire" && post.returnedAt && post.reviewComment && <p className="pl-12 text-[13px] text-[#8E2A1E]">Salif : {post.reviewComment}</p>}
              {post && (post.status === "publie" || post.status === "echec" || post.status === "valide") && (
                <ul className="grid gap-1.5 pl-12">
                  {post.networks.map((n) => {
                    const r = post.results[n];
                    return (
                      <li key={n} className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                        <DestinationIcon destination={n} size={16} />
                        <span className="font-semibold text-[#1F1A16]">{NETWORK_LABELS[n]}</span>
                        {r?.status === "published" ? (
                          <>
                            <span className="text-[#245C33]">{r.note ?? "Publiée"}</span>
                            {r.permalink && (
                              <a href={r.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#A8521D] underline underline-offset-2">
                                Voir
                                <ArrowSquareOutIcon size={12} weight="bold" />
                              </a>
                            )}
                          </>
                        ) : r?.status === "failed" ? (
                          <>
                            <span className="min-w-0 text-[#8E2A1E]">{r.error ?? "Échec"}</span>
                            {post.status === "echec" && (
                              <button
                                type="button"
                                onClick={() => onRetry(post, n)}
                                disabled={busy !== null}
                                className="h-9 rounded-full px-3 text-[12px] font-bold text-[#1F1A16] ring-1 ring-[rgba(74,52,36,0.18)] disabled:opacity-50"
                              >
                                {busy === `retry-${post.id}-${n}` ? "Relance…" : "Réessayer"}
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="text-neutral-500">{post.publishing ? "En cours…" : "En attente"}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
