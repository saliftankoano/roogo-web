"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { roogoMotion } from "@/lib/motion";

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
        <div
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#c96a2e]/10 rounded-full blur-[120px]"
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#3fa6d9]/10 rounded-full blur-[120px]"
        />
      </div>

      {/* Content wrapper — min-h-screen centres short steps; tall steps scroll naturally */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen w-full px-6 pt-12 pb-32">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={roogoMotion.standard}
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
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...roogoMotion.standard, delay: 0.12 }}
      >
        {Array.from({ length: totalSteps }).map((_, i) => (
          <motion.div
            key={i}
            layout
            className={cn(
              "h-1.5 rounded-full",
              i + 1 === currentStep
                ? "w-8 bg-primary shadow-lg shadow-primary/50"
                : i + 1 < currentStep
                  ? "w-4 bg-primary/40"
                  : "w-1.5 bg-[#3D3027]",
            )}
            transition={roogoMotion.spring}
          />
        ))}
      </motion.div>
    </div>
  );
}
