"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { BuildingsIcon, BriefcaseIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";

interface AgentInfoStepProps {
  onNext: (info: { companyName: string; facebookUrl?: string }) => void;
}

export function AgentInfoStep({ onNext }: AgentInfoStepProps) {
  const [companyName, setCompanyName] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName) return;
    setIsSubmitting(true);
    try {
      onNext({ companyName, facebookUrl: facebookUrl || undefined });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 w-full max-w-md">
      <motion.div
        initial={{ scale: 0.3, opacity: 0, rotate: 180 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ duration: 0.9, ease: [0.34, 1.56, 0.64, 1] }}
        className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto shadow-xl border border-primary/20"
      >
        <BriefcaseIcon size={40} weight="fill" className="text-primary" />
      </motion.div>

      <div className="space-y-3">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-3xl font-bold text-white tracking-tight"
        >
          Informations professionnelles
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-neutral-400 leading-relaxed"
        >
          Dites-nous en plus sur votre activité professionnelle.
        </motion.p>
      </div>

      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.7 }}
        onSubmit={handleSubmit}
        className="space-y-6 text-left"
      >
        <div className="space-y-2">
          <label className="text-sm font-semibold text-neutral-300 ml-1">
            Nom de l'entreprise <span className="text-primary">*</span>
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <BuildingsIcon size={20} weight="bold" className="text-neutral-500" />
            </div>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Ex: Immobilière Ouaga"
              className="h-14 bg-neutral-900 border-neutral-800 text-white rounded-xl pl-12 focus:ring-primary"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-neutral-300 ml-1">
            Page Facebook <span className="text-neutral-500 font-normal">(optionnel)</span>
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#1877F2">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </div>
            <Input
              type="url"
              value={facebookUrl}
              onChange={(e) => setFacebookUrl(e.target.value)}
              placeholder="https://facebook.com/votre-page"
              className="h-14 bg-neutral-900 border-neutral-800 text-white rounded-xl pl-12 focus:ring-primary"
            />
          </div>
        </div>

        <Button
          type="submit"
          disabled={isSubmitting || !companyName}
          variant="primary"
          size="lg"
          className="w-full h-14 rounded-xl font-bold text-lg shadow-lg transition-all"
        >
          {isSubmitting ? "Enregistrement..." : "Continuer"}
        </Button>
      </motion.form>
    </div>
  );
}
