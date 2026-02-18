"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  BriefcaseIcon,
  UsersIcon,
  StarIcon,
  CheckCircleIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";

interface AgentFeaturesStepProps {
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

export function AgentFeaturesStep({ onNext }: AgentFeaturesStepProps) {
  return (
    <div className="space-y-8 w-full max-w-lg">
      <motion.div
        initial={{ scale: 0.3, opacity: 0, rotate: -90 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ duration: 0.9, ease: [0.34, 1.56, 0.64, 1] }}
        className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto shadow-xl border border-primary/20"
      >
        <StarIcon size={40} weight="fill" className="text-primary" />
      </motion.div>

      <div className="space-y-3">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-3xl font-bold text-white tracking-tight"
        >
          Boostez votre activité
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: 0.45,
            duration: 0.7,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          className="text-neutral-400 leading-relaxed"
        >
          Roogo est le partenaire idéal pour les professionnels de
          l&apos;immobilier.
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5, duration: 0.7 }}
        className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 text-left space-y-4"
      >
        {[
          { text: "Gérez un catalogue illimité de biens", icon: BriefcaseIcon },
          { text: "Outils dédiés pour le suivi client", icon: UsersIcon },
          { text: "Développez votre réputation sur Roogo", icon: StarIcon },
        ].map((benefit, idx) => (
          <motion.div
            key={benefit.text}
            custom={idx}
            initial="hidden"
            animate="visible"
            variants={benefitVariants}
            className="flex items-start space-x-3"
          >
            <CheckCircleIcon
              className="w-5 h-5 text-primary mt-0.5 shrink-0"
              weight="fill"
            />
            <p className="text-sm text-neutral-300">{benefit.text}</p>
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 1.05, duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <Button
          onClick={onNext}
          variant="primary"
          size="lg"
          className="w-full h-14 rounded-xl font-bold text-lg shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          Continuer
        </Button>
      </motion.div>
    </div>
  );
}
