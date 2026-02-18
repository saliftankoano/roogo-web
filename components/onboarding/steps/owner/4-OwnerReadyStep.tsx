"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowRightIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";

interface OwnerReadyStepProps {
  onFinish: () => void;
}

export function OwnerReadyStep({ onFinish }: OwnerReadyStepProps) {
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
            <CheckCircleIcon size={32} weight="fill" className="text-green-500" />
          </motion.div>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-4xl font-bold text-white tracking-tight"
        >
          Bienvenue, Propriétaire !
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-xl text-neutral-400"
        >
          Votre espace propriétaire est prêt. Commencez à publier vos biens dès maintenant.
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.8, duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <Button
          onClick={onFinish}
          variant="primary"
          size="lg"
          className="px-10 h-14 rounded-xl font-bold text-lg shadow-lg transition-all hover:scale-105"
        >
          Accéder à mon espace
          <ArrowRightIcon size={20} weight="bold" className="ml-2" />
        </Button>
      </motion.div>
    </div>
  );
}
