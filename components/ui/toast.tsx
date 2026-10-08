"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircleIcon,
  InfoIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { roogoMotion } from "@/lib/motion";

export type ToastTone = "success" | "info" | "danger";

export interface ToastProps {
  open: boolean;
  tone?: ToastTone;
  children: React.ReactNode;
  /** Fixed at the bottom of the viewport (the admin default) or inline. */
  position?: "fixed" | "inline";
  className?: string;
}

const toneIcon: Record<ToastTone, React.ReactNode> = {
  success: (
    <CheckCircleIcon size={16} weight="fill" className="text-success" />
  ),
  info: <InfoIcon size={16} weight="fill" className="text-info" />,
  danger: (
    <WarningCircleIcon size={16} weight="fill" className="text-danger" />
  ),
};

/**
 * Dark confirmation pill used after copy, save and send actions. The caller
 * owns the timer: set `open` to false after about 2 seconds.
 */
export function Toast({
  open,
  tone = "success",
  children,
  position = "fixed",
  className,
}: ToastProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={roogoMotion.standard}
          className={cn(
            "flex items-center gap-2.5 rounded-2xl bg-neutral-900 px-5 py-3 text-sm font-bold text-white shadow-2xl",
            position === "fixed" &&
              "pointer-events-none fixed bottom-8 left-1/2 z-[200] -translate-x-1/2",
            className,
          )}
        >
          <span className="shrink-0 [&_svg]:brightness-150" aria-hidden="true">
            {toneIcon[tone]}
          </span>
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Small helper: returns [open, show] where show() opens the toast for `ms`. */
export function useToast(ms = 2200): [boolean, () => void] {
  const [open, setOpen] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = React.useCallback(() => {
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), ms);
  }, [ms]);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return [open, show];
}
