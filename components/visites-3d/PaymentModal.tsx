"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  CheckCircleIcon,
  CircleNotchIcon,
  LockIcon,
  PhoneIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  formatFCFA,
  type Slot,
  type Visit3dBookingInput,
  type Visit3dPaymentProvider,
} from "@/lib/visites-3d";

type Step = "provider" | "phone" | "otp" | "processing" | "success" | "error";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onSlotTaken: () => void;
  booking: Visit3dBookingInput;
  amount: number;
  date: string;
  slot: Slot;
};

const POLL_INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 20;

export function PaymentModal({
  isOpen,
  onClose,
  onSuccess,
  onSlotTaken,
  booking,
  amount,
  date,
  slot,
}: Props) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState<Step>("provider");
  const [provider, setProvider] = useState<Visit3dPaymentProvider | null>(
    null
  );
  const [paymentPhone, setPaymentPhone] = useState(booking.phone);
  const [otp, setOtp] = useState("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);

  useEffect(() => {
    if (!isOpen) {
      resetState();
    } else {
      setPaymentPhone(booking.phone);
    }
  }, [isOpen, booking.phone]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  function resetState() {
    setStep("provider");
    setProvider(null);
    setOtp("");
    setErrorMsg("");
    attemptsRef.current = 0;
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
  }

  function scheduleSuccess() {
    successTimerRef.current = setTimeout(() => onSuccess(), 900);
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function initiatePayment() {
    if (!provider) return;
    setStep("processing");
    setErrorMsg("");
    attemptsRef.current = 0;

    try {
      const res = await fetch("/api/visites-3d/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...booking,
          payment_provider: provider,
          payment_phone: paymentPhone,
          pre_authorisation_code: provider === "ORANGE_BFA" ? otp : undefined,
        }),
      });

      if (res.status === 409) {
        onSlotTaken();
        onClose();
        return;
      }

      const body = (await res.json()) as {
        depositId?: string;
        status?: string;
        error?: string;
      };

      if (!res.ok) {
        setErrorMsg(body.error ?? "Paiement impossible. Réessayez.");
        setStep("error");
        return;
      }

      if (body.status === "COMPLETED") {
        setStep("success");
        scheduleSuccess();
        return;
      }

      if (body.depositId) {
        pollStatus(body.depositId);
      } else {
        setErrorMsg("Réponse inattendue du service de paiement.");
        setStep("error");
      }
    } catch {
      setErrorMsg("Connexion impossible. Vérifiez votre réseau.");
      setStep("error");
    }
  }

  function pollStatus(depositId: string) {
    pollRef.current = setInterval(async () => {
      attemptsRef.current += 1;

      if (attemptsRef.current > MAX_ATTEMPTS) {
        stopPolling();
        setErrorMsg(
          "Délai d'attente dépassé. Vérifiez votre téléphone puis réessayez."
        );
        setStep("error");
        return;
      }

      try {
        const res = await fetch("/api/visites-3d/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ depositId }),
        });
        const data = (await res.json()) as { status?: string };
        if (data.status === "COMPLETED") {
          stopPolling();
          setStep("success");
          scheduleSuccess();
        } else if (data.status === "FAILED") {
          stopPolling();
          setErrorMsg("Paiement refusé. Vérifiez votre solde puis réessayez.");
          setStep("error");
        }
      } catch {
        // transient — keep polling
      }
    }, POLL_INTERVAL_MS);
  }

  if (!isOpen) return null;

  const canCloseBackdrop = step !== "processing";

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 md:items-center md:p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="absolute inset-0 bg-[#17120f]/70 backdrop-blur-sm"
          onClick={canCloseBackdrop ? onClose : undefined}
        />

        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.985 }}
          transition={
            reduce
              ? { duration: 0.12 }
              : { duration: 0.26, ease: [0.22, 1, 0.36, 1] }
          }
          className="relative w-full overflow-hidden rounded-t-[28px] bg-white shadow-2xl md:max-w-md md:rounded-[28px]"
        >
          <div className="flex items-start justify-between p-6 pb-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
                Paiement Mobile Money
              </p>
              <h3 className="mt-1 text-xl font-extrabold tracking-tight text-neutral-950">
                {formatFCFA(amount)}
              </h3>
              <p className="mt-1 text-xs text-neutral-500">
                Visite le {date} de {slot}
              </p>
            </div>
            {step !== "processing" && (
              <button
                onClick={onClose}
                aria-label="Fermer"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 transition-colors hover:bg-neutral-200"
              >
                <XIcon className="h-4 w-4" weight="bold" />
              </button>
            )}
          </div>

          <div className="px-6 pb-6">
            <AnimatePresence mode="wait" initial={false}>
              {step === "provider" && (
                <motion.div
                  key="provider"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, x: -12 }}
                  transition={{ duration: 0.22 }}
                  className="flex flex-col gap-3"
                >
                  <p className="mb-1 text-sm text-neutral-600">
                    Choisissez votre opérateur Mobile Money.
                  </p>
                  <ProviderTile
                    label="Orange Money"
                    code="OM"
                    colorBg="bg-orange-100"
                    colorText="text-orange-600"
                    onClick={() => {
                      setProvider("ORANGE_BFA");
                      setStep("phone");
                    }}
                  />
                  <ProviderTile
                    label="Moov Money"
                    code="MM"
                    colorBg="bg-blue-100"
                    colorText="text-blue-600"
                    onClick={() => {
                      setProvider("MOOV_BFA");
                      setStep("phone");
                    }}
                  />
                </motion.div>
              )}

              {step === "phone" && (
                <motion.div
                  key="phone"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, x: -12 }}
                  transition={{ duration: 0.22 }}
                  className="flex flex-col gap-4"
                >
                  <button
                    onClick={() => setStep("provider")}
                    className="self-start text-xs font-semibold text-neutral-500 transition-colors hover:text-neutral-950"
                  >
                    ← Changer d&apos;opérateur
                  </button>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-bold text-neutral-800">
                      Numéro Mobile Money
                    </span>
                    <div className="flex h-11 items-center gap-2 rounded-xl border border-neutral-200 px-3 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
                      <PhoneIcon className="h-4 w-4 text-neutral-400" />
                      <input
                        type="tel"
                        inputMode="tel"
                        value={paymentPhone}
                        onChange={(e) => setPaymentPhone(e.target.value)}
                        placeholder="+226 70 12 34 56"
                        className="flex-1 bg-transparent text-[15px] outline-none"
                        autoFocus
                      />
                    </div>
                    <span className="text-xs text-neutral-500">
                      Le numéro qui recevra la demande de paiement.
                    </span>
                  </label>
                  <button
                    onClick={() =>
                      provider === "ORANGE_BFA"
                        ? setStep("otp")
                        : initiatePayment()
                    }
                    disabled={paymentPhone.trim().length < 8}
                    className="w-full rounded-full bg-primary py-3.5 font-extrabold text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
                  >
                    Continuer
                  </button>
                </motion.div>
              )}

              {step === "otp" && (
                <motion.div
                  key="otp"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, x: -12 }}
                  transition={{ duration: 0.22 }}
                  className="flex flex-col gap-4"
                >
                  <button
                    onClick={() => setStep("phone")}
                    className="self-start text-xs font-semibold text-neutral-500 transition-colors hover:text-neutral-950"
                  >
                    ← Retour
                  </button>
                  <div className="rounded-xl border border-orange-100 bg-orange-50 p-4">
                    <p className="mb-1 text-xs font-bold text-orange-700">
                      Code de pré-autorisation Orange
                    </p>
                    <p className="text-xs leading-relaxed text-orange-700/80">
                      Composez <span className="font-bold">*144*4*6#</span> sur
                      votre téléphone Orange pour obtenir le code, puis
                      entrez-le ci-dessous.
                    </p>
                  </div>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-bold text-neutral-800">
                      Code reçu
                    </span>
                    <div className="flex h-11 items-center gap-2 rounded-xl border border-neutral-200 px-3 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
                      <LockIcon className="h-4 w-4 text-neutral-400" />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        placeholder="Code à 4 chiffres"
                        className="flex-1 bg-transparent text-[15px] tracking-widest outline-none"
                        autoFocus
                      />
                    </div>
                  </label>
                  <button
                    onClick={initiatePayment}
                    disabled={otp.trim().length < 4}
                    className="w-full rounded-full bg-primary py-3.5 font-extrabold text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
                  >
                    Payer {formatFCFA(amount)}
                  </button>
                </motion.div>
              )}

              {step === "processing" && (
                <motion.div
                  key="processing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col items-center gap-4 py-4 text-center"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                    <CircleNotchIcon className="h-6 w-6 animate-spin text-primary" />
                  </div>
                  <div>
                    <p className="font-extrabold text-neutral-950">
                      Confirmez sur votre téléphone…
                    </p>
                    <p className="mt-1 text-sm text-neutral-500">
                      Code envoyé au {paymentPhone}. Cela peut prendre
                      jusqu&apos;à 60 secondes.
                    </p>
                  </div>
                </motion.div>
              )}

              {step === "success" && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex flex-col items-center gap-4 py-4 text-center"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                    <CheckCircleIcon
                      className="h-7 w-7 text-green-600"
                      weight="fill"
                    />
                  </div>
                  <div>
                    <p className="font-extrabold text-neutral-950">
                      Réservation confirmée
                    </p>
                    <p className="mt-1 text-sm text-neutral-500">
                      Vous recevrez un SMS de confirmation dans un instant.
                    </p>
                  </div>
                </motion.div>
              )}

              {step === "error" && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col items-center gap-4 py-2 text-center"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
                    <WarningCircleIcon className="h-7 w-7 text-red-500" />
                  </div>
                  <div>
                    <p className="font-extrabold text-neutral-950">
                      Paiement non confirmé
                    </p>
                    <p className="mt-1 text-sm text-neutral-600">{errorMsg}</p>
                  </div>
                  <div className="flex w-full gap-2">
                    <button
                      onClick={resetState}
                      className="flex-1 rounded-full bg-primary py-3 font-extrabold text-white transition-colors hover:bg-primary-hover"
                    >
                      Réessayer
                    </button>
                    <button
                      onClick={onClose}
                      className="flex-1 rounded-full bg-neutral-100 py-3 font-extrabold text-neutral-900 transition-colors hover:bg-neutral-200"
                    >
                      Fermer
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <p className="px-6 pb-4 text-center text-[11px] text-neutral-400">
            Le créneau est bloqué 8 minutes le temps du paiement.
          </p>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function ProviderTile({
  label,
  code,
  colorBg,
  colorText,
  onClick,
}: {
  label: string;
  code: string;
  colorBg: string;
  colorText: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-4 rounded-[20px] border-2 border-neutral-200 p-4",
        "text-left transition-all hover:border-primary hover:bg-primary/5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      )}
    >
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-xl font-extrabold",
          colorBg,
          colorText
        )}
      >
        {code}
      </div>
      <div>
        <p className="font-bold text-neutral-950">{label}</p>
        <p className="text-xs text-neutral-500">Burkina Faso</p>
      </div>
    </button>
  );
}
