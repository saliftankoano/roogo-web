"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Github } from "lucide-react";

interface ConnectGitHubStepProps {
  onNext: () => void;
}

const benefitVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: 0.6 + i * 0.15,
      duration: 0.6,
      ease: [0.25, 0.1, 0.25, 1] as const,
    },
  }),
};

/**
 * Example "integration" step template.
 *
 * In StartBlock, this step:
 * - launches an OAuth flow (Clerk GitHub)
 * - persists progress so OAuth redirects don't reset the wizard
 * - auto-advances when integration is already connected
 *
 * For your app:
 * - replace `isConnected` check with your own
 * - replace `handleConnect` with your OAuth/integration logic
 */
export function ConnectGitHubStep({ onNext }: ConnectGitHubStepProps) {
  const [isConnecting, setIsConnecting] = useState(false);

  // TODO: Replace with your real "connected" state check
  const isConnected = false;

  useEffect(() => {
    if (isConnected) {
      const timer = setTimeout(() => onNext(), 800);
      return () => clearTimeout(timer);
    }
  }, [isConnected, onNext]);

  const handleConnect = async () => {
    if (isConnected) return onNext();
    setIsConnecting(true);
    try {
      // TODO: Trigger your OAuth/integration flow here
      // Example: window.location.href = yourOAuthUrl;
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="space-y-8 w-full max-w-lg">
      <motion.div
        initial={{ scale: 0.3, opacity: 0, rotate: -90 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ duration: 0.9, ease: [0.34, 1.56, 0.64, 1] }}
        className="w-20 h-20 bg-gray-800 rounded-2xl flex items-center justify-center mx-auto shadow-xl border border-gray-700"
      >
        <Github className="w-10 h-10 text-white" />
      </motion.div>

      <div className="space-y-3">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-3xl font-bold text-white tracking-tight font-['Titillium_Web']"
        >
          Connect an Integration
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-gray-400 font-['Source_Serif_4'] leading-relaxed"
        >
          Use this step to connect the key integration your app depends on.
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5, duration: 0.7 }}
        className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 text-left space-y-4"
      >
        {[
          "Replace these benefits with your app’s value props",
          "Make the integration feel essential (mandatory if needed)",
          "Reassure users about safety + permissions",
        ].map((text, idx) => (
          <motion.div
            key={text}
            custom={idx}
            initial="hidden"
            animate="visible"
            variants={benefitVariants}
            className="flex items-start space-x-3"
          >
            <CheckCircle2 className="w-5 h-5 text-indigo-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-gray-300">{text}</p>
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 1.05, duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <Button
          onClick={handleConnect}
          disabled={isConnecting}
          size="lg"
          className="w-full bg-white text-black hover:bg-gray-100 h-14 rounded-xl font-bold text-lg shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          {isConnected ? "Continue" : isConnecting ? "Connecting..." : "Connect"}
        </Button>
      </motion.div>
    </div>
  );
}

