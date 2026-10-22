"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { CheckIcon, WarningIcon } from "@phosphor-icons/react";
import { motionOn } from "./motion";

export type ToastMessage = { id: number; text: string; tone?: "ok" | "warn" };

/** The dark pill at the top (design steps 6 and 10). Slides in, stays 4 s, slides out. */
export function Toast({ toast, onDone }: { toast: ToastMessage | null; onDone: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  useEffect(() => {
    if (!toast) return;
    const el = ref.current;
    const animate = motionOn();
    if (el && animate) gsap.fromTo(el, { y: -12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power3.out" });
    const id = window.setTimeout(() => {
      if (el && animate) gsap.to(el, { y: -8, opacity: 0, duration: 0.25, ease: "power2.in", onComplete: onDone });
      else onDone();
    }, 4000);
    return () => window.clearTimeout(id);
  }, [toast, onDone]);

  if (!ready) return null;
  return createPortal(
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 top-[5.5rem] z-[120] flex justify-center px-4">
      {toast && (
        <div
          ref={ref}
          key={toast.id}
          className="pointer-events-auto flex max-w-[min(100%,28rem)] items-center gap-2.5 rounded-2xl bg-[#1F1A16] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-18px_rgba(31,26,22,0.8)]"
        >
          <span className={toast.tone === "warn" ? "flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-500" : "flex size-6 shrink-0 items-center justify-center rounded-full bg-[#2F7A48]"}>
            {toast.tone === "warn" ? <WarningIcon size={14} weight="bold" /> : <CheckIcon size={14} weight="bold" />}
          </span>
          <span className="min-w-0">{toast.text}</span>
        </div>
      )}
    </div>,
    document.body,
  );
}
