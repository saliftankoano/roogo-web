import { cn } from "@/lib/utils";
import { waitingBadgeLabel } from "@/lib/social/inbox";

/**
 * Comments and messages waiting for a reply (Studio > Réseaux): terracotta,
 * distinct from the amber « à valider » badge. Red (the team board's danger
 * token) as soon as one is past the 24 business hours deadline; the label then
 * says « dont N en retard ».
 */
export function InboxBadge({ count, overdue = 0, className }: { count: number; overdue?: number; className?: string }) {
  if (count <= 0) return null;
  const label = waitingBadgeLabel(count, overdue);
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-none text-white",
        overdue > 0 ? "bg-[#8E2A1E]" : "bg-[#C96A2E]",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
