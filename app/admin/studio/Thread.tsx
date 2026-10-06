"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { HouseLineIcon, PaperPlaneRightIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { PropertyPicker } from "./PropertyPicker";
import type { ChatMessage, PropertySummary } from "./studio-types";

type Props = {
  property: PropertySummary | null;
  messages: ChatMessage[];
  streamingText: string;
  sending: boolean;
  error: string | null;
  canWrite: boolean;
  hasConversation: boolean;
  onSend: (text: string) => void;
  onPickProperty: (property: PropertySummary) => void;
};

const QUICK_REPLIES = [
  "Rends-le plus court",
  "Rends-le plus chaleureux",
  "Ajoute le prix",
];

export function Thread({
  property,
  messages,
  streamingText,
  sending,
  error,
  canWrite,
  hasConversation,
  onSend,
  onPickProperty,
}: Props) {
  const [draft, setDraft] = useState("");
  const [changing, setChanging] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, streamingText]);

  function submit() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    onSend(text);
  }

  const showPicker = !property || changing;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {property && !changing && (
        <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-2">
          <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
            {property.image ? (
              <Image src={property.image} alt="" fill sizes="48px" unoptimized className="object-cover" />
            ) : (
              <HouseLineIcon size={20} className="absolute inset-0 m-auto text-neutral-300" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-neutral-900">{property.title}</span>
            <span className="block truncate text-xs font-medium text-neutral-500">
              {property.place} · {property.price}
            </span>
          </span>
          {canWrite && (
            <button
              type="button"
              onClick={() => setChanging(true)}
              className="min-h-11 rounded-xl bg-neutral-100 px-3 text-xs font-bold text-neutral-700"
            >
              Changer
            </button>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {showPicker && canWrite && (
          <section className="space-y-2 rounded-3xl border border-neutral-200 bg-neutral-50 p-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500">
              {hasConversation ? "Choisir un bien" : "Pour quel bien ?"}
            </h2>
            <PropertyPicker
              disabled={sending}
              onPick={(picked) => {
                setChanging(false);
                onPickProperty(picked);
              }}
            />
            {changing && (
              <button
                type="button"
                onClick={() => setChanging(false)}
                className="min-h-11 text-sm font-bold text-neutral-500"
              >
                Annuler
              </button>
            )}
          </section>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
          >
            <p
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-[15px] leading-relaxed",
                message.role === "user"
                  ? "bg-primary text-white"
                  : "bg-neutral-100 text-neutral-900",
              )}
            >
              {message.content}
            </p>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <p className="max-w-[85%] whitespace-pre-wrap rounded-3xl bg-neutral-100 px-4 py-3 text-[15px] leading-relaxed text-neutral-900">
              {streamingText ? (
                streamingText.replace(/```script[\s\S]*$/i, "").trim() || (
                  <span className="text-neutral-500">J&apos;écris le script...</span>
                )
              ) : (
                <SpinnerGapIcon size={18} className="animate-spin text-neutral-400" />
              )}
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm font-bold text-red-600" role="alert">
            {error}
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {canWrite ? (
        <div className="space-y-2">
          {messages.length > 0 && !sending && (
            <div className="flex flex-wrap gap-2">
              {QUICK_REPLIES.map((reply) => (
                <button
                  key={reply}
                  type="button"
                  onClick={() => onSend(reply)}
                  className="min-h-11 rounded-full bg-neutral-100 px-4 text-sm font-bold text-neutral-700"
                >
                  {reply}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2 rounded-3xl border border-neutral-200 bg-white p-2 focus-within:border-primary">
            <textarea
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
              className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-base text-neutral-900 outline-none placeholder:text-neutral-400"
            />
            <button
              type="button"
              onClick={submit}
              disabled={!draft.trim() || sending}
              aria-label="Envoyer"
              className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-white disabled:opacity-40"
            >
              <PaperPlaneRightIcon size={20} weight="fill" />
            </button>
          </div>
        </div>
      ) : (
        <p className="rounded-2xl bg-neutral-100 p-3 text-center text-sm font-medium text-neutral-500">
          Vous consultez la conversation d&apos;un collègue en lecture seule.
        </p>
      )}
    </div>
  );
}
