"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface OnboardingShellProps {
  children: React.ReactNode;
  currentStep: number;
  totalSteps: number;
}

/**
 * Cinematic onboarding shell for Roogo.
 * Sits above all other page chrome (nav, etc.) via z-[9999].
 * overflow-y-auto lets tall form steps scroll while short steps stay centered.
 */
export function OnboardingShell({
  children,
  currentStep,
  totalSteps,
}: OnboardingShellProps) {
  return (
    <div className="fixed inset-0 z-[9999] bg-[#2B241D] flex flex-col overflow-y-auto">
      {/* Brand Glows — contained in their own stacking context, never clip scroll */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <motion.div
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#c96a2e]/10 rounded-full blur-[120px]"
          animate={{ scale: [1, 1.2, 1], opacity: [0.05, 0.1, 0.05] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#3fa6d9]/10 rounded-full blur-[120px]"
          animate={{ scale: [1, 1.3, 1], opacity: [0.05, 0.1, 0.05] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />
      </div>

      {/* Content wrapper — min-h-screen centres short steps; tall steps scroll naturally */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen w-full px-6 pt-12 pb-32">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, y: 30, scale: 0.95, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -30, scale: 0.95, filter: "blur(10px)" }}
              transition={{
                duration: 0.8,
                ease: [0.25, 0.1, 0.25, 1],
                opacity: { duration: 0.6 },
              }}
              className="flex flex-col items-center text-center"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Step indicator — fixed, above the scroll layer, below the content */}
      <motion.div
        className="fixed bottom-8 left-0 right-0 z-[10000] flex justify-center space-x-2 pointer-events-none"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6 }}
      >
        {Array.from({ length: totalSteps }).map((_, i) => (
          <motion.div
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-all duration-500 ease-out",
              i + 1 === currentStep
                ? "w-8 bg-primary shadow-lg shadow-primary/50"
                : i + 1 < currentStep
                  ? "w-4 bg-primary/40"
                  : "w-1.5 bg-[#3D3027]",
            )}
            animate={
              i + 1 === currentStep
                ? { opacity: [0.7, 1, 0.7], scale: [0.95, 1.05, 0.95] }
                : {}
            }
            transition={
              i + 1 === currentStep
                ? { duration: 2, repeat: Infinity, ease: "easeInOut" }
                : {}
            }
          />
        ))}
      </motion.div>
    </div>
  );
}
