"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowBendUpLeftIcon,
  ArrowSquareOutIcon,
  CheckIcon,
  ClockIcon,
  EyeSlashIcon,
  HouseLineIcon,
  PaperPlaneRightIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  INBOX_NETWORK_LABELS,
  INBOX_STATUS_LABELS,
  MAX_REPLY_LENGTH,
  messagingWindow,
  openOnNetworkUrl,
  replyBlockReason,
  windowLabel,
  type InboxItemDto,
  type InboxStatus,
  type StatusAction,
} from "@/lib/social/inbox";
import { slaLabel, type SlaState } from "@/lib/social/sla";
import { MessengerIcon, NetworkIcon } from "../calendrier/NetworkIcons";
import { ouagaTime } from "./format";

const STATUS_TONE: Record<InboxStatus, string> = {
  a_repondre: "bg-[#FCEBDD] text-[#8A3F12] ring-[#F1C9A6]",
  repondu: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  ignore: "bg-neutral-100 text-neutral-600 ring-neutral-200",
};

/**
 * The team's deadline on a card « À répondre » (24 business hours, Mon to Fri,
 * Ouagadougou time): « À répondre avant lun. 18:00 », or red « En retard de 3 h ».
 */
export function SlaChip({ state }: { state: SlaState }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold ring-1 ring-inset",
        state.overdue ? "bg-[#8E2A1E] text-white ring-[#8E2A1E]" : "bg-[#FCEBDD] text-[#8A3F12] ring-[#F1C9A6]",
      )}
    >
      {state.overdue ? <WarningCircleIcon size={13} weight="bold" className="size-[13px] shrink-0" /> : <ClockIcon size={13} weight="bold" className="size-[13px] shrink-0" />}
      {slaLabel(state)}
    </span>
  );
}

export function InboxStatusChip({ status }: { status: InboxStatus }) {
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[11px] font-semibold ring-1 ring-inset", STATUS_TONE[status])}>
      {INBOX_STATUS_LABELS[status]}
    </span>
  );
}

type Props = {
  item: InboxItemDto;
  now: number;
  /** The team's deadline (lib/social/sla.ts); null when not « À répondre ». */
  sla?: SlaState | null;
  pageId: string | null;
  onChange: (item: InboxItemDto) => void;
  /** Preview only: start with the reply box open and this draft. */
  initialDraft?: string;
};

export function InboxCard({ item, now, sla = null, pageId, onChange, initialDraft }: Props) {
  const [draft, setDraft] = useState(initialDraft ?? "");
  const [open, setOpen] = useState(item.status === "a_repondre" || initialDraft !== undefined);
  const [busy, setBusy] = useState<null | "send" | StatusAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const nowDate = new Date(now);
  const blocked = replyBlockReason(
    { network: item.network, kind: item.kind, lastUserMessageAt: item.lastUserMessageAt, authorId: item.hasRecipient ? "x" : null },
    nowDate,
  );
  const win = item.kind === "message" ? messagingWindow(item.lastUserMessageAt, nowDate) : null;
  const windowText = win ? windowLabel(win) : null;
  const networkUrl = openOnNetworkUrl(item, pageId);

  async function call(url: string, init: RequestInit, kind: "send" | StatusAction) {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const body = (await res.json().catch(() => null)) as { item?: InboxItemDto; error?: string } | null;
      if (!res.ok || !body?.item) {
        setError(body?.error ?? `L'action a échoué (HTTP ${res.status}).`);
        return false;
      }
      onChange(body.item);
      return true;
    } catch (e) {
      setError(`L'action a échoué : ${e instanceof Error ? e.message : "erreur réseau"}.`);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    const ok = await call(`/api/admin/social/inbox/${item.id}/reply`, { method: "POST", body: JSON.stringify({ text: draft }) }, "send");
    if (ok) setDraft("");
  }

  const act = (action: StatusAction) => call(`/api/admin/social/inbox/${item.id}`, { method: "PATCH", body: JSON.stringify({ action }) }, action);

  const thread = item.messages;
  const visible = showAll ? thread : thread.slice(-4);
  const lastReply = item.replies.at(-1);

  return (
    <li
      className={cn(
        "min-w-0 rounded-[22px] bg-white/90 p-3.5 ring-1 ring-[rgba(74,52,36,0.08)] md:p-4",
        item.status === "a_repondre" && "ring-[rgba(201,106,46,0.35)]",
        sla?.overdue && "ring-2 ring-[rgba(142,42,30,0.45)]",
      )}
    >
      {/* Who, where, when */}
      <div className="flex min-w-0 items-start gap-2.5">
        {item.kind === "message" && item.network === "facebook" ? (
          <MessengerIcon size={22} className="mt-0.5" />
        ) : (
          <NetworkIcon network={item.network} size={22} className="mt-0.5" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-[#1F1A16]">{item.authorName}</p>
          <p className="text-[12px] text-neutral-600">
            {item.kind === "comment" ? "Commentaire" : "Message"} {INBOX_NETWORK_LABELS[item.network]} · <span className="whitespace-nowrap">{ouagaTime(item.at)}</span>
          </p>
        </div>
        {/* « À répondre » shows as its deadline chip below instead. */}
        {!sla && <InboxStatusChip status={item.status} />}
      </div>
      {sla && (
        <div className="mt-2">
          <SlaChip state={sla} />
        </div>
      )}

      {/* Comment: the text, then the post it is on */}
      {item.kind === "comment" && (
        <p className="mt-2.5 whitespace-pre-line break-words text-[15px] leading-snug text-[#1F1A16]">{item.text || "Sans texte"}</p>
      )}

      {/* Message: the last messages of the thread */}
      {item.kind === "message" && (
        <div className="mt-2.5 grid gap-1.5">
          {thread.length > 4 && !showAll && (
            <button type="button" onClick={() => setShowAll(true)} className="justify-self-start text-[12px] font-semibold text-[#A8521D] underline underline-offset-2">
              Voir les {thread.length} derniers messages
            </button>
          )}
          {(visible.length ? visible : [{ id: "only", fromUs: false, text: item.text, at: item.at }]).map((m) => (
            <div key={m.id} className={cn("flex min-w-0", m.fromUs ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-[14px] leading-snug",
                  m.fromUs ? "rounded-br-md bg-[#F6E3D3] text-[#4A2A12]" : "rounded-bl-md bg-[#F4F1EC] text-[#1F1A16]",
                )}
              >
                <p className="whitespace-pre-line break-words">{m.text}</p>
                <p className="mt-0.5 text-[11px] text-neutral-500">
                  {m.fromUs ? "Roogo · " : ""}
                  {ouagaTime(m.at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {(item.post || item.listingReference) && (
        <div className="mt-3 flex min-w-0 items-center gap-2.5 rounded-2xl bg-[#FBF7F2] p-2">
          {item.post?.thumbnail ? (
            // Meta CDN images (signed, short-lived): a plain img, not next/image.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.post.thumbnail} alt="" loading="lazy" className="size-12 shrink-0 rounded-xl bg-[#F1EAE1] object-cover" />
          ) : item.post ? (
            <div className="size-12 shrink-0 rounded-xl bg-[#F1EAE1]" aria-hidden="true" />
          ) : null}
          <div className="min-w-0 flex-1">
            {item.post && <p className="line-clamp-2 break-words text-[13px] leading-snug text-neutral-700">Sur : {item.post.caption || "publication sans texte"}</p>}
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              {item.listingReference &&
                (item.propertyId ? (
                  <Link
                    href={`/admin/annonces/${item.propertyId}`}
                    className="inline-flex items-center gap-1 text-[12px] font-bold text-[#A8521D] hover:underline"
                  >
                    <HouseLineIcon size={13} weight="bold" />
                    {item.listingReference}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[12px] font-bold text-neutral-700">
                    <HouseLineIcon size={13} weight="bold" />
                    {item.listingReference}
                  </span>
                ))}
              {item.post?.permalink && (
                <a href={item.post.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#A8521D] hover:underline">
                  Voir la publication
                  <ArrowSquareOutIcon size={12} weight="bold" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Replies sent from Roogo (comments) */}
      {item.kind === "comment" && item.replies.length > 0 && (
        <ul className="mt-2.5 grid gap-1.5">
          {item.replies.map((r) => (
            <li
              key={r.id}
              className={cn(
                "rounded-2xl px-3 py-2 text-[13px] leading-snug",
                r.status === "sent" ? "bg-[#F6E3D3] text-[#4A2A12]" : "bg-[#FBE3DF] text-[#8E2A1E]",
              )}
            >
              <p className="break-words">
                <span className="font-semibold">{r.status === "sent" ? "Réponse de Roogo" : "Non envoyée"}</span> : {r.text}
              </p>
              <p className="mt-0.5 text-[11px] opacity-80">
                {r.staffName ?? "Équipe"} · {ouagaTime(r.sentAt)}
                {r.error ? ` · ${r.error}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* Who handled it */}
      {(item.status !== "a_repondre" || item.repliedAt) && (
        <p className="mt-2.5 text-[12px] text-neutral-600">
          {item.status === "ignore"
            ? `Ignoré${item.statusChangedByName ? ` par ${item.statusChangedByName}` : ""}${item.statusChangedAt ? ` le ${ouagaTime(item.statusChangedAt)}` : ""}`
            : item.repliedByName
              ? `Répondu par ${item.repliedByName}${item.repliedAt ? ` le ${ouagaTime(item.repliedAt)}` : ""}`
              : item.repliedExternally
                ? `Répondu directement sur ${INBOX_NETWORK_LABELS[item.network]}`
                : item.status === "repondu"
                  ? `Marqué comme répondu${item.statusChangedByName ? ` par ${item.statusChangedByName}` : ""}`
                  : lastReply
                    ? `Dernière réponse par ${lastReply.staffName ?? "l'équipe"} le ${ouagaTime(lastReply.sentAt)}`
                    : null}
        </p>
      )}

      {/* Reply */}
      {open ? (
        blocked ? (
          <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-[13px] text-amber-900 ring-1 ring-inset ring-amber-200">
            <p className="flex items-start gap-1.5 font-semibold">
              <ClockIcon size={16} weight="bold" className="mt-0.5 size-4 shrink-0" />
              <span>{blocked}</span>
            </p>
            {item.kind === "message" && item.lastUserMessageAt && (
              <p className="mt-1 pl-[22px] text-[12px]">Dernier message de la personne le {ouagaTime(item.lastUserMessageAt)}. Meta ne permet plus de répondre depuis Roogo.</p>
            )}
            <a
              href={networkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-[22px] mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-3.5 text-[13px] font-bold text-[#1F1A16] ring-1 ring-amber-300 hover:bg-amber-100"
            >
              Ouvrir la conversation
              <ArrowSquareOutIcon size={13} weight="bold" />
            </a>
          </div>
        ) : (
          <div className="mt-3 grid gap-2">
            <label className="sr-only" htmlFor={`reply-${item.id}`}>
              Réponse à {item.authorName}
            </label>
            <textarea
              id={`reply-${item.id}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              maxLength={MAX_REPLY_LENGTH}
              placeholder={item.kind === "comment" ? "Répondre au nom de Roogo" : "Message privé au nom de Roogo"}
              className="min-h-[72px] w-full resize-y rounded-2xl border-0 bg-[#FBF7F2] px-3.5 py-2.5 text-[15px] leading-snug text-[#1F1A16] ring-1 ring-inset ring-[rgba(74,52,36,0.12)] placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#C96A2E]"
            />
            <div className="flex flex-wrap items-center gap-2">
              {windowText && (
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-neutral-600">
                  <ClockIcon size={13} weight="bold" />
                  {windowText}
                </span>
              )}
              <button
                type="button"
                onClick={send}
                disabled={busy !== null || !draft.trim()}
                className="ml-auto inline-flex h-11 items-center gap-1.5 rounded-full bg-[#C96A2E] px-4 text-sm font-bold text-white transition-colors hover:bg-[#B85E26] disabled:opacity-50 md:h-10"
              >
                <PaperPlaneRightIcon size={15} weight="fill" />
                {busy === "send" ? "Envoi…" : "Envoyer"}
              </button>
            </div>
          </div>
        )
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[#FBF7F2] px-3.5 text-[13px] font-semibold text-[#1F1A16] ring-1 ring-inset ring-[rgba(74,52,36,0.12)] hover:bg-white"
        >
          <ArrowBendUpLeftIcon size={14} weight="bold" />
          Répondre
        </button>
      )}

      {error && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 rounded-2xl bg-[#FBE3DF] px-3 py-2 text-[13px] text-[#8E2A1E]">
          <WarningCircleIcon size={16} weight="bold" className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {/* Status actions */}
      <div className="mt-2.5 flex flex-wrap gap-x-1 gap-y-1 border-t border-[rgba(74,52,36,0.08)] pt-2">
        {item.status !== "repondu" && (
          <button type="button" disabled={busy !== null} onClick={() => act("mark_replied")} className={actionClass}>
            <CheckIcon size={14} weight="bold" />
            {busy === "mark_replied" ? "…" : "Marquer comme répondu"}
          </button>
        )}
        {item.status === "a_repondre" && (
          <button type="button" disabled={busy !== null} onClick={() => act("ignore")} className={actionClass}>
            <EyeSlashIcon size={14} weight="bold" />
            {busy === "ignore" ? "…" : "Ignorer"}
          </button>
        )}
        {item.status !== "a_repondre" && (
          <button type="button" disabled={busy !== null} onClick={() => act("reopen")} className={actionClass}>
            <ArrowBendUpLeftIcon size={14} weight="bold" />
            {busy === "reopen" ? "…" : "Remettre à répondre"}
          </button>
        )}
        {item.permalink && (
          <a href={item.permalink} target="_blank" rel="noopener noreferrer" className={cn(actionClass, "ml-auto")}>
            {item.kind === "comment" ? "Voir le commentaire" : "Ouvrir la conversation"}
            <ArrowSquareOutIcon size={13} weight="bold" />
          </a>
        )}
      </div>
    </li>
  );
}

const actionClass =
  "inline-flex min-h-10 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold text-neutral-700 hover:bg-[#FBF7F2] hover:text-[#1F1A16] disabled:opacity-50";
