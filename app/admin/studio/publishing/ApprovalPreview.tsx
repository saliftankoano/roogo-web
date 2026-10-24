"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { CheckIcon, XIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { notifyApprovalsChanged } from "@/components/admin/useStudioApprovals";
import {
  RETURN_TAGS,
  isoToDateAndSlot,
  networksLabel,
  postText,
  slotLabel,
  slotToIso,
  type Network,
  type ReturnTag,
} from "@/lib/studio/publishing";
import { NetworkIcon } from "../calendrier/NetworkIcons";
import { readError, type Post } from "../calendrier/calendar-types";
import { isPhone, motionOn, riseIn } from "./motion";
import { useDialog } from "./useDialog";
import { TikTokChoice, TikTokNote } from "./TikTokChoice";
import { NetworkTexts } from "./NetworkTexts";
import type { TikTokPublishInfo } from "@/lib/social/tiktok-publish";
import type { YouTubePublishInfo } from "@/lib/social/youtube-upload";
import { YouTubeNote } from "./YouTubeNote";

type View = "preview" | "return" | "approved";

/**
 * Founder preview (design steps 8, 8b, 9): the video, the date, the networks,
 * the full description Salif may edit, then "Renvoyer" or "Valider et
 * programmer". A centred modal on a computer, full screen on a phone.
 */
export function ApprovalPreview({
  queue,
  startIndex = 0,
  daySlots,
  tiktok,
  youtube,
  onClose,
  onChanged,
}: {
  queue: Post[];
  startIndex?: number;
  daySlots: string[];
  /** TikTok publishing status from the server (feature flag). */
  tiktok?: TikTokPublishInfo | null;
  /** YouTube Shorts status (Studio › Publier passes it); without it YouTube can only be removed. */
  youtube?: YouTubePublishInfo | null;
  onClose: () => void;
  onChanged: (post: Post) => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const checkRef = useRef<HTMLSpanElement | null>(null);
  const closing = useRef(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // The queue is frozen at opening; handled posts leave it.
  const [items, setItems] = useState<Post[]>(queue);
  const [index, setIndex] = useState(
    Math.min(startIndex, Math.max(0, queue.length - 1)),
  );
  const [view, setView] = useState<View>("preview");
  const [done, setDone] = useState<Post | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [dating, setDating] = useState(false);
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState(daySlots[daySlots.length - 1] ?? "19:00");
  const [comment, setComment] = useState("");
  const [tags, setTags] = useState<ReturnTag[]>([]);

  const post = done ?? items[index] ?? null;
  const total = items.length;

  useLayoutEffect(() => {
    if (!mounted || !motionOn()) return;
    if (backdropRef.current)
      gsap.fromTo(
        backdropRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.25 },
      );
    const panel = panelRef.current;
    if (!panel) return;
    if (isPhone())
      gsap.fromTo(
        panel,
        { yPercent: 100 },
        { yPercent: 0, duration: 0.45, ease: "power3.out" },
      );
    else
      gsap.fromTo(
        panel,
        { opacity: 0, scale: 0.98, y: 12 },
        { opacity: 1, scale: 1, y: 0, duration: 0.35, ease: "power3.out" },
      );
  }, [mounted]);

  useEffect(() => {
    if (view === "return") riseIn(bodyRef.current);
    // Each view puts the keyboard on its first useful control.
    if (view !== "preview") {
      window.setTimeout(() => panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true }), 30);
    }
    if (view === "approved" && checkRef.current && motionOn()) {
      gsap.fromTo(
        checkRef.current,
        { scale: 0.98, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.35, ease: "power2.out" },
      );
    }
  }, [view]);

  function close() {
    if (closing.current) return;
    closing.current = true;
    const panel = panelRef.current;
    if (!panel || !motionOn()) return onClose();
    const tl = gsap.timeline({ onComplete: onClose });
    tl.to(
      panel,
      isPhone()
        ? { yPercent: 100, duration: 0.3, ease: "power2.in" }
        : { opacity: 0, scale: 0.98, duration: 0.2, ease: "power2.in" },
    );
    if (backdropRef.current)
      tl.to(backdropRef.current, { opacity: 0, duration: 0.2 }, "<");
  }

  useDialog(panelRef, close, mounted);

  async function patch(
    kind: string,
    body: Record<string, unknown>,
  ): Promise<Post | null> {
    if (!post) return null;
    setBusy(kind);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/studio/publications/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res));
      const { post: saved } = (await res.json()) as { post: Post };
      onChanged(saved);
      notifyApprovalsChanged();
      return saved;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur");
      return null;
    } finally {
      setBusy(null);
    }
  }

  function replace(saved: Post) {
    setItems((list) => list.map((p) => (p.id === saved.id ? saved : p)));
  }

  async function approve() {
    const saved = await patch("approve", { action: "approve" });
    if (!saved) return;
    setDone(saved);
    setItems((list) => list.filter((p) => p.id !== saved.id));
    setView("approved");
  }

  async function cancelApproval() {
    if (!done) return;
    const saved = await patch("unapprove", { action: "unapprove" });
    if (!saved) return;
    setItems((list) => {
      const next = [...list];
      next.splice(Math.min(index, next.length), 0, saved);
      return next;
    });
    setDone(null);
    setView("preview");
  }

  async function sendBack() {
    const saved = await patch("return", { action: "return", comment, tags });
    if (!saved) return;
    setComment("");
    setTags([]);
    const rest = items.filter((p) => p.id !== saved.id);
    setItems(rest);
    setView("preview");
    if (!rest.length) close();
    else setIndex((i) => Math.min(i, rest.length - 1));
  }

  async function saveCaption() {
    const saved = await patch("caption", {
      caption: draft,
      hashtags: draftTags.split(/[\s,]+/).filter(Boolean),
    });
    if (!saved) return;
    replace(saved);
    setEditing(false);
  }

  async function saveDate() {
    // A chosen date replaces « Dès que vous validez ».
    const saved = await patch("date", { scheduledAt: slotToIso(date, slot), ...(post?.finalVideo ? { publishOnApproval: false } : {}) });
    if (!saved) return;
    replace(saved);
    setDating(false);
  }

  async function toggleNetwork(n: Network) {
    if (!post) return;
    const next = post.networks.includes(n)
      ? post.networks.filter((x) => x !== n)
      : [...post.networks, n];
    if (!next.length) return setMessage("Gardez au moins un réseau.");
    const saved = await patch("networks", { networks: next });
    if (saved) replace(saved);
  }

  /** « Publier une vidéo »: Salif edits one network's text (all of them when « Même texte partout »). */
  async function saveNetworkText(network: Network, text: string, hashtags: string[]): Promise<boolean> {
    if (!post) return false;
    const entry = { text, hashtags };
    const next = post.sameText
      ? Object.fromEntries(post.networks.map((n) => [n, entry]))
      : { ...(post.networkCopy ?? {}), [network]: entry };
    const saved = await patch("caption", post.sameText ? { networkCopy: next, caption: text, hashtags: hashtags.slice(0, 5) } : { networkCopy: next });
    if (!saved) return false;
    replace(saved);
    return true;
  }

  if (!mounted || !post) return null;
  const uploaded = Boolean(post.finalVideo);
  const now = Boolean(post.publishOnApproval);
  const videoUrl = post.finalVideo?.streamUrl ?? post.artifact?.url ?? null;
  const who = post.submittedByName ?? post.assigneeName ?? "l'équipe";
  const place = post.property?.place;
  const heading = post.finalVideo ? post.title : [post.title, place].filter(Boolean).join(", ");
  const nextOne = items[Math.min(index, items.length - 1)] ?? null;

  const video = (
    <div className="relative mx-auto aspect-[9/16] w-full max-w-[150px] overflow-hidden rounded-2xl bg-[linear-gradient(160deg,#d4a985,#8a5a3a)] md:max-w-[300px]">
      {videoUrl ? (
        <video
          src={videoUrl}
          controls
          playsInline
          preload="metadata"
          className="size-full object-cover"
          aria-label={`Vidéo : ${post.title}`}
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center px-3 text-center text-xs font-semibold text-white/90">
          Vidéo indisponible
        </span>
      )}
    </div>
  );

  let body: React.ReactNode;
  let footer: React.ReactNode;

  if (view === "approved" && done) {
    body = (
      <div
        className="grid justify-items-center gap-3 py-8 text-center"
        aria-live="polite"
      >
        <span
          ref={checkRef}
          className="flex size-16 items-center justify-center rounded-full bg-[#2F7A48] text-white"
        >
          <CheckIcon size={34} weight="bold" />
        </span>
        <h3 className="text-2xl font-bold tracking-tight text-[#1F1A16]">
          {done.publishOnApproval ? "Validée, publication lancée" : "Validée et programmée"}
        </h3>
        <p className="max-w-sm text-[15px] text-neutral-700">
          {done.publishOnApproval ? "Part maintenant" : <>Part {slotLabel(done.scheduledAt).replace(/^./, (c) => c.toLowerCase())}</>}{" "}
          sur {networksLabel(done.networks)}.{" "}
          {post.submittedByName
            ? `${post.submittedByName} le verra dans le Studio.`
            : "L'équipe le verra dans le Studio."}
        </p>
        {!items.length && (
          <p className="text-sm text-neutral-500">
            Tout est validé pour le moment.
          </p>
        )}
      </div>
    );
    footer = (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void cancelApproval()}
          disabled={busy !== null}
          className="h-12 flex-1 rounded-full bg-white text-[15px] font-bold text-[#1F1A16] ring-1 ring-[rgba(74,52,36,0.18)] disabled:opacity-50"
        >
          {busy === "unapprove" ? "Annulation…" : done.publishOnApproval ? "Arrêter" : "Annuler"}
        </button>
        <button
          type="button"
          data-autofocus
          onClick={() => {
            if (nextOne) {
              setDone(null);
              setView("preview");
              setIndex(Math.min(index, items.length - 1));
            } else close();
          }}
          className="h-12 flex-1 rounded-full bg-[#1F1A16] text-[15px] font-bold text-white"
        >
          {nextOne ? "Suivante" : "Fermer"}
        </button>
      </div>
    );
  } else if (view === "return") {
    body = (
      <div ref={bodyRef} className="grid gap-3">
        <div>
          <h3 className="text-lg font-bold text-[#1F1A16]">{uploaded ? `Demander une modification à ${who}` : `Renvoyer à ${who}`}</h3>
          <p className="text-[13px] text-neutral-600">
            Dites ce qu&apos;il faut corriger. La date est libérée.
          </p>
        </div>
        <label className="sr-only" htmlFor="return-comment">
          Commentaire pour {who}
        </label>
        <textarea
          id="return-comment"
          data-autofocus
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={5}
          required
          aria-required="true"
          placeholder="Ex. Refaire le son : on entend une moto à 0:12."
          className="w-full rounded-2xl border-2 border-[#C96A2E] bg-[#FFFDFB] px-3.5 py-3 text-[15px] text-[#1F1A16] outline-none"
        />
        <div
          role="group"
          aria-label="Ce qui est à corriger"
          className="flex flex-wrap gap-2"
        >
          {RETURN_TAGS.map((tag) => {
            const on = tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setTags((cur) =>
                    on ? cur.filter((t) => t !== tag) : [...cur, tag],
                  )
                }
                className={cn(
                  "h-11 rounded-full px-4 text-[13px] font-bold transition-colors md:h-9",
                  on
                    ? "bg-[#C96A2E] text-white"
                    : "bg-[#FFF1E4] text-[#A8521D] hover:bg-[#FCE3CC]",
                )}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>
    );
    footer = (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setView("preview")}
          className="h-12 flex-none rounded-full px-5 bg-white text-[15px] font-bold text-[#1F1A16] ring-1 ring-[rgba(74,52,36,0.18)]"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={() => void sendBack()}
          disabled={!comment.trim() || busy !== null}
          className="h-12 min-w-0 flex-1 whitespace-nowrap rounded-full bg-[#1F1A16] px-3 text-[14px] sm:text-[15px] font-bold text-white disabled:opacity-50"
        >
          {busy === "return" ? "Envoi…" : "Renvoyer avec ce commentaire"}
        </button>
      </div>
    );
  } else {
    body = (
      <div className="grid gap-4">
        <div className="flex min-w-0 gap-3.5">
          {/* Phone: the video beside the date, as in the design. */}
          <div className="w-[112px] shrink-0 md:hidden">{video}</div>
          <div className="grid min-w-0 flex-1 content-start gap-1">
            <span className="text-[17px] font-bold text-[#1F1A16]">
              {now ? "Dès que vous validez" : slotLabel(post.scheduledAt)}
            </span>
            <span className="text-[13px] text-neutral-600">
              Proposée par {who}
            </span>
            {dating ? (
              <div className="mt-1 grid grid-cols-[minmax(0,1fr)_minmax(0,7rem)] gap-2">
                <input
                  type="date"
                  aria-label="Nouvelle date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-11 min-w-0 rounded-xl border border-neutral-200 bg-white px-3 text-[15px] outline-none focus:border-[#C96A2E]"
                />
                <select
                  aria-label="Heure"
                  value={slot}
                  onChange={(e) => setSlot(e.target.value)}
                  className="h-11 rounded-xl border border-neutral-200 bg-white px-3 text-[15px] outline-none focus:border-[#C96A2E]"
                >
                  {daySlots.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <div className="col-span-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDating(false)}
                    className="h-11 flex-1 rounded-full text-sm font-bold text-neutral-600 ring-1 ring-[rgba(74,52,36,0.15)]"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveDate()}
                    disabled={!date || busy !== null}
                    className="h-11 flex-1 rounded-full bg-[#1F1A16] text-sm font-bold text-white disabled:opacity-50"
                  >
                    Enregistrer
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const cur = isoToDateAndSlot(post.scheduledAt);
                  setDate(cur.date);
                  setSlot(
                    daySlots.includes(cur.slot)
                      ? cur.slot
                      : (daySlots[daySlots.length - 1] ?? cur.slot),
                  );
                  setDating(true);
                }}
                className="min-h-11 w-max text-sm font-semibold text-[#A8521D] underline underline-offset-2 md:min-h-8"
              >
                {now ? "Choisir une date" : "Changer la date"}
              </button>
            )}
          </div>
        </div>

        <div
          role="group"
          aria-label="Réseaux"
          className={cn(
            "grid gap-2",
            uploaded ? "grid-cols-2 sm:grid-cols-4" : tiktok?.enabled ? "grid-cols-3" : "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]",
          )}
        >
          {(["instagram", "facebook"] as const).map((n) => {
            const on = post.networks.includes(n);
            return (
              <button
                key={n}
                type="button"
                aria-pressed={on}
                disabled={busy !== null}
                onClick={() => void toggleNetwork(n)}
                className={cn(
                  "inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-2xl px-1.5 text-[13px] font-semibold",
                  on
                    ? "bg-white text-[#1F1A16] ring-2 ring-[#C96A2E]"
                    : "bg-white/60 text-neutral-500 ring-1 ring-[rgba(74,52,36,0.12)]",
                )}
              >
                <NetworkIcon network={n} size={16} label={false} />
                <span className="truncate">
                  {n === "facebook" ? "Facebook" : "Instagram"}
                </span>
              </button>
            );
          })}
          <TikTokChoice
            info={tiktok}
            on={post.networks.includes("tiktok")}
            isVideo={post.mediaType === "video"}
            disabled={busy !== null}
            onToggle={() => void toggleNetwork("tiktok")}
            iconSize={16}
            className="h-11"
          />
          {uploaded && (youtube?.enabled || post.networks.includes("youtube")) && (
            <button
              type="button"
              aria-pressed={post.networks.includes("youtube")}
              disabled={busy !== null || (!post.networks.includes("youtube") && !youtube?.enabled)}
              onClick={() => void toggleNetwork("youtube")}
              className={cn(
                "inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-2xl px-1.5 text-[13px] font-semibold disabled:opacity-50",
                post.networks.includes("youtube")
                  ? "bg-white text-[#1F1A16] ring-2 ring-[#C96A2E]"
                  : "bg-white/60 text-neutral-500 ring-1 ring-[rgba(74,52,36,0.12)]",
              )}
            >
              <NetworkIcon network="youtube" size={16} label={false} />
              <span className="truncate">YouTube</span>
            </button>
          )}
        </div>
        {(tiktok?.enabled || post.networks.includes("tiktok")) && <TikTokNote info={tiktok} />}
        {post.networks.includes("youtube") && <YouTubeNote info={youtube} />}

        {uploaded ? (
          <NetworkTexts post={post} busy={busy !== null} onSave={saveNetworkText} />
        ) : (
        <section
          aria-labelledby="preview-desc"
          className="grid gap-2 rounded-2xl bg-white p-3.5 ring-1 ring-[rgba(74,52,36,0.10)]"
        >
          <div className="flex items-center justify-between gap-2">
            <h4
              id="preview-desc"
              className="text-[13px] font-bold text-[#1F1A16]"
            >
              Description proposée
            </h4>
            {!editing && (
              <button
                type="button"
                onClick={() => {
                  setDraft(post.caption);
                  setDraftTags(post.hashtags.join(" "));
                  setEditing(true);
                }}
                className="h-11 rounded-full px-3.5 text-[13px] font-bold text-[#1F1A16] ring-1 ring-[rgba(74,52,36,0.15)] hover:bg-[#F6F1EA] md:h-8"
              >
                Modifier
              </button>
            )}
          </div>
          {editing ? (
            <div className="grid gap-2">
              <textarea
                aria-label="Description"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={8}
                className="w-full rounded-xl border-2 border-[#C96A2E] px-3 py-2.5 text-[14px] leading-relaxed outline-none"
              />
              <input
                aria-label="Hashtags"
                value={draftTags}
                onChange={(e) => setDraftTags(e.target.value)}
                className="h-11 w-full rounded-xl border border-neutral-200 px-3 text-[14px] text-[#A8521D] outline-none focus:border-[#C96A2E]"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="h-11 flex-1 rounded-full text-sm font-bold text-neutral-600 ring-1 ring-[rgba(74,52,36,0.15)]"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void saveCaption()}
                  disabled={!draft.trim() || busy !== null}
                  className="h-11 flex-1 rounded-full bg-[#1F1A16] text-sm font-bold text-white disabled:opacity-50"
                >
                  {busy === "caption" ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
            </div>
          ) : (
            <div className="whitespace-pre-line break-words text-[14px] leading-relaxed text-[#1F1A16]">
              {post.caption}
              {post.hashtags.length > 0 && (
                <p className="mt-3 font-semibold text-[#A8521D]">
                  {post.hashtags.join(" ")}
                </p>
              )}
            </div>
          )}
          <span className="text-right text-[11px] tabular-nums text-neutral-400">
            {postText(post.caption, post.hashtags).length} / 2 200
          </span>
        </section>
        )}
      </div>
    );
    footer = (
      // « Demander une modification » is long: on a phone the two buttons stack, Valider on top.
      <div className={cn("flex gap-2", uploaded && "flex-col-reverse sm:flex-row")}>
        <button
          type="button"
          onClick={() => setView("return")}
          disabled={busy !== null}
          className={cn("h-12 rounded-full bg-white px-3 text-[15px] font-bold text-[#1F1A16] ring-1 ring-[rgba(74,52,36,0.18)] disabled:opacity-50", uploaded ? "shrink-0 sm:flex-1" : "flex-1")}
        >
          {uploaded ? "Demander une modification" : "Renvoyer"}
        </button>
        <button
          type="button"
          onClick={() => void approve()}
          disabled={busy !== null || editing}
          className={cn("h-12 rounded-full bg-[#C96A2E] text-[15px] font-bold text-white hover:bg-[#B85E26] disabled:opacity-50", uploaded ? "shrink-0 sm:flex-1" : "flex-[1.6]")}
        >
          {busy === "approve" ? "Validation…" : now ? "Valider et publier" : "Valider et programmer"}
        </button>
      </div>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-stretch justify-center md:items-center md:p-6">
      <div
        ref={backdropRef}
        aria-hidden="true"
        onClick={close}
        className="absolute inset-0 bg-[rgba(31,26,22,0.45)]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-title"
        tabIndex={-1}
        className="relative flex h-dvh w-full flex-col bg-[#FFFDFB] outline-none md:h-auto md:max-h-[min(90dvh,820px)] md:max-w-[880px] md:flex-row md:overflow-hidden md:rounded-[28px] md:shadow-[0_40px_90px_-40px_rgba(31,26,22,0.7)]"
      >
        {/* Desktop: the video column on the left. */}
        <div className="hidden shrink-0 items-center bg-[#F6F1EA] p-6 md:flex md:w-[360px]">
          {video}
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex items-start gap-3 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] md:pt-6">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#A8521D]">
                {view === "approved"
                  ? "Validée"
                  : `À valider · ${Math.min(index + 1, Math.max(total, 1))} sur ${Math.max(total, 1)}`}
              </p>
              <h2
                id="preview-title"
                className="truncate text-lg font-bold text-[#1F1A16] md:text-xl"
              >
                {heading || "Publication"}
              </h2>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Fermer"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#F6F1EA] text-neutral-600 hover:bg-[#EFE7DD]"
            >
              <XIcon size={18} weight="bold" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
            {/* Phone: the video sits at the top of the scroll. */}
            {body}
            {message && (
              <p
                role="alert"
                className="mt-3 text-sm font-semibold text-red-700"
              >
                {message}
              </p>
            )}
          </div>

          <footer className="border-t border-[rgba(74,52,36,0.08)] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            {footer}
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  );
}
