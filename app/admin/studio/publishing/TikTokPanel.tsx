"use client";

import { useEffect, useState } from "react";
import { InfoIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  BRANDED_CONTENT_URL,
  COPY,
  MUSIC_USAGE_URL,
  PRIVACY_LABELS,
  choiceProblems,
  commercialLabel,
  type CreatorInfo,
  type PrivacyLevel,
  type TikTokChoices,
} from "@/lib/social/tiktok-post-settings";
import { NetworkIcon } from "../calendrier/NetworkIcons";

export type TikTokPanelState =
  | { kind: "loading" }
  | { kind: "off" }
  | { kind: "error"; message: string }
  | { kind: "ready"; creator: CreatorInfo; demo: boolean };

/** Reads the account's creator info fresh each time a post is shown (never cached). */
export function useTikTokPanel(postId: string | null, active: boolean): TikTokPanelState {
  const [state, setState] = useState<TikTokPanelState>({ kind: "loading" });
  useEffect(() => {
    if (!postId || !active) {
      setState({ kind: "off" });
      return;
    }
    let live = true;
    setState({ kind: "loading" });
    fetch("/api/admin/studio/tiktok/creator-info", { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as
          | { required?: boolean; ok?: boolean; creator?: CreatorInfo; error?: string; demo?: boolean }
          | null;
        if (!live) return;
        if (!res.ok) return setState({ kind: "error", message: body?.error ?? "Les informations TikTok n'ont pas pu être lues." });
        if (!body?.required) return setState({ kind: "off" });
        if (!body.ok || !body.creator) return setState({ kind: "error", message: body.error ?? COPY.cannotPost });
        setState({ kind: "ready", creator: body.creator, demo: Boolean(body.demo) });
      })
      .catch(() => live && setState({ kind: "error", message: "TikTok ne répond pas. Réessayez." }));
    return () => {
      live = false;
    };
  }, [postId, active]);
  return state;
}

/** What blocks « Valider » because of TikTok, empty when nothing does. */
export function tiktokBlockers(state: TikTokPanelState, choices: TikTokChoices, durationSec: number | null): string[] {
  if (state.kind === "off") return [];
  if (state.kind === "loading") return ["Lecture du compte TikTok…"];
  if (state.kind === "error") return [state.message];
  return choiceProblems(choices, state.creator, durationSec);
}

function Switch({
  label,
  on,
  disabled,
  hint,
  onChange,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  hint?: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="grid gap-0.5">
      <label className={cn("flex min-h-11 items-center justify-between gap-3", disabled ? "cursor-not-allowed text-neutral-400" : "cursor-pointer text-[#1F1A16]")}>
        <span className="text-[14px] font-semibold">{label}</span>
        <input
          type="checkbox"
          role="switch"
          aria-checked={on}
          checked={on}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={cn(
            "relative h-7 w-12 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[#C96A2E] peer-focus-visible:ring-offset-2",
            on ? "bg-[#C96A2E]" : "bg-neutral-300",
            disabled && "opacity-50",
          )}
        >
          <span className={cn("absolute top-1 size-5 rounded-full bg-white shadow transition-transform", on ? "translate-x-6" : "translate-x-1")} />
        </span>
      </label>
      {hint && <span className="text-[12px] leading-snug text-neutral-500">{hint}</span>}
    </div>
  );
}

function Check({
  label,
  on,
  disabled,
  hint,
  onChange,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  hint?: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="grid gap-0.5">
      <label className={cn("flex min-h-11 items-center gap-2.5", disabled ? "cursor-not-allowed text-neutral-400" : "cursor-pointer text-[#1F1A16]")}>
        <input
          type="checkbox"
          checked={on}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="size-5 shrink-0 accent-[#C96A2E]"
        />
        <span className="text-[14px] font-semibold">{label}</span>
      </label>
      {hint && <span className="pl-7.5 text-[12px] leading-snug text-neutral-500">{hint}</span>}
    </div>
  );
}

/**
 * The TikTok panel of the approval screen (PRD « TikTok posting screen for the
 * audit »): the account that will post, who can see the video (no default),
 * comments, duets and stitches (off by default), the commercial content
 * disclosure, and the processing notice. TikTok's declaration sits above the
 * « Valider » button (TikTokDeclaration).
 */
export function TikTokPanel({
  state,
  choices,
  onChange,
  durationSec,
  disabled,
}: {
  state: TikTokPanelState;
  choices: TikTokChoices;
  onChange: (next: TikTokChoices) => void;
  durationSec: number | null;
  disabled?: boolean;
}) {
  if (state.kind === "off") return null;
  const set = (patch: Partial<TikTokChoices>) => onChange({ ...choices, ...patch });

  return (
    <section aria-labelledby="tiktok-panel-title" className="grid gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-[rgba(74,52,36,0.10)]">
      <div className="flex items-center gap-2.5">
        {state.kind === "ready" && state.creator.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={state.creator.avatarUrl} alt="" className="size-9 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#F6F1EA]">
            <NetworkIcon network="tiktok" size={18} label={false} />
          </span>
        )}
        <div className="min-w-0">
          <h4 id="tiktok-panel-title" className="text-[13px] font-bold text-[#1F1A16]">
            Publication TikTok
          </h4>
          <p className="truncate text-[13px] text-neutral-600">
            {state.kind === "ready"
              ? `Publiée par ${state.creator.nickname}${state.creator.username ? ` (@${state.creator.username})` : ""}`
              : state.kind === "loading"
                ? "Lecture du compte TikTok…"
                : "Compte TikTok indisponible"}
          </p>
        </div>
      </div>

      {state.kind === "error" && (
        <p role="alert" className="flex items-start gap-1.5 text-[13px] font-semibold text-red-700">
          <WarningCircleIcon size={16} weight="bold" className="mt-px shrink-0" />
          <span>{state.message} Vous pouvez retirer TikTok et valider les autres réseaux.</span>
        </p>
      )}

      {state.kind === "ready" && (
        <TikTokChoicesFields creator={state.creator} choices={choices} set={set} durationSec={durationSec} disabled={disabled} />
      )}

      <p className="flex items-start gap-1.5 text-[12px] leading-snug text-neutral-600">
        <InfoIcon size={14} weight="bold" className="mt-px size-3.5 shrink-0 text-neutral-500" />
        <span>{COPY.processing}</span>
      </p>
    </section>
  );
}

function TikTokChoicesFields({
  creator,
  choices,
  set,
  durationSec,
  disabled,
}: {
  creator: CreatorInfo;
  choices: TikTokChoices;
  set: (patch: Partial<TikTokChoices>) => void;
  durationSec: number | null;
  disabled?: boolean;
}) {
  const tooLong = creator.maxVideoPostDurationSec != null && durationSec != null && durationSec > creator.maxVideoPostDurationSec;
  const branded = choices.commercial && choices.brandedContent;
  const label = commercialLabel(choices);
  return (
    <>
      {tooLong && (
        <p role="alert" className="text-[13px] font-semibold text-red-700">
          La vidéo dure {Math.ceil(durationSec!)} s : ce compte TikTok accepte {creator.maxVideoPostDurationSec} s au plus.
        </p>
      )}

      <div className="grid gap-1">
        <label htmlFor="tiktok-privacy" className="text-[13px] font-bold text-[#1F1A16]">
          Qui peut voir cette vidéo
        </label>
        <select
          id="tiktok-privacy"
          value={choices.privacyLevel ?? ""}
          disabled={disabled}
          onChange={(e) => set({ privacyLevel: (e.target.value || null) as PrivacyLevel | null })}
          className={cn(
            "h-11 w-full rounded-xl border bg-white px-3 text-[15px] outline-none focus:border-[#C96A2E]",
            choices.privacyLevel ? "border-neutral-200 text-[#1F1A16]" : "border-[#C96A2E] text-neutral-500",
          )}
        >
          <option value="" disabled>
            Choisir…
          </option>
          {creator.privacyLevelOptions.map((level) => (
            <option key={level} value={level} disabled={level === "SELF_ONLY" && branded}>
              {PRIVACY_LABELS[level]}
            </option>
          ))}
        </select>
        {branded && creator.privacyLevelOptions.includes("SELF_ONLY") && (
          <span className="text-[12px] leading-snug text-neutral-500">« Moi seulement » : {COPY.brandedNotPrivate}</span>
        )}
      </div>

      <div className="grid gap-0.5 pt-1">
        <span className="text-[13px] font-bold text-[#1F1A16]">Interactions</span>
        <Switch
          label="Autoriser les commentaires"
          on={choices.allowComment}
          disabled={disabled || creator.commentDisabled}
          hint={creator.commentDisabled ? "Désactivé dans les réglages de ce compte TikTok." : undefined}
          onChange={(on) => set({ allowComment: on })}
        />
        <Switch
          label="Autoriser les duos"
          on={choices.allowDuet}
          disabled={disabled || creator.duetDisabled}
          hint={creator.duetDisabled ? "Désactivé dans les réglages de ce compte TikTok." : undefined}
          onChange={(on) => set({ allowDuet: on })}
        />
        <Switch
          label="Autoriser les collages"
          on={choices.allowStitch}
          disabled={disabled || creator.stitchDisabled}
          hint={creator.stitchDisabled ? "Désactivé dans les réglages de ce compte TikTok." : undefined}
          onChange={(on) => set({ allowStitch: on })}
        />
      </div>

      <div className="grid gap-1 pt-1">
        <span className="text-[13px] font-bold text-[#1F1A16]">Déclaration</span>
        <Switch
          label="Contenu commercial"
          on={choices.commercial}
          disabled={disabled}
          hint="Indiquez si la vidéo fait la promotion d'un bien, d'un service ou d'une marque."
          onChange={(on) => set(on ? { commercial: true } : { commercial: false, yourBrand: false, brandedContent: false })}
        />
        {choices.commercial && (
          <div className="grid gap-0.5 pl-1">
            <Check
              label="Votre marque"
              on={choices.yourBrand}
              disabled={disabled}
              hint="Vous faites la promotion de Roogo ou de vos propres services."
              onChange={(on) => set({ yourBrand: on })}
            />
            <Check
              label="Contenu de marque"
              on={choices.brandedContent}
              disabled={disabled || choices.privacyLevel === "SELF_ONLY"}
              hint={
                choices.privacyLevel === "SELF_ONLY"
                  ? COPY.brandedNotPrivate
                  : "Vous faites la promotion d'un tiers, par exemple un propriétaire ou un partenaire."
              }
              onChange={(on) => set({ brandedContent: on })}
            />
            {!choices.yourBrand && !choices.brandedContent ? (
              <p className="text-[12px] font-semibold leading-snug text-[#A8521D]">{COPY.pickCommercial}</p>
            ) : (
              label && <p className="text-[12px] font-semibold leading-snug text-[#1F1A16]">{label}</p>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/** TikTok's declaration, right above « Valider » (Music Usage Confirmation, plus the Branded Content Policy for branded content). */
export function TikTokDeclaration({ choices }: { choices: TikTokChoices }) {
  const link = "font-semibold text-[#A8521D] underline underline-offset-2";
  return (
    <p className="mb-2 text-[12px] leading-snug text-neutral-600">
      En publiant, vous acceptez{" "}
      {choices.commercial && choices.brandedContent && (
        <>
          la{" "}
          <a href={BRANDED_CONTENT_URL} target="_blank" rel="noreferrer" className={link}>
            Branded Content Policy
          </a>{" "}
          et{" "}
        </>
      )}
      la{" "}
      <a href={MUSIC_USAGE_URL} target="_blank" rel="noreferrer" className={link}>
        Music Usage Confirmation
      </a>{" "}
      de TikTok.
    </p>
  );
}
