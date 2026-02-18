"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Terminal } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface InstallMCPStepProps {
  onNext: () => void;
  onSkip: () => void;
}

/**
 * Example “deep link / config install” step.
 *
 * In StartBlock, this triggers a Cursor deep link that imports MCP config.
 * In another app, swap this for your IDE integration / agent bridge install flow.
 */
export function InstallMCPStep({ onNext, onSkip }: InstallMCPStepProps) {
  const [isInstalling, setIsInstalling] = useState(false);

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      // TODO: Replace with your install logic.
      // Example:
      // - fetch a config package URL
      // - redirect to a deep link
      setTimeout(onNext, 1500);
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div className="space-y-8 w-full max-w-md">
      <motion.div
        initial={{ scale: 0.3, opacity: 0, rotate: 90 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ duration: 0.9, ease: [0.34, 1.56, 0.64, 1] }}
        className="w-20 h-20 bg-purple-500/10 rounded-2xl flex items-center justify-center mx-auto shadow-xl border border-purple-500/20"
      >
        <Terminal className="w-10 h-10 text-purple-400" />
      </motion.div>

      <div className="space-y-3">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-3xl font-bold text-white tracking-tight font-['Titillium_Web']"
        >
          Install Agent Bridge
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-gray-400 font-['Source_Serif_4'] leading-relaxed"
        >
          Replace this description with what your bridge enables (sync, memory, automation).
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.6, duration: 0.7 }}
        className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5 text-left"
      >
        <p className="text-sm text-center text-gray-300 leading-relaxed">
          This step typically installs a local bridge that lets your IDE/tooling talk to your app.
        </p>
      </motion.div>

      <div className="flex flex-col space-y-4">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.8, duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <Button
            onClick={handleInstall}
            disabled={isInstalling}
            size="lg"
            className="w-full bg-purple-600 hover:bg-purple-700 text-white h-14 rounded-xl font-bold text-lg shadow-lg transition-all"
          >
            {isInstalling ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Installing...
              </>
            ) : (
              "Install"
            )}
          </Button>
        </motion.div>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.95, duration: 0.6 }}
          onClick={onSkip}
          className="text-gray-500 hover:text-gray-300 text-sm font-medium transition-colors"
        >
          I&apos;ll do this later
        </motion.button>
      </div>
    </div>
  );
}

