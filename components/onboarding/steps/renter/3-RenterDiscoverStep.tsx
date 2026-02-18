"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  MagnifyingGlassIcon,
  HeartIcon,
  ChatCircleTextIcon,
  CheckCircleIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";

interface RenterDiscoverStepProps {
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

export function RenterDiscoverStep({ onNext }: RenterDiscoverStepProps) {
  return (
    <div className="space-y-8 w-full max-w-lg">
      <motion.div
        initial={{ scale: 0.3, opacity: 0, rotate: -90 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ duration: 0.9, ease: [0.34, 1.56, 0.64, 1] }}
        className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto shadow-xl border border-primary/20"
      >
        <MagnifyingGlassIcon size={40} weight="bold" className="text-primary" />
      </motion.div>

      <div className="space-y-3">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-3xl font-bold text-white tracking-tight"
        >
          Trouvez votre perle rare
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
          Explorez des centaines d&apos;annonces vérifiées partout au Burkina
          Faso.
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5, duration: 0.7 }}
        className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 text-left space-y-4"
      >
        {[
          {
            text: "Recherche par ville et quartier",
            icon: MagnifyingGlassIcon,
          },
          { text: "Enregistrez vos biens favoris", icon: HeartIcon },
          {
            text: "Contactez directement les propriétaires",
            icon: ChatCircleTextIcon,
          },
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
