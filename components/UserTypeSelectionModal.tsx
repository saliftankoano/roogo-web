"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  HouseIcon,
  MagnifyingGlassIcon,
  BriefcaseIcon,
  CheckCircleIcon,
  ArrowLeftIcon,
  BuildingsIcon,
} from "@phosphor-icons/react";
import { Button } from "./ui/Button";
import Image from "next/image";

interface UserTypeSelectionModalProps {
  isOpen: boolean;
  onSelectUserType: (
    userType: string,
    agentInfo?: { companyName: string; facebookUrl?: string }
  ) => Promise<void>;
}

export default function UserTypeSelectionModal({
  isOpen,
  onSelectUserType,
}: UserTypeSelectionModalProps) {
  const [step, setStep] = useState<"type" | "agentInfo">("type");
  const [selectedUserType, setSelectedUserType] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  // Agent info fields
  const [companyName, setCompanyName] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");

  const handleContinue = async () => {
    if (selectedUserType === "agent") {
      setStep("agentInfo");
    } else {
      await handleSubmit();
    }
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      if (selectedUserType === "agent") {
        await onSelectUserType(selectedUserType, {
          companyName,
          facebookUrl: facebookUrl || undefined,
        });
      } else {
        await onSelectUserType(selectedUserType);
      }
    } catch (error) {
      console.error("Error selecting user type:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setStep("type");
    setCompanyName("");
    setFacebookUrl("");
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white w-full max-w-md rounded-[40px] shadow-2xl border border-neutral-200 overflow-hidden"
          >
            {step === "type" ? (
              <div className="p-8">
                {/* Header */}
                <div className="flex flex-col items-center mb-8">
                  <div className="w-20 h-20 mb-4">
                    <Image
                      src="/logo.png"
                      alt="Roogo"
                      width={80}
                      height={80}
                      className="object-contain"
                    />
                  </div>
                  <h2 className="text-2xl font-bold text-neutral-900 text-center">
                    Choisissez votre profil
                  </h2>
                  <p className="text-neutral-600 text-sm text-center mt-2">
                    Comment souhaitez-vous utiliser Roogo ?
                  </p>
                </div>

                {/* User Type Options */}
                <div className="space-y-4">
                  {/* Owner Option */}
                  <button
                    onClick={() => setSelectedUserType("owner")}
                    className={`w-full border-2 rounded-2xl p-5 transition-all ${
                      selectedUserType === "owner"
                        ? "border-primary bg-primary/10"
                        : "border-neutral-200 bg-white hover:border-neutral-300"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <HouseIcon
                        size={32}
                        weight="fill"
                        className={
                          selectedUserType === "owner"
                            ? "text-primary"
                            : "text-neutral-400"
                        }
                      />
                      <div className="flex-1 text-left">
                        <h3 className="text-lg font-bold text-neutral-900">
                          Propriétaire
                        </h3>
                        <p className="text-sm text-neutral-600 mt-0.5">
                          Je veux louer mon bien
                        </p>
                      </div>
                      {selectedUserType === "owner" && (
                        <CheckCircleIcon
                          size={24}
                          weight="fill"
                          className="text-primary"
                        />
                      )}
                    </div>
                  </button>

                  {/* Renter Option */}
                  <button
                    onClick={() => setSelectedUserType("renter")}
                    className={`w-full border-2 rounded-2xl p-5 transition-all ${
                      selectedUserType === "renter"
                        ? "border-primary bg-primary/10"
                        : "border-neutral-200 bg-white hover:border-neutral-300"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <MagnifyingGlassIcon
                        size={32}
                        weight="bold"
                        className={
                          selectedUserType === "renter"
                            ? "text-primary"
                            : "text-neutral-400"
                        }
                      />
                      <div className="flex-1 text-left">
                        <h3 className="text-lg font-bold text-neutral-900">
                          Locataire
                        </h3>
                        <p className="text-sm text-neutral-600 mt-0.5">
                          Je cherche un logement
                        </p>
                      </div>
                      {selectedUserType === "renter" && (
                        <CheckCircleIcon
                          size={24}
                          weight="fill"
                          className="text-primary"
                        />
                      )}
                    </div>
                  </button>

                  {/* Agent Option */}
                  <button
                    onClick={() => setSelectedUserType("agent")}
                    className={`w-full border-2 rounded-2xl p-5 transition-all ${
                      selectedUserType === "agent"
                        ? "border-primary bg-primary/10"
                        : "border-neutral-200 bg-white hover:border-neutral-300"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <BriefcaseIcon
                        size={32}
                        weight="fill"
                        className={
                          selectedUserType === "agent"
                            ? "text-primary"
                            : "text-neutral-400"
                        }
                      />
                      <div className="flex-1 text-left">
                        <h3 className="text-lg font-bold text-neutral-900">
                          Agent Immobilier
                        </h3>
                        <p className="text-sm text-neutral-600 mt-0.5">
                          Je suis un professionnel
                        </p>
                      </div>
                      {selectedUserType === "agent" && (
                        <CheckCircleIcon
                          size={24}
                          weight="fill"
                          className="text-primary"
                        />
                      )}
                    </div>
                  </button>
                </div>

                {/* Continue Button */}
                <Button
                  onClick={handleContinue}
                  disabled={!selectedUserType || isLoading}
                  variant="primary"
                  size="lg"
                  fullWidth
                  className="mt-6"
                >
                  {isLoading ? "Chargement..." : "Continuer"}
                </Button>
              </div>
            ) : (
              <div className="p-8">
                {/* Agent Info Header */}
                <div className="flex items-center mb-6">
                  <button
                    onClick={handleBack}
                    className="p-2 -ml-2 hover:bg-neutral-100 rounded-full transition-colors"
                  >
                    <ArrowLeftIcon size={20} weight="bold" />
                  </button>
                  <h2 className="text-2xl font-bold text-neutral-900 ml-3">
                    Informations professionnelles
                  </h2>
                </div>

                <div className="space-y-6">
                  {/* Company Name */}
                  <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-2">
                      Nom de l&apos;entreprise{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <BuildingsIcon
                          size={20}
                          weight="bold"
                          className="text-neutral-400"
                        />
                      </div>
                      <input
                        type="text"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="Ex: Immobilière Ouaga"
                        className="w-full bg-neutral-50 border border-neutral-200 rounded-2xl py-3 pl-12 pr-4 text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </div>
                  </div>

                  {/* Facebook URL */}
                  <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-2">
                      Page Facebook{" "}
                      <span className="text-neutral-400 font-normal">
                        (optionnel)
                      </span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="#1877F2"
                        >
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                      </div>
                      <input
                        type="url"
                        value={facebookUrl}
                        onChange={(e) => setFacebookUrl(e.target.value)}
                        placeholder="https://facebook.com/votre-page"
                        className="w-full bg-neutral-50 border border-neutral-200 rounded-2xl py-3 pl-12 pr-4 text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                {/* Submit Button */}
                <Button
                  onClick={handleSubmit}
                  disabled={!companyName || isLoading}
                  variant="primary"
                  size="lg"
                  fullWidth
                  className="mt-8"
                >
                  {isLoading ? "Création du compte..." : "Terminer l'inscription"}
                </Button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
