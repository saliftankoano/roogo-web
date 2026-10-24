"use client";

import { InfoIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { YOUTUBE_PRIVATE_NOTE, type YouTubePublishInfo } from "@/lib/social/youtube-upload";

/** « YouTube : publication privée tant que l'application n'est pas validée par YouTube » (until YOUTUBE_PUBLIC_UPLOADS). */
export function YouTubeNote({ info, className }: { info: YouTubePublishInfo | null | undefined; className?: string }) {
  return (
    <p className={cn("flex items-start gap-1.5 text-[12px] leading-snug text-neutral-600", className)}>
      <InfoIcon size={14} weight="bold" className="mt-px size-3.5 shrink-0 text-neutral-500" />
      <span>
        {info?.note ?? YOUTUBE_PRIVATE_NOTE}.{info && !info.enabled && info.reason ? ` ${info.reason}` : ""}
      </span>
    </p>
  );
}
