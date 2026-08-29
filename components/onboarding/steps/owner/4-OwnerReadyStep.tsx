"use client";

import React, { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRightIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import confetti from "canvas-confetti";
import { roogoMotion } from "@/lib/motion";

interface OwnerReadyStepProps {
  onFinish: () => void;
}

export function OwnerReadyStep({ onFinish }: OwnerReadyStepProps) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    const timer = setTimeout(() => {
      const colors = ["#C96A2E", "#ffffff", "#f5a623"];
      confetti({
        angle: 60,
        spread: 55,
        particleCount: 36,
        origin: { x: 0, y: 0.6 },
        colors,
      });
      confetti({
        angle: 120,
        spread: 55,
        particleCount: 36,
        origin: { x: 1, y: 0.6 },
        colors,
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [reduceMotion]);

  return (
    <div className="space-y-10 w-full max-w-2xl">
      <div className="space-y-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...roogoMotion.standard, delay: 0.06 }}
          className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto border border-green-500/20"
        >
          <div>
            <CheckCircleIcon size={32} weight="fill" className="text-green-500" />
          </div>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...roogoMotion.standard, delay: 0.12 }}
          className="text-4xl font-bold text-white tracking-tight"
        >
          Bienvenue, Propriétaire !
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...roogoMotion.standard, delay: 0.18 }}
          className="text-xl text-neutral-400"
        >
          Votre espace propriétaire est prêt. Commencez à publier vos biens dès maintenant.
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...roogoMotion.standard, delay: 0.24 }}
      >
        <Button
          onClick={onFinish}
          variant="primary"
          size="lg"
          className="px-10 h-14 rounded-xl font-bold text-lg shadow-lg transition-shadow hover:shadow-xl"
        >
          Accéder à mon espace
          <ArrowRightIcon size={20} weight="bold" className="ml-2" />
        </Button>
      </motion.div>
    </div>
  );
}
