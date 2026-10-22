"use client";

import { useEffect, useState } from "react";

const EVENT = "roogo-studio-approvals-changed";

/** Call after a post is sent, validated or sent back, so every badge refreshes. */
export function notifyApprovalsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

/**
 * Posts waiting for the founder's validation (the badge on Studio and on
 * Calendrier). Founder only: staff never fetch it. Refreshes on focus, every
 * minute, and whenever this tab changes a post.
 */
export function useStudioApprovals(enabled: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/studio/publications/waiting");
        if (!res.ok) return;
        const data = (await res.json()) as { count?: number };
        if (alive) setCount(typeof data.count === "number" ? data.count : 0);
      } catch {
        // The badge is a hint; the calendar stays the source of truth.
      }
    };
    void load();
    const id = window.setInterval(load, 60_000);
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
