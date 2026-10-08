import * as React from "react";

import { cn } from "@/lib/utils";

/** Listing statuses as stored in `properties.status`, plus the sale states. */
export type ListingStatus =
  | "en_ligne"
  | "en_attente"
  | "expired"
  | "locked"
  | "finalized";

export const LISTING_STATUS: Record<
  ListingStatus,
  { label: string; className: string; dot: string }
> = {
  en_ligne: {
    label: "En ligne",
    className: "bg-success-soft text-success-strong border-success/20",
    dot: "bg-success",
  },
  en_attente: {
    label: "En attente",
    className: "bg-warning-soft text-warning-strong border-warning/25",
    dot: "bg-warning",
  },
  expired: {
    label: "Expirée",
    className: "bg-neutral-100 text-neutral-600 border-neutral-200",
    dot: "bg-neutral-400",
  },
  locked: {
    label: "Réservée",
    className: "bg-secondary text-primary-hover border-primary/20",
    dot: "bg-primary",
  },
  finalized: {
    label: "Louée",
    className: "bg-neutral-900 text-white border-neutral-800",
    dot: "bg-white",
  },
};

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  status: ListingStatus;
  /** Show a coloured dot before the label. */
  dot?: boolean;
  /** Overrides the default French label. */
  label?: string;
}

/** The uppercase listing chip used on admin listing cards. */
export function StatusBadge({
  status,
  dot = true,
  label,
  className,
  ...props
}: StatusBadgeProps) {
  const config = LISTING_STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap",
        config.className,
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cn("h-1.5 w-1.5 rounded-full", config.dot)}
        />
      )}
      {label ?? config.label}
    </span>
  );
}
