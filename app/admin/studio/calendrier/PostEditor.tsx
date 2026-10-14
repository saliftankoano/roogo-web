"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  CheckCircleIcon,
  FilmSlateIcon,
  HouseLineIcon,
  ImagesIcon,
  PaperPlaneTiltIcon,
  SparkleIcon,
  TextAaIcon,
  TrashIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  NETWORK_LABELS,
  TIKTOK_PENDING_TOOLTIP,
  canChangeStatus,
  canRetry,
  captionProblems,
  finalizeCaption,
  isJpegUrl,
  postText,
  isoToDateAndSlot,
  mediaProblems,
  slotToIso,
  type MediaType,
  type Network,
  type Role,
} from "@/lib/studio/publishing";
import { PropertyPicker } from "../PropertyPicker";
import { primaryGradient } from "../studio-ui";
import type { PropertySummary } from "../studio-types";
import { NetworkIcon } from "./NetworkIcons";
import { StatusChip } from "./StatusChip";
import { readError, type MediaOptions, type Post, type TeamMember } from "./calendar-types";

export type EditorTarget = { kind: "new"; date: string; slot: string } | { kind: "edit"; post: Post };

const MEDIA_CHOICES: Array<{ key: MediaType; label: string; Icon: typeof FilmSlateIcon }> = [
  { key: "video", label: "Vidéo", Icon: FilmSlateIcon },
  { key: "image", label: "Image", Icon: ImagesIcon },
  { key: "carousel", label: "Carrousel", Icon: ImagesIcon },
  { key: "text", label: "Texte", Icon: TextAaIcon },
];

const ease = [0.22, 1, 0.36, 1] as const;
const field = "w-full rounded-2xl border border-neutral-200 bg-white px-3.5 py-2.5 text-[15px] text-neutral-900 outline-none focus:border-primary";
const label = "text-xs font-semibold text-neutral-600";

/**
 * Create or edit one post, as a side sheet over the calendar. Saving never
 * publishes: a post goes out only once a founder pressed "Valider" and its
 * time has come.
 */
export function PostEditor({
  target,
  slots,
  team,
  me,
  onClose,
  onSaved,
}: {
  target: EditorTarget;
  slots: string[];
  team: TeamMember[];
  me: { id: string; role: Role };
  onClose: () => void;
  onSaved: (post: Post | null, removedId?: string) => void;
}) {
  const post = target.kind === "edit" ? target.post : null;
  const start = post ? isoToDateAndSlot(post.scheduledAt) : { date: target.kind === "new" ? target.date : "", slot: target.kind === "new" ? target.slot : slots[0] };

  const [title, setTitle] = useState(post?.title ?? "");
  const [property, setProperty] = useState<{ id: string; title: string; image: string | null } | null>(
    post?.propertyId && post.property ? { id: post.propertyId, title: post.property.title, image: post.property.image } : null,
  );
  const [picking, setPicking] = useState(false);
  const [mediaType, setMediaType] = useState<MediaType>(post?.mediaType ?? "video");
  const [artifactId, setArtifactId] = useState<string | null>(post?.artifactId ?? null);
  const [photoUrls, setPhotoUrls] = useState<string[]>(post?.photoUrls ?? []);
  const [caption, setCaption] = useState(post?.caption ?? "");
  const [hashtags, setHashtags] = useState<string[]>(post?.hashtags ?? []);
  const [notes, setNotes] = useState(post?.notes ?? "");
  const [networks, setNetworks] = useState<Network[]>(post?.networks ?? ["facebook", "instagram"]);
  const [date, setDate] = useState(start.date);
  const [slot, setSlot] = useState(start.slot);
  const [assigneeId, setAssigneeId] = useState<string>(post?.assigneeId ?? me.id);
  const [media, setMedia] = useState<MediaOptions | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const locked = post?.status === "publie" || post?.publishing === true;

  useEffect(() => {
    if (!property) {
      setMedia(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/admin/studio/publications/media?propertyId=${property.id}`);
      if (!res.ok || cancelled) return;
      setMedia((await res.json()) as MediaOptions);
    })();
    return () => {
      cancelled = true;
    };
  }, [property]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const artifact = media?.artifacts.find((a) => a.id === artifactId) ?? (post?.artifact && artifactId === post.artifactId ? { id: artifactId, ...post.artifact } : null);
  const artifactKind = artifact?.kind ?? null;
  const problems = useMemo(() => {
    const list = [
      ...captionProblems(mediaType === "text" ? caption : postText(caption, hashtags), { mediaType, step: post?.cadenceStep ?? null }),
      ...mediaProblems({
        mediaType,
        networks,
        hasArtifact: Boolean(artifactId),
        artifactKind,
        photoCount: photoUrls.length,
        step: post?.cadenceStep ?? null,
      }),
    ];
    if (networks.includes("instagram") && photoUrls.some((u) => !isJpegUrl(u))) {
      list.push({ code: "ig-jpeg", message: "Instagram n'accepte que des images JPEG." });
    }
    return list;
  }, [caption, hashtags, mediaType, networks, artifactId, artifactKind, photoUrls, post?.cadenceStep]);

  const payload = () => ({
    title,
    propertyId: property?.id ?? null,
    artifactId: mediaType === "video" || mediaType === "image" ? artifactId : null,
    mediaType,
    photoUrls: mediaType === "image" || mediaType === "carousel" ? photoUrls : [],
    caption,
    hashtags: mediaType === "text" ? [] : hashtags,
    notes,
    networks,
    scheduledAt: slotToIso(date, slot),
    assigneeId,
  });

  async function send(kind: string, init: RequestInit, url: string) {
    setBusy(kind);
    setMessage(null);
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      if (!res.ok) throw new Error(await readError(res));
      return (await res.json()) as { post?: Post };
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function save(): Promise<Post | null> {
    if (!date || !slot) {
      setMessage("Choisissez une date et une heure.");
      return null;
    }
    const out = post
      ? await send("save", { method: "PATCH", body: JSON.stringify(payload()) }, `/api/admin/studio/publications/${post.id}`)
      : await send("save", { method: "POST", body: JSON.stringify(payload()) }, "/api/admin/studio/publications");
    if (out?.post) onSaved(out.post);
    return out?.post ?? null;
  }

  async function act(action: "submit" | "approve" | "unapprove" | "back" | "retry") {
    // Save pending edits first, so the founder approves exactly what is on screen.
    const saved = await save();
    if (!saved) return;
    const out = await send(action, { method: "PATCH", body: JSON.stringify({ action }) }, `/api/admin/studio/publications/${saved.id}`);
    if (out?.post) onSaved(out.post);
  }

  async function remove() {
    if (!post) return;
    if (!window.confirm("Supprimer cette publication du calendrier ?")) return;
    const out = await send("delete", { method: "DELETE" }, `/api/admin/studio/publications/${post.id}`);
    if (out) onSaved(null, post.id);
  }

  async function generateCaption() {
    if (!property) {
      setMessage("Choisissez d'abord un bien.");
      return;
    }
    setBusy("caption");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/studio/publications/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: property.id }),
      });
      if (!res.ok) throw new Error(await readError(res));
      // The template's hashtag line becomes the hashtag list, as on the server.
      const clean = finalizeCaption({ caption: ((await res.json()) as { caption: string }).caption });
      setCaption(clean.caption);
      setHashtags(clean.hashtags);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  const status = post?.status ?? "a_faire";
  const isFounder = me.role === "founder";
  const past = new Date(slotToIso(date || "1970-01-01", slot || "00:00")).getTime() < Date.now();
  const slotChoices = slots.includes(slot) ? slots : [...slots, slot].sort();
  const togglePhoto = (url: string) =>
    setPhotoUrls((current) =>
      current.includes(url) ? current.filter((u) => u !== url) : mediaType === "image" ? [url] : current.length >= 10 ? current : [...current, url],
    );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-[90] bg-neutral-900/25"
      onClick={onClose}
    >
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label={post ? "Modifier la publication" : "Nouvelle publication"}
        onClick={(e) => e.stopPropagation()}
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.3, ease }}
        className="absolute inset-y-0 right-0 flex w-full max-w-[560px] flex-col bg-[#fbf6f0] shadow-2xl"
      >
        <header className="flex items-center gap-2 border-b border-[rgba(74,52,36,0.10)] px-4 py-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre (ex. Vidéo de présentation)"
            aria-label="Titre"
            disabled={locked}
            className="min-w-0 flex-1 bg-transparent text-base font-bold text-neutral-900 outline-none placeholder:text-neutral-400"
          />
          <StatusChip status={status} publishing={post?.publishing} />
          <button type="button" onClick={onClose} aria-label="Fermer" className="flex size-10 items-center justify-center rounded-full text-neutral-500 hover:bg-white">
            <XIcon size={18} weight="bold" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {post?.returnedAt && post.reviewComment && (
            <p className="rounded-2xl bg-[#FCEFD4] px-3 py-2 text-[13px] text-[#6E4300]">
              <span className="block font-bold">{post.returnedByName ?? "Salif"} a renvoyé cette publication</span>« {post.reviewComment} »
            </p>
          )}
          {post?.notes && <p className="rounded-2xl bg-white/70 px-3 py-2 text-[13px] text-neutral-600 ring-1 ring-inset ring-[rgba(74,52,36,0.08)]">{post.notes}</p>}

          {/* Results first when the post went out or failed. */}
          {post && (post.status === "publie" || post.status === "echec") && (
            <section className="grid gap-2">
              {(Object.keys(post.results) as Network[]).map((n) => {
                const r = post.results[n]!;
                return (
                  <div key={n} className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm ring-1 ring-inset ring-[rgba(74,52,36,0.08)]">
                    <NetworkIcon network={n} size={16} />
                    <span className="font-semibold text-neutral-800">{NETWORK_LABELS[n]}</span>
                    {r.status === "published" ? (
                      r.permalink ? (
                        <a href={r.permalink} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 font-semibold text-[#a8521d]">
                          Voir la publication <ArrowSquareOutIcon size={14} weight="bold" />
                        </a>
                      ) : (
                        <span className="ml-auto text-emerald-700">Publié</span>
                      )
                    ) : (
                      <span className="ml-auto text-right text-[13px] text-red-700">{r.error ?? "Échec"}</span>
                    )}
                  </div>
                );
              })}
              {post.status === "echec" && post.lastError && Object.keys(post.results).length === 0 && (
                <p className="text-sm text-red-700">{post.lastError}</p>
              )}
            </section>
          )}

          <section className="grid gap-1.5">
            <span className={label}>Bien</span>
            {property && !picking ? (
              <div className="flex items-center gap-3 rounded-2xl bg-white p-2 ring-1 ring-inset ring-[rgba(74,52,36,0.08)]">
                <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                  {property.image ? <Image src={property.image} alt="" fill sizes="48px" unoptimized className="object-cover" /> : <HouseLineIcon size={20} className="absolute inset-0 m-auto text-neutral-400" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900">{property.title}</span>
                {!locked && (
                  <button type="button" onClick={() => setPicking(true)} className="h-9 rounded-full px-3 text-sm font-semibold text-[#a8521d] hover:bg-primary/10">
                    Changer
                  </button>
                )}
              </div>
            ) : picking || !locked ? (
              <div className="max-h-80 overflow-y-auto rounded-2xl bg-white/60 p-2">
                <PropertyPicker
                  onPick={(p: PropertySummary) => {
                    setProperty({ id: p.id, title: p.title, image: p.image });
                    setArtifactId(null);
                    setPhotoUrls([]);
                    setPicking(false);
                  }}
                />
              </div>
            ) : null}
          </section>

          <section className="grid gap-1.5">
            <span className={label}>Type</span>
            <div role="radiogroup" aria-label="Type de publication" className="grid grid-cols-4 gap-1 rounded-2xl bg-white/70 p-1 ring-1 ring-inset ring-[rgba(74,52,36,0.08)]">
              {MEDIA_CHOICES.map(({ key, label: text, Icon }) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={mediaType === key}
                  disabled={locked}
                  onClick={() => {
                    setMediaType(key);
                    if (key === "text") setNetworks((n) => n.filter((x) => x !== "instagram"));
                    if (key === "image") setPhotoUrls((p) => p.slice(0, 1));
                  }}
                  className={cn(
                    "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold",
                    mediaType === key ? "bg-white text-[#a8521d] shadow-sm" : "text-neutral-600 hover:bg-white/60",
                  )}
                >
                  <Icon size={14} weight="bold" />
                  {text}
                </button>
              ))}
            </div>
          </section>

          {mediaType !== "text" && (
            <section className="grid gap-2">
              <span className={label}>Média</span>
              {!property ? (
                <p className="text-sm text-neutral-500">Choisissez un bien pour voir ses vidéos, visuels et photos.</p>
              ) : !media ? (
                <span className="studio-skeleton h-24 rounded-2xl" />
              ) : (
                <>
                  {(mediaType === "video" || mediaType === "image") && (
                    <div className="grid grid-cols-3 gap-2">
                      {media.artifacts
                        .filter((a) => a.kind === mediaType)
                        .map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            disabled={locked}
                            onClick={() => {
                              setArtifactId(artifactId === a.id ? null : a.id);
                              if (mediaType === "image") setPhotoUrls([]);
                            }}
                            aria-pressed={artifactId === a.id}
                            className={cn(
                              "relative aspect-[9/16] overflow-hidden rounded-2xl bg-neutral-200 ring-2 ring-offset-2 ring-offset-[#fbf6f0]",
                              artifactId === a.id ? "ring-primary" : "ring-transparent",
                            )}
                            title={a.title}
                          >
                            {a.url && a.kind === "video" ? (
                              <video src={a.url} muted playsInline preload="metadata" className="size-full object-cover" />
                            ) : a.url ? (
                              <Image src={a.url} alt="" fill sizes="160px" unoptimized className="object-cover" />
                            ) : null}
                            <span className="absolute inset-x-0 bottom-0 truncate bg-white/85 px-2 py-1 text-left text-[11px] font-semibold text-neutral-800">{a.title}</span>
                          </button>
                        ))}
                      {media.artifacts.filter((a) => a.kind === mediaType).length === 0 && (
                        <p className="col-span-3 text-sm text-neutral-500">
                          {mediaType === "video" ? "Aucune vidéo du Studio pour ce bien. Créez-la dans l'Éditeur vidéo." : "Aucun visuel du Studio pour ce bien."}
                        </p>
                      )}
                    </div>
                  )}
                  {(mediaType === "image" || mediaType === "carousel") && (
                    <>
                      <span className="text-[11px] text-neutral-500">
                        {mediaType === "carousel" ? `Photos de l'annonce, dans l'ordre choisi (${photoUrls.length}/10, 2 au minimum)` : "Ou une photo de l'annonce"}
                      </span>
                      <div className="grid grid-cols-4 gap-2">
                        {media.photos.map((url) => {
                          const index = photoUrls.indexOf(url);
                          return (
                            <button
                              key={url}
                              type="button"
                              disabled={locked}
                              onClick={() => {
                                togglePhoto(url);
                                if (mediaType === "image") setArtifactId(null);
                              }}
                              aria-pressed={index >= 0}
                              className={cn(
                                "relative aspect-square overflow-hidden rounded-xl bg-neutral-200 ring-2 ring-offset-2 ring-offset-[#fbf6f0]",
                                index >= 0 ? "ring-primary" : "ring-transparent",
                              )}
                            >
                              <Image src={url} alt="" fill sizes="120px" unoptimized className="object-cover" />
                              {index >= 0 && (
                                <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                                  {index + 1}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}
            </section>
          )}

          <section className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className={label}>Légende</span>
              <button
                type="button"
                onClick={() => void generateCaption()}
                disabled={locked || busy !== null}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary/10 px-3 text-[13px] font-semibold text-[#a8521d] hover:bg-primary/15 disabled:opacity-50"
              >
                <SparkleIcon size={14} weight="bold" />
                Générer la légende
              </button>
            </div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              disabled={locked}
              rows={12}
              className={cn(field, "font-[inherit] text-[14px] leading-relaxed")}
              aria-label="Légende"
            />
            {mediaType !== "text" && hashtags.length > 0 && (
              <ul aria-label="Hashtags" className="flex flex-wrap gap-1.5">
                {hashtags.map((tag) => (
                  <li key={tag}>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => setHashtags((cur) => cur.filter((t) => t !== tag))}
                      aria-label={`Retirer ${tag}`}
                      className="inline-flex h-8 items-center gap-1 rounded-full bg-[#FFF1E4] px-3 text-[12px] font-bold text-[#A8521D] hover:bg-[#FCE3CC]"
                    >
                      {tag}
                      <XIcon size={11} weight="bold" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <span className="text-right text-[11px] tabular-nums text-neutral-400">{postText(caption, mediaType === "text" ? [] : hashtags).length} / 2 200</span>
          </section>

          <section className="grid gap-1.5">
            <span className={label}>Réseaux</span>
            <div className="flex flex-wrap gap-2">
              {(["facebook", "instagram"] as const).map((n) => {
                const on = networks.includes(n);
                const blocked = n === "instagram" && mediaType === "text";
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={on}
                    disabled={locked || blocked}
                    title={blocked ? "Instagram ne publie pas de texte seul." : undefined}
                    onClick={() => setNetworks((cur) => (on ? cur.filter((x) => x !== n) : [...cur, n]))}
                    className={cn(
                      "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 ring-inset",
                      on ? "bg-white text-neutral-900 ring-primary/40" : "bg-white/50 text-neutral-500 ring-[rgba(74,52,36,0.10)]",
                      blocked && "opacity-40",
                    )}
                  >
                    <NetworkIcon network={n} size={16} />
                    {NETWORK_LABELS[n]}
                  </button>
                );
              })}
              <span
                title={TIKTOK_PENDING_TOOLTIP}
                aria-disabled="true"
                className="inline-flex h-10 cursor-help items-center gap-2 rounded-full bg-white/40 px-4 text-sm font-semibold text-neutral-400 ring-1 ring-inset ring-[rgba(74,52,36,0.08)]"
              >
                <NetworkIcon network="tiktok" size={16} className="opacity-40" />
                TikTok (bientôt)
              </span>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5">
              <span className={label}>Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={locked} className={field} />
            </label>
            <label className="grid gap-1.5">
              <span className={label}>Heure (Ouagadougou)</span>
              <select value={slot} onChange={(e) => setSlot(e.target.value)} disabled={locked} className={field}>
                {slotChoices.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 grid gap-1.5">
              <span className={label}>Responsable</span>
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} disabled={locked} className={field}>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.role === "founder" ? " (fondateur)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 grid gap-1.5">
              <span className={label}>Notes pour l&apos;équipe</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={locked} rows={2} className={field} />
            </label>
          </section>

          {!locked && problems.length > 0 && (
            <section aria-label="À corriger avant validation" className="grid gap-1 rounded-2xl bg-amber-50 px-3 py-2.5 ring-1 ring-inset ring-amber-200">
              <span className="text-xs font-bold text-amber-900">À corriger avant validation</span>
              {problems.map((p) => (
                <span key={p.code} className="flex items-start gap-1.5 text-[13px] text-amber-900">
                  <WarningCircleIcon size={14} weight="bold" className="mt-0.5 shrink-0" />
                  {p.message}
                </span>
              ))}
            </section>
          )}

          {post?.approvedByName && post.status !== "a_faire" && post.status !== "a_valider" && (
            <p className="flex items-center gap-1.5 text-[13px] text-neutral-600">
              <CheckCircleIcon size={15} weight="fill" className="text-sky-600" />
              Validé par {post.approvedByName}
              {post.approvedAt ? ` le ${new Date(post.approvedAt).toLocaleString("fr-FR", { timeZone: "UTC", dateStyle: "short", timeStyle: "short" })}` : ""}
            </p>
          )}
          {message && (
            <p role="alert" className="text-sm font-semibold text-red-600">
              {message}
            </p>
          )}
        </div>

        {/* Actions. Saving never publishes; only "Valider" (founders) lets the post go out at its time. */}
        <footer className="flex flex-wrap items-center gap-2 border-t border-[rgba(74,52,36,0.10)] px-4 py-3">
          {post && !locked && (isFounder || post.createdById === me.id) && (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy !== null}
              aria-label="Supprimer"
              className="flex size-10 items-center justify-center rounded-full text-neutral-500 hover:bg-red-50 hover:text-red-600"
            >
              <TrashIcon size={18} weight="bold" />
            </button>
          )}
          <span className="flex-1" />
          {!locked && (
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy !== null}
              className="h-10 rounded-full border border-[rgba(74,52,36,0.12)] bg-white px-4 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
            >
              {busy === "save" ? "Enregistrement…" : "Enregistrer"}
            </button>
          )}
          {!locked && status === "a_faire" && (
            <button
              type="button"
              onClick={() => void act("submit")}
              disabled={busy !== null || !caption.trim()}
              title={!caption.trim() ? "Écrivez ou générez la légende d'abord." : undefined}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-amber-500 px-4 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              <PaperPlaneTiltIcon size={15} weight="bold" />
              Envoyer pour validation
            </button>
          )}
          {!locked && status === "a_valider" && canChangeStatus(me.role, status, "a_faire") && !isFounder && (
            <button type="button" onClick={() => void act("back")} disabled={busy !== null} className="h-10 rounded-full px-3 text-sm font-semibold text-neutral-600 hover:bg-white">
              Remettre à faire
            </button>
          )}
          {!locked && status === "valide" && (
            <button type="button" onClick={() => void act("unapprove")} disabled={busy !== null} className="h-10 rounded-full px-3 text-sm font-semibold text-neutral-600 hover:bg-white">
              Retirer la validation
            </button>
          )}
          {!locked && post && canRetry(me.role, status, Boolean(post.approvedByName)) && (
            <button
              type="button"
              onClick={() => void act("retry")}
              disabled={busy !== null}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-neutral-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              <ArrowClockwiseIcon size={15} weight="bold" />
              Réessayer
            </button>
          )}
          {!locked && isFounder && (status === "a_faire" || status === "a_valider") && (
            <button
              type="button"
              onClick={() => void act("approve")}
              disabled={busy !== null || problems.length > 0}
              title={problems.length ? "Corrigez les points signalés avant de valider." : past ? "L'heure est passée : la publication partira au prochain passage (10 min)." : undefined}
              className={cn("inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold disabled:opacity-50", primaryGradient)}
            >
              <CheckCircleIcon size={15} weight="bold" />
              Valider
            </button>
          )}
        </footer>
        {!isFounder && status === "a_valider" && !locked && (
          <p className="px-4 pb-3 text-[12px] text-neutral-500">En attente de la validation de Salif. Rien n&apos;est publié sans son accord.</p>
        )}
      </motion.aside>
    </motion.div>
  );
}
