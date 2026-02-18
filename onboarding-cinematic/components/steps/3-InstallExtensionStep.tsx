"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Download } from "lucide-react";
import { AppleLogoIcon, WindowsLogoIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

interface InstallExtensionStepProps {
  onNext: () => void;
  onSkip: () => void;
}

/**
 * Example install step template.
 *
 * Shows how to:
 * - provide a download action
 * - detect OS to show the correct shortcut + icon
 * - keep the step skippable (optional) while still guiding the user
 */
export function InstallExtensionStep({ onNext, onSkip }: InstallExtensionStepProps) {
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    setIsMac(ua.includes("mac"));
  }, []);

  const shortcutKey = isMac ? "Cmd" : "Ctrl";
  const OSIcon = isMac ? AppleLogoIcon : WindowsLogoIcon;

  const handleDownload = () => {
    // TODO: Replace with your own download URL and filename
    const link = document.createElement("a");
    link.href = "/your-extension.vsix";
    link.download = "your-extension.vsix";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 w-full max-w-md">
      <motion.div
        initial={{ scale: 0.3, opacity: 0, y: -20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.34, 1.56, 0.64, 1] }}
        className="w-20 h-20 bg-indigo-500/10 rounded-2xl flex items-center justify-center mx-auto shadow-xl border border-indigo-500/20"
      >
        <Download className="w-10 h-10 text-indigo-400" />
      </motion.div>

      <div className="space-y-3">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-3xl font-bold text-white tracking-tight font-['Titillium_Web']"
        >
          Install the Extension
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-gray-400 font-['Source_Serif_4'] leading-relaxed"
        >
          Replace this description with the value your extension unlocks.
        </motion.p>
      </div>

      <div className="space-y-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6, duration: 0.7 }}
        >
          <Button
            onClick={handleDownload}
            variant="outline"
            size="lg"
            className="w-full border-gray-700 text-white hover:bg-gray-800 h-14 rounded-xl font-bold text-lg transition-all"
          >
            Download Extension (.vsix)
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75, duration: 0.7 }}
          className="text-left bg-gray-900/50 border border-gray-800 rounded-2xl p-5 space-y-3"
        >
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              Installation
            </p>
            <div className="flex items-center gap-1">
              <OSIcon size={14} weight="fill" className="text-gray-500" />
              <span className="text-xs text-gray-500">
                {isMac ? "macOS" : "Windows"}
              </span>
            </div>
          </div>

          <p className="text-sm text-gray-300">
            Press{" "}
            <kbd className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-800 rounded border border-gray-700 text-xs">
              {shortcutKey}+Shift+P
            </kbd>{" "}
            and type &quot;Install from VSIX&quot; to install.
          </p>
        </motion.div>
      </div>

      <div className="flex flex-col space-y-4">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.9, duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <Button
            onClick={onNext}
            size="lg"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-14 rounded-xl font-bold text-lg shadow-lg transition-all"
          >
            Continue
          </Button>
        </motion.div>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.05, duration: 0.6 }}
          onClick={onSkip}
          className="text-gray-500 hover:text-gray-300 text-sm font-medium transition-colors"
        >
          I&apos;ll do this later
        </motion.button>
      </div>
    </div>
  );
}

