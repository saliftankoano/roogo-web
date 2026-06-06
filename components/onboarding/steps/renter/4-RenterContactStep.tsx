"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { PhoneIcon, BellIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const BF_DIGITS = 8;

const contactSchema = z.object({
  phone: z
    .string()
    .length(BF_DIGITS, `Numéro incomplet — ${BF_DIGITS} chiffres requis`)
    .regex(/^\d+$/, "Chiffres uniquement"),
});

type FieldErrors = { phone?: string };

interface RenterContactStepProps {
  onNext: (info: { phone: string; notifications: { newListings: boolean } }) => void;
  initialValues?: {
    phone?: string | null;
    notifications?: { newListings?: boolean } | null;
  };
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs text-red-400 mt-1.5">
      <WarningCircleIcon size={13} weight="fill" />
      {msg}
    </p>
  );
}

function getLocalPhoneDigits(value?: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("226")) return digits.slice(3);
  if (digits.length === 9 && digits.startsWith("0")) return digits.slice(1);
  return digits.slice(0, BF_DIGITS);
}

export function RenterContactStep({
  onNext,
  initialValues,
}: RenterContactStepProps) {
  const [phone, setPhone] = useState("");
  const [newListings, setNewListings] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [shakeKey, setShakeKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setPhone(getLocalPhoneDigits(initialValues?.phone));
    setNewListings(initialValues?.notifications?.newListings ?? true);
    setErrors({});
  }, [initialValues]);

  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, BF_DIGITS);
    setPhone(digits);
    setErrors({});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = contactSchema.safeParse({ phone });
    if (!parsed.success) {
      setErrors({ phone: parsed.error.issues[0]?.message });
      setShakeKey((k) => k + 1);
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    onNext({ phone: `+226${parsed.data.phone}`, notifications: { newListings } });
  };

  return (
    <div className="space-y-8 w-full max-w-md">
      <motion.div
        initial={{ scale: 0.3, opacity: 0, rotate: 180 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ duration: 0.9, ease: [0.34, 1.56, 0.64, 1] }}
        className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto shadow-xl border border-primary/20"
      >
        <PhoneIcon size={40} weight="fill" className="text-primary" />
      </motion.div>

      <div className="space-y-3 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl font-bold text-white tracking-tight"
        >
          Comment vous joindre ?
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-neutral-400 leading-relaxed"
        >
          Nous avons besoin de votre numéro pour vous contacter
          dès qu&apos;un bien correspond à votre recherche.
        </motion.p>
      </div>

      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        onSubmit={handleSubmit}
        className="space-y-6 text-left"
      >
        <div className="space-y-2">
          <label className="text-sm font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
            <PhoneIcon size={14} weight="bold" className="text-primary" />
            Numéro de téléphone *
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <span className="text-sm font-bold text-neutral-500">+226</span>
            </div>
            <Input
              type="tel"
              inputMode="numeric"
              maxLength={BF_DIGITS}
              value={phone}
              onChange={(e) => handleChange(e.target.value)}
              placeholder="70000000"
              className={`h-14 bg-[#1C1510] text-white rounded-xl pl-16 text-lg font-bold tracking-[0.2em] ${
                errors.phone
                  ? "border-red-500/70 focus:ring-red-500"
                  : "border-[#3D3027] focus:ring-primary"
              }`}
            />
            <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
              <span className={`text-xs font-bold tabular-nums ${phone.length === BF_DIGITS ? "text-green-500" : "text-neutral-600"}`}>
                {phone.length}/{BF_DIGITS}
              </span>
            </div>
          </div>
          <FieldError msg={errors.phone} />
        </div>

        {/* Notifications */}
        <div className="space-y-2">
          <label className="text-sm font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
            <BellIcon size={14} weight="bold" className="text-primary" />
            Notifications
          </label>
          <div className="bg-[#1C1510] border border-[#3D3027] rounded-xl">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-medium text-neutral-300">
                Nouvelles annonces correspondant à ma recherche
              </span>
              <Switch checked={newListings} onCheckedChange={setNewListings} />
            </div>
          </div>
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
