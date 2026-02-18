"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  HouseIcon, 
  MagnifyingGlassIcon, 
  BriefcaseIcon, 
  CheckCircleIcon 
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";

interface UserTypeStepProps {
  onNext: (type: string) => void;
  initialType?: string;
}

export function UserTypeStep({ onNext, initialType }: UserTypeStepProps) {
  const [selectedType, setSelectedType] = useState<string>(initialType || "");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (initialType) {
      // Auto-advance if type is already set (e.g. from previous session)
      const timer = setTimeout(() => onNext(initialType), 800);
      return () => clearTimeout(timer);
    }
  }, [initialType, onNext]);

  const handleSelect = async (type: string) => {
    setSelectedType(type);
  };

  const handleContinue = async () => {
    if (!selectedType) return;
    setIsLoading(true);
    try {
      // The actual metadata update will happen in the controller page.tsx
      // to keep this component focused on UI.
      onNext(selectedType);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8 w-full max-w-lg">
      <div className="space-y-3">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-3xl font-bold text-white tracking-tight"
        >
          Quel est votre profil ?
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-neutral-400 leading-relaxed"
        >
          Choisissez comment vous souhaitez utiliser Roogo.
        </motion.p>
      </div>

      <div className="space-y-4">
        {[
          { id: "renter", title: "Locataire", desc: "Je cherche un logement", icon: MagnifyingGlassIcon },
          { id: "owner", title: "Propriétaire", desc: "Je veux louer mon bien", icon: HouseIcon },
          { id: "agent", title: "Agent Immobilier", desc: "Je suis un professionnel", icon: BriefcaseIcon },
        ].map((type, idx) => (
          <motion.button
            key={type.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 + idx * 0.1, duration: 0.5 }}
            onClick={() => handleSelect(type.id)}
            className={`w-full border-2 rounded-2xl p-5 transition-all text-left flex items-center gap-4 ${
              selectedType === type.id
                ? "border-primary bg-primary/10"
                : "border-neutral-800 bg-neutral-900/50 hover:border-neutral-700"
            }`}
          >
            <type.icon
              size={32}
              weight={selectedType === type.id ? "fill" : "bold"}
              className={selectedType === type.id ? "text-primary" : "text-neutral-500"}
            />
            <div className="flex-1">
              <h3 className="text-lg font-bold text-white">{type.title}</h3>
              <p className="text-sm text-neutral-400 mt-0.5">{type.desc}</p>
            </div>
            {selectedType === type.id && (
              <CheckCircleIcon size={24} weight="fill" className="text-primary" />
            )}
          </motion.button>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 1.1, duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <Button
          onClick={handleContinue}
          disabled={!selectedType || isLoading}
          variant="primary"
          size="lg"
          className="w-full h-14 rounded-xl font-bold text-lg shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          {isLoading ? "Chargement..." : "Continuer"}
        </Button>
      </motion.div>
    </div>
  );
}
