"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  XIcon,
  PhoneIcon,
  LockKeyIcon,
  CheckCircleIcon,
  WarningCircleIcon,
  SpinnerIcon,
  CreditCardIcon,
} from "@phosphor-icons/react";
import { useAuth } from "@clerk/nextjs";

interface PropertyPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  propertyId: string;
  propertyTitle: string;
  rentAmount: number;
  depositMonths: number;
}

type PaymentProvider = "ORANGE_MONEY" | "MOOV_MONEY";
type PaymentStep = "provider" | "phone" | "otp" | "processing" | "success" | "error";

export default function PropertyPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  propertyId,
  propertyTitle,
  rentAmount,
  depositMonths,
}: PropertyPaymentModalProps) {
  const { getToken } = useAuth();
  const [step, setStep] = useState<PaymentStep>("provider");
  const [provider, setProvider] = useState<PaymentProvider | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptCountRef = useRef(0);

  const totalAmount = depositMonths * rentAmount + rentAmount;

  useEffect(() => {
    if (!isOpen) {
      resetModal();
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const resetModal = () => {
    setStep("provider");
    setProvider(null);
    setPhoneNumber("");
    setOtpCode("");
    setErrorMessage("");
    attemptCountRef.current = 0;
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const handleProviderSelect = (p: PaymentProvider) => {
    setProvider(p);
    setStep("phone");
  };

  const handlePhoneContinue = () => {
    if (!phoneNumber.trim()) return;
    if (provider === "ORANGE_MONEY") {
      setStep("otp");
    } else {
      handleInitiatePayment();
    }
  };

  const handleInitiatePayment = async () => {
    if (!provider) return;
    setStep("processing");
    setErrorMessage("");

    try {
      const token = await getToken();
      const body: Record<string, string> = {
        phoneNumber: phoneNumber.trim(),
        provider,
      };
      if (provider === "ORANGE_MONEY" && otpCode.trim()) {
        body.preAuthorisationCode = otpCode.trim();
      }

      const res = await fetch(`/api/properties/${propertyId}/lock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "Echec de l'initiation du paiement");
        setStep("error");
        return;
      }

      const id = data.depositId;

      if (data.status === "COMPLETED") {
        setStep("success");
        onSuccess();
        return;
      }

      startPolling(id);
    } catch {
      setErrorMessage("Une erreur inattendue s'est produite");
      setStep("error");
    }
  };

  const startPolling = (id: string) => {
    attemptCountRef.current = 0;
    pollingRef.current = setInterval(async () => {
      attemptCountRef.current += 1;

      if (attemptCountRef.current > 20) {
        clearInterval(pollingRef.current!);
        pollingRef.current = null;
        setErrorMessage("Delai d'attente depasse. Veuillez verifier votre telephone.");
        setStep("error");
        return;
      }

      try {
        const token = await getToken();
        const res = await fetch("/api/payments/status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ depositId: id }),
        });

        const data = await res.json();

        if (data.status === "COMPLETED") {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          setStep("success");
          onSuccess();
        } else if (data.status === "FAILED" || data.status === "REJECTED") {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          setErrorMessage("Paiement refuse. Veuillez reessayer.");
          setStep("error");
        }
      } catch {
        // keep polling on network errors
      }
    }, 3000);
  };

  const formatAmount = (amount: number) => amount.toLocaleString("fr-FR");

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={step !== "processing" ? onClose : undefined}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-8 pb-6 border-b border-neutral-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                <CreditCardIcon size={20} weight="fill" className="text-primary" />
              </div>
              <div>
                <p className="font-black text-neutral-900 text-sm">Louer de suite</p>
                <p className="text-xs text-neutral-400 font-medium truncate max-w-[200px]">{propertyTitle}</p>
              </div>
            </div>
            {step !== "processing" && (
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors"
              >
                <XIcon size={16} weight="bold" className="text-neutral-600" />
              </button>
            )}
          </div>

          {/* Amount Summary */}
          <div className="px-8 pt-6 pb-4">
            <div className="bg-neutral-50 rounded-2xl p-4 space-y-2 border border-neutral-100">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500 font-medium">Caution ({depositMonths} mois)</span>
                <span className="font-bold text-neutral-900">{formatAmount(depositMonths * rentAmount)} FCFA</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500 font-medium">1er mois de loyer</span>
                <span className="font-bold text-neutral-900">{formatAmount(rentAmount)} FCFA</span>
              </div>
              <div className="border-t border-neutral-200 pt-2 mt-2 flex justify-between">
                <span className="text-sm font-black text-neutral-900">Total</span>
                <span className="text-sm font-black text-primary">{formatAmount(totalAmount)} FCFA</span>
              </div>
            </div>
          </div>

          {/* Step Content */}
          <div className="px-8 pb-8">

            {/* Provider Selection */}
            {step === "provider" && (
              <div className="space-y-3">
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-4">
                  Choisissez votre operateur
                </p>
                <button
                  onClick={() => handleProviderSelect("ORANGE_MONEY")}
                  className="w-full flex items-center gap-4 p-4 bg-white border-2 border-neutral-100 hover:border-orange-400 hover:bg-orange-50/50 rounded-2xl transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center font-black text-orange-600 text-sm">
                    OM
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-neutral-900 group-hover:text-orange-600 transition-colors">Orange Money</p>
                    <p className="text-xs text-neutral-400">Burkina Faso</p>
                  </div>
                </button>
                <button
                  onClick={() => handleProviderSelect("MOOV_MONEY")}
                  className="w-full flex items-center gap-4 p-4 bg-white border-2 border-neutral-100 hover:border-blue-400 hover:bg-blue-50/50 rounded-2xl transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center font-black text-blue-600 text-sm">
                    MM
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-neutral-900 group-hover:text-blue-600 transition-colors">Moov Money</p>
                    <p className="text-xs text-neutral-400">Burkina Faso</p>
                  </div>
                </button>
              </div>
            )}

            {/* Phone Number */}
            {step === "phone" && (
              <div className="space-y-4">
                <button
                  onClick={() => setStep("provider")}
                  className="flex items-center gap-2 text-xs font-bold text-neutral-400 hover:text-neutral-600 transition-colors mb-2"
                >
                  Changer d&apos;operateur
                </button>
                <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-xl mb-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs ${provider === "ORANGE_MONEY" ? "bg-orange-100 text-orange-600" : "bg-blue-100 text-blue-600"}`}>
                    {provider === "ORANGE_MONEY" ? "OM" : "MM"}
                  </div>
                  <span className="text-sm font-bold text-neutral-700">
                    {provider === "ORANGE_MONEY" ? "Orange Money" : "Moov Money"}
                  </span>
                </div>
                <label className="block">
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                    Numero de telephone
                  </p>
                  <div className="flex items-center gap-3 bg-neutral-50 border border-neutral-200 rounded-2xl px-4 py-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10 transition-all">
                    <PhoneIcon size={16} weight="bold" className="text-neutral-400 shrink-0" />
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="07 XX XX XX"
                      className="bg-transparent outline-none flex-1 text-sm font-semibold text-neutral-900 placeholder:text-neutral-300"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && handlePhoneContinue()}
                    />
                  </div>
                </label>
                <button
                  onClick={handlePhoneContinue}
                  disabled={!phoneNumber.trim()}
                  className="w-full bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-4 rounded-2xl transition-all text-sm"
                >
                  Continuer
                </button>
              </div>
            )}

            {/* OTP - Orange Money only */}
            {step === "otp" && (
              <div className="space-y-4">
                <button
                  onClick={() => setStep("phone")}
                  className="flex items-center gap-2 text-xs font-bold text-neutral-400 hover:text-neutral-600 transition-colors mb-2"
                >
                  Retour
                </button>
                <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-2">
                  <p className="text-xs font-bold text-orange-700 mb-1">Comment obtenir votre code</p>
                  <p className="text-xs text-orange-600">
                    Composez <span className="font-black">*144*4*6#</span> sur votre telephone Orange et entrez le code recu ci-dessous.
                  </p>
                </div>
                <label className="block">
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                    Code de pre-autorisation
                  </p>
                  <div className="flex items-center gap-3 bg-neutral-50 border border-neutral-200 rounded-2xl px-4 py-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10 transition-all">
                    <LockKeyIcon size={16} weight="bold" className="text-neutral-400 shrink-0" />
                    <input
                      type="text"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="Code OTP"
                      className="bg-transparent outline-none flex-1 text-sm font-semibold text-neutral-900 placeholder:text-neutral-300 tracking-widest"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && handleInitiatePayment()}
                    />
                  </div>
                </label>
                <button
                  onClick={handleInitiatePayment}
                  disabled={!otpCode.trim()}
                  className="w-full bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-4 rounded-2xl transition-all text-sm"
                >
                  Payer {formatAmount(totalAmount)} FCFA
                </button>
              </div>
            )}

            {/* Processing */}
            {step === "processing" && (
              <div className="flex flex-col items-center py-8 gap-4 text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <SpinnerIcon size={32} weight="bold" className="text-primary animate-spin" />
                </div>
                <div>
                  <p className="font-black text-neutral-900 mb-1">Paiement en cours...</p>
                  <p className="text-xs text-neutral-400">
                    Confirmez sur votre telephone ({phoneNumber})
                  </p>
                </div>
                <div className="w-full bg-neutral-100 rounded-full h-1 overflow-hidden">
                  <div className="h-full bg-primary rounded-full animate-pulse w-3/4" />
                </div>
              </div>
            )}

            {/* Success */}
            {step === "success" && (
              <div className="flex flex-col items-center py-8 gap-4 text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircleIcon size={32} weight="fill" className="text-green-600" />
                </div>
                <div>
                  <p className="font-black text-neutral-900 mb-2">Felicitations !</p>
                  <p className="text-sm text-neutral-500">
                    Votre paiement a ete confirme. Vous avez regle la caution et le premier mois de loyer.
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-black py-4 rounded-2xl transition-all text-sm"
                >
                  Fermer
                </button>
              </div>
            )}

            {/* Error */}
            {step === "error" && (
              <div className="flex flex-col items-center py-6 gap-4 text-center">
                <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                  <WarningCircleIcon size={32} weight="fill" className="text-red-500" />
                </div>
                <div>
                  <p className="font-black text-neutral-900 mb-2">Echec du paiement</p>
                  <p className="text-sm text-neutral-500">{errorMessage}</p>
                </div>
                <div className="flex gap-3 w-full">
                  <button
                    onClick={resetModal}
                    className="flex-1 bg-primary hover:bg-primary/90 text-white font-black py-4 rounded-2xl transition-all text-sm"
                  >
                    Reessayer
                  </button>
                  <button
                    onClick={onClose}
                    className="flex-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 font-bold py-4 rounded-2xl transition-all text-sm"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
