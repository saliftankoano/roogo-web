"use client";

import { motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { roogoMotion } from "@/lib/motion";

export function DashboardMotionFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative isolate" data-dashboard-motion-frame>
      {!reduceMotion && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-4 left-0 right-0 h-px overflow-hidden rounded-full bg-primary/10"
        >
          <motion.div
            key={pathname}
            className="h-full origin-left bg-primary"
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: [0, 1, 1], opacity: [0, 0.75, 0] }}
            transition={{
              duration: 0.56,
              ease: roogoMotion.deliberate.ease,
              times: [0, 0.72, 1],
            }}
          />
        </div>
      )}
      {children}
    </div>
  );
}
