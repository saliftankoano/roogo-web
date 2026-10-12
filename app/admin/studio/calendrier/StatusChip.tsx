"use client";

import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/lib/studio/publishing";
import { STATUS_TONE, type Post } from "./calendar-types";

export function StatusChip({ status, publishing }: { status: Post["status"]; publishing?: boolean }) {
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[11px] font-semibold ring-1 ring-inset", STATUS_TONE[status])}>
      {publishing ? "Publication…" : STATUS_LABELS[status]}
    </span>
  );
}
