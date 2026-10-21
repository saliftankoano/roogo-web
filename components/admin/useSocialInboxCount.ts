"use client";

import { useEffect, useState } from "react";

const EVENT = "roogo-social-inbox-changed";

/** Call after a reply or a status change, so every « Réseaux » badge refreshes. */
export function notifySocialInboxChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

/**
 * Comments and messages « À répondre » (badge on the Studio menu item and on
 * the Réseaux tab). Only for levels with "social.inbox". Refreshes on focus,
 * every 2 minutes and whenever this tab answers something. Zero before
 * migration 101.
 */
export function useSocialInboxCount(enabled: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/social/inbox/count");
        if (!res.ok) return;
        const data = (await res.json()) as { total?: number };
        if (alive) setCount(typeof data.total === "number" ? data.total : 0);
      } catch {
        // The badge is a hint; Studio > Réseaux stays the source of truth.
      }
    };
    void load();
    const id = window.setInterval(load, 120_000);
    window.addEventListener(EVENT, load);
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener(EVENT, load);
      window.removeEventListener("focus", load);
    };
  }, [enabled]);
  return count;
}
