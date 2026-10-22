"use client";

import { AnimatePresence, motion } from "framer-motion";
import { roogoMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

// A horizontal bar split between the parties of a sale, 2px gaps between
// segments. Segments glide to their new share when the price or a switch
// changes (Framer Motion, reduced motion honoured by AppMotionProvider).

export type SplitSegment = { key: string; value: number; color: string };

export function SaleSplitBar({
  segments,
  className,
  label,
}: {
  segments: SplitSegment[];
  className?: string;
  label: string;
}) {
  const visible = segments.filter((s) => s.value > 0);
  return (
    <div
      role="img"
      aria-label={label}
      className={cn("flex gap-[2px] overflow-hidden", className)}
    >
      <AnimatePresence initial={false}>
        {visible.map((s) => (
          <motion.span
            key={s.key}
            className="block h-full min-w-0"
            style={{ flexBasis: 0, backgroundColor: s.color }}
            initial={{ flexGrow: 0 }}
            animate={{ flexGrow: s.value }}
            exit={{ flexGrow: 0 }}
            transition={roogoMotion.deliberate}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
