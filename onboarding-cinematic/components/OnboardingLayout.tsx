"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface OnboardingLayoutProps {
  children: React.ReactNode;
  currentStep: number;
  totalSteps: number;
}

/**
 * Cinematic onboarding shell.
 *
 * This is a copy of StartBlock's onboarding layout:
 * - Animated background glows
 * - Step enter/exit transitions
 * - Step indicator
 *
 * For another app, keep this component unchanged and swap the step content.
 */
export function OnboardingLayout({
  children,
  currentStep,
  totalSteps,
}: OnboardingLayoutProps) {
  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <motion.div
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px]"
          animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.15, 0.1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px]"
          animate={{ scale: [1, 1.3, 1], opacity: [0.1, 0.15, 0.1] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />
      </div>

      <div className="w-full max-w-2xl px-6 relative">
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

      <motion.div
        className="absolute bottom-12 flex space-x-2"
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
                ? "w-8 bg-indigo-500 shadow-lg shadow-indigo-500/50"
                : i + 1 < currentStep
                  ? "w-4 bg-indigo-500/40"
                  : "w-1.5 bg-gray-800",
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

