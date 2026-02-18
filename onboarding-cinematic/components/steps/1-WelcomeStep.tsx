"use client";

import React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="space-y-8">
      <motion.div
        initial={{ scale: 0.3, opacity: 0, rotate: -180 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{
          duration: 1.2,
          ease: [0.34, 1.56, 0.64, 1],
          opacity: { duration: 0.8 },
        }}
        className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-6xl rounded-2xl shadow-2xl mx-auto"
      >
        S
      </motion.div>

      <div className="space-y-4">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: 0.4,
            duration: 0.8,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          className="text-4xl font-bold text-white tracking-tight font-['Titillium_Web']"
        >
          Welcome
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: 0.6,
            duration: 0.8,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          className="text-xl text-gray-400 max-w-md mx-auto font-['Source_Serif_4'] leading-relaxed"
        >
          Replace this step with your app’s welcome message.
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.9, duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <Button
          onClick={onNext}
          size="lg"
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 rounded-xl font-medium text-lg h-14 shadow-lg shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95"
        >
          Get started
        </Button>
      </motion.div>
    </div>
  );
}

