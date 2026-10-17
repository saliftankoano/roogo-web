"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CaretDownIcon, HouseLineIcon, PaperPlaneRightIcon, SparkleIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { splitStreaming } from "@/lib/studio/stream-split";
import { ArtifactCard, type CardProps } from "./ArtifactsPanel";
import { PropertyPicker } from "./PropertyPicker";
import { glassStrong, primaryGradient } from "./studio-ui";
import { useSmoothText } from "./useSmoothText";
import type { Artifact, ChatMessage, ConversationDetail, PropertySummary } from "./studio-types";

const QUICK_REPLIES = ["Rends-le plus court", "Rends-le plus chaleureux", "Ajoute le prix"];
const ease = [0.22, 1, 0.36, 1] as const;

type Entry =
  | { type: "message"; at: string; message: ChatMessage }
  | { type: "artifact"; at: string; artifact: Artifact; version: number | null; latestScript: boolean };

function clock(iso?: string) {
  return iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "";
}

/** Messages and results in the order they happened; scripts are numbered. */
function timeline(messages: ChatMessage[], artifacts: Artifact[]): Entry[] {
  const scripts = artifacts.filter((a) => a.kind === "script").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const latestId = scripts[scripts.length - 1]?.id;
  const far = "9999";
  return [
    ...messages
      .filter((m) => m.content.trim())
      .map((message): Entry => ({ type: "message", at: message.createdAt ?? far, message })),
    ...artifacts.map((artifact): Entry => ({
      type: "artifact",
      at: artifact.createdAt,
      artifact,
      version: artifact.kind === "script" ? scripts.findIndex((s) => s.id === artifact.id) + 1 : null,
      latestScript: artifact.id === latestId,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));
}

export function ChatView({
  detail,
  startedBy,
  startedAt,
  streamingText,
  sending,
  error,
  canWrite,
  highlightId,
  onSend,
  onPickProperty,
  card,
}: {
  detail: ConversationDetail | null;
  startedBy: string | null;
  startedAt: string | null;
  streamingText: string;
  sending: boolean;
  error: string | null;
  canWrite: boolean;
  highlightId: string | null;
  onSend: (text: string) => void;
  onPickProperty: (property: PropertySummary) => void;
  card: Omit<CardProps, "artifact">;
}) {
  const property = detail?.property ?? null;
  const entries = useMemo(
    () => timeline(detail?.messages ?? [], detail?.artifacts ?? []),
    [detail?.messages, detail?.artifacts],
  );
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const seen = useRef(entries.length);
  useEffect(() => {
    if (entries.length === seen.current && !streamingText) return;
    seen.current = entries.length;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [entries.length, streamingText]);

  const showPicker = canWrite && !property && !(detail?.artifacts.length);

  return (
    <div className="flex min-h-[calc(100dvh-14rem)] flex-col">
      <header className="flex flex-col items-center gap-1 border-b border-[rgba(74,52,36,0.10)] px-5 pb-5 pt-7 text-center">
        <span className="relative mb-1.5 size-[72px] overflow-hidden rounded-[22px] bg-[linear-gradient(145deg,#c9a58a,#7d5c45)] shadow-[0_14px_30px_-16px_rgba(90,50,26,0.8)]">
          {property?.image ? (
            <Image src={property.image} alt="" fill sizes="72px" unoptimized className="object-cover" />
          ) : (
            <HouseLineIcon size={28} weight="bold" className="absolute inset-0 m-auto text-white/80" />
          )}
        </span>
        <h1 className="text-balance text-xl font-bold tracking-tight text-neutral-900 md:text-[22px]">
          {property?.title ?? detail?.conversation.title ?? "Nouveau projet"}
        </h1>
        {property && (
          <p className="text-balance text-[15px] text-neutral-700">
            {property.place} · <span className="whitespace-nowrap tabular-nums">{property.price}</span>
          </p>
        )}
        {startedAt && (
          <p className="text-[13px] text-neutral-500">
            Commencé par {startedBy ?? "un membre de l'équipe"}, le{" "}
            {new Date(startedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        )}
      </header>

      {/* A fixed reading width: folding a side panel widens the margins, not the lines (Salif, 2026-10-10). */}
      <div className="mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-5 px-4 pb-2 pt-6 md:px-6">
        {showPicker && (
          <section className="mx-auto w-full max-w-xl space-y-3">
            <h2 className="text-center text-sm font-semibold text-neutral-600">
              Pour quel bien ? Le premier script s&apos;écrit dès que vous choisissez.
            </h2>
            <PropertyPicker disabled={sending} onPick={onPickProperty} />
          </section>
        )}

        <AnimatePresence initial={false}>
          {entries.map((entry) =>
            entry.type === "message" ? (
              <motion.div
                key={entry.message.id}
                layout="position"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.26, ease }}
              >
                <Message message={entry.message} />
              </motion.div>
            ) : (
              <motion.div
                key={entry.artifact.id}
                id={`artifact-${entry.artifact.id}`}
                layout="position"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease }}
                className={cn(
                  "scroll-mt-6 rounded-[24px] transition-shadow duration-300 md:ml-[50px]",
                  highlightId === entry.artifact.id && "shadow-[0_0_0_3px_rgba(201,106,46,0.35)]",
                )}
              >
                {entry.artifact.kind === "script" && !entry.latestScript ? (
                  <OldScript artifact={entry.artifact} version={entry.version ?? 1} card={card} />
                ) : (
                  <div className="space-y-1.5">
                    {entry.version && (
                      <span className="ml-1 inline-flex rounded-full bg-[#f3ebe2] px-2 py-0.5 text-[11px] font-bold text-neutral-700">
                        Script v{entry.version} · retenu
                      </span>
                    )}
                    <ArtifactCard artifact={entry.artifact} {...card} />
                  </div>
                )}
              </motion.div>
            ),
          )}
        </AnimatePresence>

        {sending && <LiveReply text={streamingText} />}

        {error && (
          <p className="text-sm font-semibold text-red-600 md:ml-[50px]" role="alert">
            {error}
          </p>
        )}
        <div ref={bottomRef} className="scroll-mb-48" />
      </div>

      <div className={cn("sticky bottom-3 z-10 mx-auto mb-3 mt-2 w-[calc(100%-1.5rem)] max-w-[656px] rounded-[24px] p-3", glassStrong)}>
        {canWrite ? (
          <Composer sending={sending} showQuickReplies={entries.length > 0} onSend={onSend} />
        ) : (
          <p className="p-1 text-center text-sm font-medium text-neutral-500">
            Projet d&apos;un collègue : lecture seule.
          </p>
        )}
      </div>
    </div>
  );
}

export function AssistantBadge() {
  return (
    <span className="flex size-[38px] shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(145deg,#d77a3c,#9c4a1b)] text-white shadow-[0_8px_18px_-10px_rgba(156,74,27,0.8)]">
      <SparkleIcon size={18} weight="fill" className="size-[18px] shrink-0" />
    </span>
  );
}

export function Message({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <p
        className={cn(
          "ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-[22px_22px_6px_22px] px-4 py-3 text-[15px] leading-relaxed md:max-w-[70%]",
          primaryGradient,
        )}
      >
        {message.content}
      </p>
    );
  }
  return (
    <div className="grid max-w-3xl grid-cols-[38px_minmax(0,1fr)] gap-3">
      <AssistantBadge />
      <div>
        <p className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-neutral-700">
          Assistant Roogo <span className="text-xs font-normal tabular-nums text-neutral-400">{clock(message.createdAt)}</span>
        </p>
        <p className="whitespace-pre-wrap text-base leading-relaxed text-neutral-900">{message.content}</p>
      </div>
    </div>
  );
}

/** The reply while it streams: prose in the bubble, the script in its own card. */
export function LiveReply({ text }: { text: string }) {
  const smooth = useSmoothText(text);
  const { prose, script, scriptDone } = splitStreaming(smooth);
  return (
    <div className="space-y-3" aria-live="polite">
      <div className="grid max-w-3xl grid-cols-[38px_minmax(0,1fr)] gap-3">
        <AssistantBadge />
        <div>
          <p className="mb-1 text-[13px] font-semibold text-neutral-700">Assistant Roogo</p>
          {prose ? (
            <p className="whitespace-pre-wrap text-base leading-relaxed text-neutral-900">{prose}</p>
          ) : (
            <span className="inline-flex gap-1 py-2" aria-label="L'assistant écrit">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.5 animate-pulse rounded-full bg-neutral-400 [animation-duration:1200ms]"
                  style={{ animationDelay: `${i * 140}ms` }}
                />
              ))}
            </span>
          )}
        </div>
      </div>
      {script !== null && (
        <motion.article
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease }}
          className="space-y-3 rounded-3xl border border-neutral-200 bg-white p-4 md:ml-[50px]"
        >
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-neutral-500">
            {scriptDone ? "Script prêt" : "Script en cours d'écriture"}
          </p>
          <p className="whitespace-pre-wrap rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-base leading-relaxed text-neutral-900">
            {script}
            {!scriptDone && <span className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-primary" />}
          </p>
        </motion.article>
      )}
    </div>
  );
}

export function OldScript({ artifact, version, card }: { artifact: Artifact; version: number; card: Omit<CardProps, "artifact"> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[20px] border border-white/80 bg-white/55">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span className="text-xs font-bold uppercase tracking-[0.08em] text-neutral-400">Script</span>
        <span className="rounded-full bg-[#f3ebe2] px-2 py-0.5 text-[11px] font-bold text-neutral-600">v{version}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-neutral-400">{artifact.text}</span>
        <span className="shrink-0 text-xs text-neutral-400">Version précédente</span>
        <CaretDownIcon size={14} weight="bold" className={cn("size-3.5 shrink-0 text-neutral-400 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease }}
            className="overflow-hidden px-2 pb-2"
          >
            <ArtifactCard artifact={artifact} {...card} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Composer({
  sending,
  showQuickReplies,
  onSend,
}: {
  sending: boolean;
  showQuickReplies: boolean;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const area = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  function submit() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    onSend(text);
  }

  return (
    <div className="space-y-2">
      {/* One row; swipes sideways on a phone instead of stacking (allowed exception). */}
      {showQuickReplies && !sending && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
          {QUICK_REPLIES.map((reply) => (
            <button
              key={reply}
              type="button"
              onClick={() => onSend(reply)}
              className="h-8 shrink-0 whitespace-nowrap rounded-full border border-[rgba(74,52,36,0.10)] bg-white/80 px-3 text-[13px] font-semibold text-neutral-700 transition-colors hover:bg-white"
            >
              {reply}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={area}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder="Demandez un script, une modification..."
          aria-label="Votre message"
          className="min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-base text-neutral-900 outline-none placeholder:text-neutral-400"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim() || sending}
          aria-label="Envoyer"
          className={cn("flex size-11 shrink-0 items-center justify-center rounded-full transition-[opacity,transform] active:scale-[0.985] disabled:opacity-40", primaryGradient)}
        >
          <PaperPlaneRightIcon size={20} weight="fill" className="size-5 shrink-0" />
        </button>
      </div>
    </div>
  );
}
