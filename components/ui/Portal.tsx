"use client";

// Admin overlays (dialogs, sheets, drawers, lightboxes) render through this
// portal to document.body. The admin page content sits inside
// DashboardMotionFrame, whose `isolation: isolate` makes a stacking context at
// the level of the page: anything inside it, whatever its z-index, paints
// under the fixed AdminNavbar (z-50). Bug seen on Accueil 2026-10-21: the
// « Donner une tâche » header and close button were hidden behind the navbar.
//
// z-scale for anything portaled to body:
//   navbar 50 · dialogs, sheets and drawers 60 to 110 · toasts 120 · photo lightboxes 200

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const noopSubscribe = () => () => {};

/** False during SSR and hydration, true once mounted in the browser. */
export function useIsClient() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** Renders children into document.body (nothing on the server). */
export function Portal({ children }: { children: ReactNode }) {
  const isClient = useIsClient();
  if (!isClient) return null;
  return createPortal(children, document.body);
}

let lockCount = 0;
let overflowBeforeLock = "";

/** Stops the page behind an open modal from scrolling. Nested locks are counted. */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (lockCount === 0) {
      overflowBeforeLock = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    lockCount += 1;
    return () => {
      lockCount -= 1;
      if (lockCount === 0) document.body.style.overflow = overflowBeforeLock;
    };
  }, [active]);
}
