"use client";

import { animate, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { roogoEase } from "@/lib/motion";

// An amount that counts smoothly to its new value (350 ms, ease-out);
// reduced motion shows the new value at once.

export function AnimatedAmount({
  value,
  format,
  className,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);

  useEffect(() => {
    if (reduceMotion || shownRef.current === value) {
      shownRef.current = value;
      setShown(value);
      return;
    }
    const controls = animate(shownRef.current, value, {
      duration: 0.35,
      ease: roogoEase,
      onUpdate: (v) => {
        shownRef.current = v;
        setShown(v);
      },
    });
    return () => controls.stop();
  }, [value, reduceMotion]);

  const display = shown === value ? value : Math.round(shown / 50_000) * 50_000;
  return (
    <span className={className}>
      <span aria-hidden>{format(display)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
