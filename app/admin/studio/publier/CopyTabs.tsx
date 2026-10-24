"use client";

import { useMemo } from "react";
import { ArrowsClockwiseIcon, CheckIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  DESTINATION_LABELS,
  copySummary,
  finalizeNetworkCopy,
  type CopyDraft,
  type CopyFacts,
  type CopyTarget,
  type Destination,
} from "@/lib/studio/publish-everywhere";
import { DestinationIcon } from "../calendrier/NetworkIcons";

/**
 * The texts of one video (PRD 3.4 to 3.6): one tab per ticked network, the
 * « Même texte partout » switch, « Régénérer » per network. Under each text,
 * what the code will add or fix (price, phone, roogobf.com, hashtags) and
 * what still blocks, computed live with the same rules as the server.
 */
export function CopyTabs({
  networks,
  facts,
  base,
  versions,
  sameText,
  tab,
  busy,
  onTab,
  onBase,
  onVersion,
  onSameText,
  onRegenerate,
}: {
  networks: Destination[];
  facts: CopyFacts;
  base: CopyDraft;
  versions: Partial<Record<Destination, CopyDraft>>;
  sameText: boolean;
  tab: Destination;
  busy: string | null;
  onTab: (n: Destination) => void;
  onBase: (d: CopyDraft) => void;
  onVersion: (n: Destination, d: CopyDraft) => void;
  onSameText: (on: boolean) => void;
  onRegenerate: (n: Destination) => void;
}) {
  const current = networks.includes(tab) ? tab : networks[0];
  const draft = sameText ? base : versions[current] ?? base;
  const target: CopyTarget = sameText ? "base" : current;

  return (
    <div className="grid gap-3">
      <label className="flex min-h-11 items-center justify-between gap-3 rounded-2xl bg-white px-3.5 py-2 ring-1 ring-[rgba(74,52,36,0.10)]">
        <span className="min-w-0">
          <span className="block text-[14px] font-bold text-[#1F1A16]">Même texte partout</span>
          <span className="block text-[12px] text-neutral-500">Le texte de base sur tous les réseaux cochés</span>
        </span>
        <Switch checked={sameText} onCheckedChange={onSameText} aria-label="Même texte partout" />
      </label>

      {!sameText && (
        <div role="tablist" aria-label="Texte par réseau" className="-mb-px flex gap-1 overflow-x-auto border-b border-[#E3D8CC] [scrollbar-width:none]">
          {networks.map((n) => {
            const active = n === current;
            return (
              <button
                key={n}
                type="button"
                role="tab"
                id={`copy-tab-${n}`}
                aria-selected={active}
                aria-controls="copy-panel"
                onClick={() => onTab(n)}
                className={cn(
                  "inline-flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-[14px] transition-colors",
                  active ? "border-[#C96A2E] font-extrabold text-[#A8521D]" : "border-transparent font-semibold text-neutral-600 hover:text-[#1F1A16]",
                )}
              >
                <DestinationIcon destination={n} size={16} />
                {DESTINATION_LABELS[n]}
              </button>
            );
          })}
        </div>
      )}

      <div id="copy-panel" role={sameText ? undefined : "tabpanel"} aria-labelledby={sameText ? undefined : `copy-tab-${current}`} className="grid gap-2">
        <Editor
          key={sameText ? "base" : current}
          target={target}
          label={sameText ? "Texte pour tous les réseaux" : `Texte ${DESTINATION_LABELS[current]}`}
          draft={draft}
          facts={facts}
          onChange={(d) => (sameText ? onBase(d) : onVersion(current, d))}
        />
        {!sameText && (
          <button
            type="button"
            onClick={() => onRegenerate(current)}
            disabled={busy !== null}
            className="inline-flex h-11 w-max items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold text-[#1F1A16] ring-1 ring-[rgba(74,52,36,0.15)] hover:bg-[#F6F1EA] disabled:opacity-50 md:h-9"
          >
            <ArrowsClockwiseIcon size={14} weight="bold" className={cn(busy === `regen-${current}` && "animate-spin")} />
            {busy === `regen-${current}` ? "Régénération…" : `Régénérer ${DESTINATION_LABELS[current]}`}
          </button>
        )}
      </div>
    </div>
  );
}

function Editor({
  target,
  label,
  draft,
  facts,
  onChange,
}: {
  target: CopyTarget;
  label: string;
  draft: CopyDraft;
  facts: CopyFacts;
  onChange: (d: CopyDraft) => void;
}) {
  const final = useMemo(() => finalizeNetworkCopy(target, draft, facts), [target, draft, facts]);
  const summary = copySummary(target, final.text, final.hashtags, facts);
  const errors = final.checks.filter((c) => c.level === "error");
  const warnings = final.checks.filter((c) => c.level === "warning");
  const tick = (ok: boolean | null, text: string) =>
    ok === null ? null : (
      <span className={cn("inline-flex items-center gap-1 text-[12px] font-semibold", ok ? "text-[#245C33]" : "text-[#8E2A1E]")}>
        {ok ? <CheckIcon size={12} weight="bold" /> : <XIcon size={12} weight="bold" />}
        {text}
      </span>
    );

  return (
    <div className="grid gap-2">
      <label className="sr-only" htmlFor={`copy-${target}`}>
        {label}
      </label>
      <textarea
        id={`copy-${target}`}
        value={draft.text}
        onChange={(e) => onChange({ ...draft, text: e.target.value })}
        rows={target === "tiktok" ? 6 : 10}
        className="w-full rounded-2xl border border-neutral-200 bg-white px-3.5 py-3 text-[15px] leading-relaxed text-[#1F1A16] outline-none focus:border-[#C96A2E]"
      />
      <input
        aria-label="Hashtags"
        value={draft.hashtags.join(" ")}
        onChange={(e) => onChange({ ...draft, hashtags: e.target.value.split(/[\s,]+/).filter(Boolean) })}
        placeholder="#Roogo #Ouagadougou"
        className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-[14px] text-[#A8521D] outline-none focus:border-[#C96A2E]"
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {tick(summary.contact, "Téléphones")}
        {tick(summary.site, "roogobf.com")}
        {tick(summary.price, "Prix de l'annonce")}
        {tick(summary.hashtags >= summary.hashtagsMin && summary.hashtags <= summary.hashtagsMax, `${summary.hashtags} hashtags (${summary.hashtagsMin} à ${summary.hashtagsMax})`)}
        <span className="ml-auto text-[11px] tabular-nums text-neutral-400">
          {summary.length} / {summary.maxChars.toLocaleString("fr-FR")}
        </span>
      </div>
      <p className="text-[12px] leading-snug text-neutral-500">
        Le prix, les téléphones et roogobf.com sont remis par Roogo à l&apos;envoi, même si vous les effacez.
        {final.fixes.length > 0 ? ` ${final.fixes.join(" ")}` : ""}
      </p>
      {errors.map((c) => (
        <p key={c.code} role="alert" className="flex items-start gap-1.5 text-[13px] font-semibold text-[#8E2A1E]">
          <WarningIcon size={14} weight="bold" className="mt-0.5 shrink-0" />
          {c.message}
        </p>
      ))}
      {warnings.map((c) => (
        <p key={c.code} className="flex items-start gap-1.5 text-[12px] text-[#6E4300]">
          <WarningIcon size={13} weight="bold" className="mt-0.5 shrink-0" />
          {c.message}
        </p>
      ))}
    </div>
  );
}
