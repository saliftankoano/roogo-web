"use client";

import { InfoIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { TIKTOK_PENDING_TOOLTIP } from "@/lib/studio/publishing";
import { TIKTOK_PRIVATE_NOTE, type TikTokPublishInfo } from "@/lib/social/tiktok-publish";
import { NetworkIcon } from "../calendrier/NetworkIcons";

/**
 * The TikTok button next to Facebook and Instagram in the publication flow.
 * Feature flag (2026-10-21): a real toggle only when the server says TikTok
 * can publish (key set, account connected with a publishing scope, video).
 * Otherwise the dashed « Bientôt » chip with the reason as a tooltip.
 */
export function TikTokChoice({
  info,
  on,
  onToggle,
  disabled,
  videoOnly = true,
  isVideo = true,
  className,
  iconSize = 18,
}: {
  info: TikTokPublishInfo | null | undefined;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
  videoOnly?: boolean;
  isVideo?: boolean;
  className?: string;
  iconSize?: number;
}) {
  const usable = Boolean(info?.enabled) && (!videoOnly || isVideo);
  if (!usable) {
    const reason = info?.enabled && !isVideo ? "TikTok ne publie que des vidéos depuis Roogo." : info?.reason ?? TIKTOK_PENDING_TOOLTIP;
    return (
      <span
        title={reason}
        aria-disabled="true"
        className={cn(
          "inline-flex min-w-0 cursor-help items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[rgba(74,52,36,0.18)] px-2.5 text-[13px] font-semibold text-neutral-400 sm:text-sm",
          className,
        )}
      >
        <NetworkIcon network="tiktok" size={iconSize} label={false} className="opacity-50 grayscale" />
        <span className="truncate">Bientôt</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "inline-flex min-w-0 items-center justify-center gap-1.5 rounded-2xl px-1.5 text-[13px] font-semibold transition-colors sm:text-sm",
        on ? "bg-white text-[#1F1A16] ring-2 ring-[#C96A2E]" : "bg-white/60 text-neutral-500 ring-1 ring-[rgba(74,52,36,0.12)]",
        className,
      )}
    >
      <NetworkIcon network="tiktok" size={iconSize} label={false} />
      <span className="truncate">TikTok</span>
    </button>
  );
}

/** « TikTok : publication privée tant que l'application n'est pas validée par TikTok ». */
export function TikTokNote({ info, className }: { info: TikTokPublishInfo | null | undefined; className?: string }) {
  return (
    <p className={cn("flex items-start gap-1.5 text-[12px] leading-snug text-neutral-600", className)}>
      <InfoIcon size={14} weight="bold" className="mt-px size-3.5 shrink-0 text-neutral-500" />
      <span>
        {info?.note ?? TIKTOK_PRIVATE_NOTE}.{info && !info.enabled && info.reason ? ` ${info.reason}` : ""}
      </span>
    </p>
  );
}
