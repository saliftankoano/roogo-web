"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { XIcon } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { roogoMotion } from "@/lib/motion";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  /** One line under the title. */
  description?: React.ReactNode;
  /** Buttons rendered in the footer, right-aligned on desktop. */
  actions?: React.ReactNode;
  /** Max width class, default max-w-md. */
  size?: "sm" | "md" | "lg";
  children?: React.ReactNode;
}

const sizes = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl" };

/**
 * Modal dialog matching the admin review modals: dimmed blurred backdrop,
 * white rounded card, Escape and backdrop click to close, focus moved inside.
 * On phones it docks to the bottom like a sheet.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  actions,
  size = "md",
  children,
}: DialogProps) {
  const reduceMotion = useReducedMotion();
  const titleId = React.useId();
  const descriptionId = React.useId();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      cancelAnimationFrame(frame);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={roogoMotion.standard}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            initial={
              reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.985 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.985 }
            }
            transition={roogoMotion.standard}
            className={cn(
              "relative z-10 flex w-full max-h-[90vh] flex-col rounded-t-3xl bg-white shadow-xl outline-none sm:rounded-2xl",
              sizes[size],
            )}
          >
            <div className="flex items-start gap-4 px-6 pt-6">
              <div className="min-w-0 flex-1">
                <h2
                  id={titleId}
                  className="text-lg font-black tracking-tight text-neutral-900"
                >
                  {title}
                </h2>
                {description && (
                  <p id={descriptionId} className="mt-1 text-sm text-neutral-500">
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer"
                className="-mr-2 -mt-2 rounded-full p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
              >
                <XIcon size={18} weight="bold" />
              </button>
            </div>
            {children && (
              <div className="min-h-0 overflow-y-auto px-6 py-4 text-sm text-neutral-700">
                {children}
              </div>
            )}
            {actions && (
              <div className="flex flex-col-reverse gap-2 border-t border-neutral-100 px-6 py-4 sm:flex-row sm:justify-end">
                {actions}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
