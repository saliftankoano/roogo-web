import * as React from "react";

import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  /** A Phosphor icon, rendered at 40px in light neutral. */
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Primary call to action (a Button or a link). */
  action?: React.ReactNode;
  /** Compact removes the card chrome for use inside tables and panels. */
  compact?: boolean;
  className?: string;
}

/** "Nothing here yet" block: icon, one-line title, why, and what to do next. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 text-center",
        compact
          ? "py-8"
          : "rounded-[32px] border border-line-soft bg-white px-6 py-16",
        className,
      )}
    >
      {icon && (
        <span className="text-[#D6CBBE]" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="space-y-1">
        <p className="text-sm font-bold text-ink-body">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-ink-muted">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
