"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { TikTokMark } from "@/components/admin/TikTokMark";
import { YouTubeMark } from "@/components/admin/YouTubeMark";
import { NETWORK_LABELS, type Network } from "@/lib/studio/publishing";

/**
 * The networks' own colourful logos (Salif, 2026-10-13: real platform logos,
 * not monochrome glyphs; Facebook in the current #0866FF since 2026-10-21).
 * Drawn inline so they stay sharp at 14 to 20 px. The one shared set for the
 * Studio: reuse these, do not redraw a logo elsewhere.
 */
function FacebookLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#0866FF" />
      <path
        fill="#fff"
        d="M16.67 15.47 17.2 12h-3.33V9.75c0-.95.47-1.88 1.95-1.88h1.51V4.92s-1.37-.23-2.68-.23c-2.74 0-4.53 1.66-4.53 4.66V12H7.08v3.47h3.04V24a12.1 12.1 0 0 0 3.75 0v-8.53z"
      />
    </svg>
  );
}

function InstagramLogo({ size }: { size: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <radialGradient id={`ig-${id}`} cx="0.3" cy="1.07" r="1.3">
          <stop offset="0" stopColor="#FFDD55" />
          <stop offset="0.1" stopColor="#FFDD55" />
          <stop offset="0.5" stopColor="#FF543E" />
          <stop offset="1" stopColor="#C837AB" />
        </radialGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill={`url(#ig-${id})`} />
      <rect x="5.2" y="5.2" width="13.6" height="13.6" rx="4" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3.3" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="16.3" cy="7.7" r="1.05" fill="#fff" />
    </svg>
  );
}

/** Shared with the goal icons on Accueil (components/admin/TikTokMark.tsx), so both look the same. */
function TiktokLogo({ size }: { size: number }) {
  return <TikTokMark size={size} />;
}

/** Shared with the goal icons on Accueil (components/admin/YouTubeMark.tsx). */
function YoutubeLogo({ size }: { size: number }) {
  return <YouTubeMark size={size} />;
}

/** Messenger (Facebook private messages in Studio > Réseaux): the gradient bubble with the white lightning. */
function MessengerLogo({ size }: { size: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <radialGradient id={`ms-${id}`} cx="0.19" cy="0.99" r="1.09">
          <stop offset="0" stopColor="#0099FF" />
          <stop offset="0.61" stopColor="#A033FF" />
          <stop offset="0.93" stopColor="#FF5280" />
          <stop offset="1" stopColor="#FF7061" />
        </radialGradient>
      </defs>
      <path
        fill={`url(#ms-${id})`}
        d="M12 1C5.8 1 1 5.54 1 11.67c0 3.2 1.31 5.98 3.45 7.89.18.16.29.38.3.62l.06 1.95a.88.88 0 0 0 1.23.78l2.18-.96a.88.88 0 0 1 .59-.04c1 .27 2.07.42 3.19.42 6.2 0 11-4.54 11-10.66S18.2 1 12 1z"
      />
      <path
        fill="#fff"
        d="M5.4 14.79l3.23-5.13a1.65 1.65 0 0 1 2.39-.44l2.57 1.93a.66.66 0 0 0 .8 0l3.47-2.64c.46-.35 1.07.2.76.69l-3.23 5.13a1.65 1.65 0 0 1-2.39.44l-2.57-1.93a.66.66 0 0 0-.8 0l-3.47 2.64c-.46.35-1.07-.2-.76-.69z"
      />
    </svg>
  );
}

/** Messenger logo, for Facebook private messages. Same shell as NetworkIcon. */
export function MessengerIcon({ size = 14, className, label = true }: { size?: number; className?: string; label?: boolean }) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label ? "Messenger" : undefined}
      aria-hidden={label ? undefined : true}
      className={cn("inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <MessengerLogo size={size} />
    </span>
  );
}

const LOGOS = { facebook: FacebookLogo, instagram: InstagramLogo, tiktok: TiktokLogo, youtube: YoutubeLogo } as const;

/** Every network with a logo (YouTube is a publishing network since 2026-10-24). */
export type LogoNetwork = Network;
const LABELS: Record<LogoNetwork, string> = NETWORK_LABELS;

/** Any « Publier une vidéo » destination, YouTube Shorts included. */
export function DestinationIcon({ destination, size = 14, className }: { destination: LogoNetwork; size?: number; className?: string }) {
  return <NetworkIcon network={destination} size={size} className={className} label={false} />;
}

export function NetworkIcon({ network, size = 14, className, label = true }: { network: LogoNetwork; size?: number; className?: string; label?: boolean }) {
  const Logo = LOGOS[network];
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label ? LABELS[network] : undefined}
      aria-hidden={label ? undefined : true}
      className={cn("inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <Logo size={size} />
    </span>
  );
}

export function NetworkIcons({ networks, size = 14 }: { networks: LogoNetwork[]; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      {networks.map((n) => (
        <NetworkIcon key={n} network={n} size={size} />
      ))}
    </span>
  );
}
