"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CreateAgentStepProps {
  onNext: () => void;
  onSkip: () => void;
}

/**
 * Example “create resource” step.
 *
 * In StartBlock, this creates an “agent” record for tracking and automation.
 * In another app, use this to create a required resource (project, workspace, profile, etc.).
 */
export function CreateAgentStep({ onNext, onSkip }: CreateAgentStepProps) {
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setIsCreating(true);
    try {
      // TODO: Replace with your API call.
      await new Promise((r) => setTimeout(r, 800));
      onNext();
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-8 w-full max-w-md">
      <motion.div
        initial={{ scale: 0.3, opacity: 0, rotate: 180 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ duration: 0.9, ease: [0.34, 1.56, 0.64, 1] }}
        className="w-20 h-20 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto shadow-xl border border-blue-500/20"
      >
        <Bot className="w-10 h-10 text-blue-400" />
      </motion.div>

      <div className="space-y-3">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-3xl font-bold text-white tracking-tight font-['Titillium_Web']"
        >
          Create Your First Agent
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-gray-400 font-['Source_Serif_4'] leading-relaxed"
        >
          Replace this copy with what your “resource” enables.
        </motion.p>
      </div>

      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.7 }}
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. My First Agent)"
          className="h-14 bg-gray-900 border-gray-800 text-white rounded-xl px-4 focus:ring-indigo-500"
          required
        />
        <Button
          type="submit"
          disabled={isCreating || !name}
          size="lg"
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-14 rounded-xl font-bold text-lg shadow-lg transition-all"
        >
          {isCreating ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            "Create"
          )}
        </Button>
      </motion.form>

      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.6 }}
        onClick={onSkip}
        className="text-gray-500 hover:text-gray-300 text-sm font-medium transition-colors"
      >
        I&apos;ll do this later
      </motion.button>
    </div>
  );
}

