"use client";

import { MotionConfig, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";
import { roogoMotion } from "@/lib/motion";

function RouteEntrance({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const hasMounted = useRef(false);
  const shouldAnimate = hasMounted.current && !reduceMotion;

  useEffect(() => {
    hasMounted.current = true;
  }, []);

  return (
    <motion.div
      key={pathname}
      data-roogo-route={pathname}
      initial={shouldAnimate ? { opacity: 0.72 } : false}
      animate={{ opacity: 1 }}
      transition={roogoMotion.standard}
    >
      {children}
    </motion.div>
  );
}

export function AppMotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={roogoMotion.standard}
    >
      <RouteEntrance>{children}</RouteEntrance>
    </MotionConfig>
  );
}
