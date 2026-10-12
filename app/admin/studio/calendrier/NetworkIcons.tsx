"use client";

import { FacebookLogoIcon, InstagramLogoIcon, TiktokLogoIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { NETWORK_LABELS, type Network } from "@/lib/studio/publishing";

const ICONS = { facebook: FacebookLogoIcon, instagram: InstagramLogoIcon, tiktok: TiktokLogoIcon } as const;
const TONES: Record<Network, string> = {
  facebook: "text-[#1877f2]",
  instagram: "text-[#c13584]",
  tiktok: "text-neutral-900",
};

export function NetworkIcon({ network, size = 14, className }: { network: Network; size?: number; className?: string }) {
  const Icon = ICONS[network];
  return <Icon size={size} weight="fill" aria-label={NETWORK_LABELS[network]} className={cn("shrink-0", TONES[network], className)} />;
}

export function NetworkIcons({ networks, size = 14 }: { networks: Network[]; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      {networks.map((n) => (
        <NetworkIcon key={n} network={n} size={size} />
      ))}
    </span>
  );
}
