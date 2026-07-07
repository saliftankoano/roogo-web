"use client";

import { useMemo } from "react";
import { buildKuulaRenderUrl } from "@/lib/virtual-tour";

// Kuula's embed.js (used by KuulaEmbed for per-property tours) does not render
// /share/collection/... URLs — collections must be embedded as a plain iframe.
export function KuulaCollectionFrame({
  shareUrl,
  title,
  className = "",
}: {
  shareUrl: string;
  title: string;
  className?: string;
}) {
  const src = useMemo(() => buildKuulaRenderUrl(shareUrl), [shareUrl]);

  return (
    <div
      className={`relative h-[420px] overflow-hidden rounded-[28px] border border-neutral-200 bg-neutral-950/5 md:h-[640px] ${className}`}
    >
      <iframe
        src={src}
        title={title}
        className="absolute inset-0 h-full w-full"
        allow="fullscreen; accelerometer; gyroscope; magnetometer; vr; xr-spatial-tracking"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}
