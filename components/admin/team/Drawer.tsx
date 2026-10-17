"use client";

// Side panel on desktop, full screen on the phone (approved canvas: evidence
// drawer, « Notes de l’appel »). Escape closes, focus stays inside, the page
// behind does not scroll. Motion follows the shared grammar (short, small,
// skipped with reduced motion).

import gsap from "gsap";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { urbanist } from "./font";
import { prefersReducedMotion } from "./ui";

export function Drawer({
  open,
  onClose,
  label,
  header,
  footer,
  children,
  width = 460,
  z = 70,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  header: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  width?: number;
  z?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    if (panel && !prefersReducedMotion()) {
      const wide = window.matchMedia("(min-width: 1024px)").matches;
      gsap.fromTo(
        panel,
        wide ? { x: 16, autoAlpha: 0 } : { y: 12, autoAlpha: 0 },
        { x: 0, y: 0, autoAlpha: 1, duration: 0.32, ease: "power3.out", clearProps: "transform,opacity,visibility" },
      );
      const rows = panel.querySelectorAll("[data-drawer-row]");
      if (rows.length) {
        gsap.fromTo(rows, { y: 8, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.3, ease: "power3.out", stagger: 0.04, delay: 0.08, clearProps: "transform,opacity,visibility" });
      }
    }
    const frame = requestAnimationFrame(() => panel?.querySelector<HTMLElement>("[data-autofocus]")?.focus() ?? panel?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key === "Tab" && panel) {
        const focusables = panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => returnFocus.current?.focus());
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className={cn(urbanist.className, "fixed inset-0")} style={{ zIndex: z }}>
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-[#1F1A16]/30" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-describedby={titleId}
        tabIndex={-1}
        style={{ ["--drawer-w" as string]: `${width}px` }}
        className="absolute inset-0 flex flex-col bg-white text-[#1F1A16] outline-none lg:left-auto lg:w-[min(var(--drawer-w),100%)] lg:shadow-[-20px_0_40px_-20px_rgba(31,26,22,0.5)]"
      >
        <div id={titleId} className="flex-none border-b border-[#F0E8DD] px-4 pb-4 pt-4 lg:px-5 lg:pt-5">
          {header}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <div className="flex-none border-t border-[#F0E8DD] px-4 pb-5 pt-3.5 lg:px-5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Fermer"
      className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#F4EEE6] text-[#1F1A16] hover:bg-[#EDE4D8] lg:size-10"
    >
      <XIcon size={18} weight="bold" aria-hidden="true" />
    </button>
  );
}
