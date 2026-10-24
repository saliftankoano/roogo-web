"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { DESTINATION_LABELS, copyPostText, type Destination } from "@/lib/studio/publish-everywhere";
import type { Network } from "@/lib/studio/publishing";
import { DestinationIcon } from "../calendrier/NetworkIcons";
import type { Post } from "../calendrier/calendar-types";

/**
 * Salif's approval screen for « Publier une vidéo » (PRD 3.5): each
 * network's text next to the video, exactly as it will go out, one tab per
 * network; « Modifier » edits the open tab (the server applies the house
 * rules and the listing's facts again on save).
 */
export function NetworkTexts({
  post,
  busy,
  onSave,
}: {
  post: Post;
  busy: boolean;
  onSave: (network: Network, text: string, hashtags: string[]) => Promise<boolean>;
}) {
  const networks = post.networks;
  const [tab, setTab] = useState<Network>(networks[0] ?? "facebook");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [tags, setTags] = useState("");
  const current = networks.includes(tab) ? tab : networks[0];
  const copy = post.networkCopy ?? {};
  const entry = (current ? copy[current as Destination] : undefined) ?? { text: post.caption, hashtags: post.hashtags };
  const out = copyPostText(entry.text, entry.hashtags);

  return (
    <section aria-labelledby="preview-texts" className="grid gap-2 rounded-2xl bg-white p-3.5 ring-1 ring-[rgba(74,52,36,0.10)]">
      <div className="flex items-center justify-between gap-2">
        <h4 id="preview-texts" className="text-[13px] font-bold text-[#1F1A16]">
          {post.sameText ? "Même texte partout" : "Texte par réseau"}
        </h4>
        {!editing && current && (
          <button
            type="button"
            onClick={() => {
              setDraft(entry.text);
              setTags(entry.hashtags.join(" "));
              setEditing(true);
            }}
            className="h-11 rounded-full px-3.5 text-[13px] font-bold text-[#1F1A16] ring-1 ring-[rgba(74,52,36,0.15)] hover:bg-[#F6F1EA] md:h-8"
          >
            Modifier
          </button>
        )}
      </div>
      {networks.length > 1 && (
        <div role="tablist" aria-label="Texte par réseau" className="-mx-1 flex gap-1 overflow-x-auto border-b border-[#EFE7DD] px-1 [scrollbar-width:none]">
          {networks.map((n) => (
            <button
              key={n}
              type="button"
              role="tab"
              aria-selected={n === current}
              onClick={() => {
                setTab(n);
                setEditing(false);
              }}
              className={cn(
                "inline-flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-2 text-[13px] md:h-9",
                n === current ? "border-[#C96A2E] font-extrabold text-[#A8521D]" : "border-transparent font-semibold text-neutral-600",
              )}
            >
              <DestinationIcon destination={n} size={14} />
              {DESTINATION_LABELS[n]}
            </button>
          ))}
        </div>
      )}
      {editing && current ? (
        <div className="grid gap-2">
          <textarea
            aria-label={`Texte ${DESTINATION_LABELS[current]}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={9}
            className="w-full rounded-xl border-2 border-[#C96A2E] px-3 py-2.5 text-[14px] leading-relaxed outline-none"
          />
          <input
            aria-label="Hashtags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="h-11 w-full rounded-xl border border-neutral-200 px-3 text-[14px] text-[#A8521D] outline-none focus:border-[#C96A2E]"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditing(false)} className="h-11 flex-1 rounded-full text-sm font-bold text-neutral-600 ring-1 ring-[rgba(74,52,36,0.15)]">
              Annuler
            </button>
            <button
              type="button"
              disabled={!draft.trim() || busy}
              onClick={async () => {
                const ok = await onSave(current, draft, tags.split(/[\s,]+/).filter(Boolean));
                if (ok) setEditing(false);
              }}
              className="h-11 flex-1 rounded-full bg-[#1F1A16] text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      ) : (
        <div role={networks.length > 1 ? "tabpanel" : undefined} className="whitespace-pre-line break-words text-[14px] leading-relaxed text-[#1F1A16]">
          {out}
        </div>
      )}
      <span className="text-right text-[11px] tabular-nums text-neutral-400">{out.length} caractères</span>
    </section>
  );
}
