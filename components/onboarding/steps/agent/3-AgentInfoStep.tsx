"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  BuildingsIcon,
  BriefcaseIcon,
  ChartPieIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";

const agentInfoSchema = z.object({
  companyName: z
    .string()
    .min(2, "Nom requis (2 caractères minimum)")
    .max(100, "Nom trop long"),
  facebookUrl: z
    .union([
      z.string().length(0),
      z.string().url("URL invalide — ex: https://facebook.com/votre-page"),
    ])
    .optional(),
  portfolioSize: z.enum(["1-5", "6-20", "21-50", "50+"], {
    message: "Choisissez la taille de votre portefeuille",
  }),
});

type AgentInfoOutput = z.infer<typeof agentInfoSchema>;
type FieldErrors = Partial<Record<keyof AgentInfoOutput, string>>;

interface AgentInfoStepProps {
  onNext: (info: AgentInfoOutput) => void;
}

const PORTFOLIO_OPTIONS = ["1-5", "6-20", "21-50", "50+"] as const;

const CHIP =
  "flex-1 px-4 py-3 rounded-xl font-bold text-sm transition-all border cursor-pointer select-none";
const CHIP_ACTIVE = "bg-primary border-primary text-white shadow-lg shadow-primary/20";
const CHIP_IDLE = "bg-[#1C1510] border-[#3D3027] text-neutral-400 hover:border-[#5A4535]";
const CHIP_ERROR = "bg-[#1C1510] border-red-500/50 text-neutral-400 hover:border-red-400";

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs text-red-400 mt-1">
      <WarningCircleIcon size={13} weight="fill" />
      {msg}
    </p>
  );
}

export function AgentInfoStep({ onNext }: AgentInfoStepProps) {
  const [companyName, setCompanyName] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [portfolioSize, setPortfolioSize] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [shakeKey, setShakeKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clearError = (field: keyof FieldErrors) =>
    setErrors((e) => ({ ...e, [field]: undefined }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = agentInfoSchema.safeParse({
      companyName,
      facebookUrl: facebookUrl || undefined,
      portfolioSize: portfolioSize || undefined,
    });

    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      setShakeKey((k) => k + 1);
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    try {
      onNext(parsed.data);
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

      <div className="space-y-3 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7 }}
          className="text-3xl font-bold text-white tracking-tight"
        >
          Informations professionnelles
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.7 }}
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
        {/* Company name */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-neutral-300 ml-1 flex items-center gap-2">
            <BuildingsIcon size={16} weight="bold" className="text-primary" />
            Nom de l&apos;entreprise *
          </label>
          <Input
            value={companyName}
            onChange={(e) => {
              setCompanyName(e.target.value);
              clearError("companyName");
            }}
            placeholder="Ex: Immobilière Ouaga"
            className={`h-12 bg-[#1C1510] text-white rounded-xl ${errors.companyName ? "border-red-500/70 focus:ring-red-500" : "border-[#3D3027] focus:ring-primary"}`}
          />
          <FieldError msg={errors.companyName} />
        </div>

        {/* Portfolio size */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-neutral-300 ml-1 flex items-center gap-2">
            <ChartPieIcon size={16} weight="bold" className="text-primary" />
            Nombre de biens gérés *
          </label>
          <div className="flex gap-2">
            {PORTFOLIO_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setPortfolioSize(option);
                  clearError("portfolioSize");
                }}
                className={`${CHIP} ${portfolioSize === option ? CHIP_ACTIVE : errors.portfolioSize ? CHIP_ERROR : CHIP_IDLE}`}
              >
                {option}
              </button>
            ))}
          </div>
          <FieldError msg={errors.portfolioSize} />
        </div>

        {/* Facebook URL */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-neutral-300 ml-1">
            Page Facebook{" "}
            <span className="text-neutral-500 font-normal">(optionnel)</span>
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </div>
            <Input
              type="url"
              value={facebookUrl}
              onChange={(e) => {
                setFacebookUrl(e.target.value);
                clearError("facebookUrl");
              }}
              placeholder="https://facebook.com/votre-page"
              className={`h-12 bg-[#1C1510] text-white rounded-xl pl-12 ${errors.facebookUrl ? "border-red-500/70 focus:ring-red-500" : "border-[#3D3027] focus:ring-primary"}`}
            />
          </div>
          <FieldError msg={errors.facebookUrl} />
        </div>

        <motion.div
          key={shakeKey}
          animate={shakeKey > 0 ? { x: [0, -10, 10, -10, 10, -5, 5, 0] } : {}}
          transition={{ duration: 0.45, ease: "easeInOut" }}
        >
          <Button
            type="submit"
            disabled={isSubmitting}
            variant="primary"
            size="lg"
            className="w-full h-14 rounded-xl font-bold text-lg shadow-lg transition-all"
          >
            {isSubmitting ? "Enregistrement..." : "Continuer"}
          </Button>
        </motion.div>
      </motion.form>
    </div>
  );
}
