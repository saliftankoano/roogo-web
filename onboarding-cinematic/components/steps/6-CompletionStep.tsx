"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CompletionStepProps {
  onFinish: () => void;
}

/**
 * Example completion step.
 *
 * In your app, use this step to:
 * - confirm setup completion
 * - point users to the next action(s)
 * - optionally link into the main product surface
 */
export function CompletionStep({ onFinish }: CompletionStepProps) {
  return (
    <div className="space-y-10 w-full max-w-2xl">
      <div className="space-y-4">
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1], delay: 0.1 }}
          className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto border border-green-500/20"
        >
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </motion.div>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-4xl font-bold text-white tracking-tight font-['Titillium_Web']"
        >
          You&apos;re all set!
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-xl text-gray-400 font-['Source_Serif_4']"
        >
          Replace this summary with your app’s “what’s next”.
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.8, duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <Button
          onClick={onFinish}
          size="lg"
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-10 h-14 rounded-xl font-bold text-lg shadow-lg transition-all hover:scale-105"
        >
          Continue
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </motion.div>
    </div>
  );
}

