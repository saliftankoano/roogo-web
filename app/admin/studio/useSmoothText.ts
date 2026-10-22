"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reveals streamed text at a steady pace instead of in bursts: providers send
 * uneven chunks, and pasting each chunk as it lands reads as jumps. Each frame
 * catches up a fraction of the lag, so it stays smooth and never falls more
 * than a few frames behind. Reduced motion and hidden tabs show the text as it arrives.
 */
export function useSmoothText(target: string): string {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  const frame = useRef(0);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // A hidden tab runs no animation frames: show the text as it arrives so
    // it is complete, not frozen, when the person comes back.
    const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    if (reduce || hidden || !target.startsWith(shownRef.current.slice(0, 1)) || target.length < shownRef.current.length) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const tick = () => {
      const current = shownRef.current;
      const lag = target.length - current.length;
      if (lag <= 0) return;
      const step = Math.max(1, Math.ceil(lag / 6));
      const next = target.slice(0, current.length + step);
      shownRef.current = next;
      setShown(next);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target]);

  return shown;
}
