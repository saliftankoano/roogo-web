"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  PhoneIcon,
  WhatsappLogoIcon,
  MapPinIcon,
  HouseIcon,
  CheckCircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const BF_DIGITS = 8;

const bfPhone = z
  .string()
  .length(BF_DIGITS, `Numéro incomplet — ${BF_DIGITS} chiffres requis`)
  .regex(/^\d+$/, "Chiffres uniquement");

const ownerDetailsSchema = z
  .object({
    phone: bfPhone,
    whatsapp: z.string().optional(),
    isSameAsPhone: z.boolean(),
    propertyCity: z.enum(["Ouagadougou", "Bobo-Dioulasso"], {
      message: "Choisissez la ville du bien",
    }),
    propertyAvailable: z.enum(["oui", "non", "bientot"], {
      message: "Choisissez la disponibilité",
    }),
  })
  .superRefine((data, ctx) => {
    if (!data.isSameAsPhone && data.whatsapp !== undefined && data.whatsapp !== "") {
      if (data.whatsapp.length < BF_DIGITS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["whatsapp"],
          message: `Numéro incomplet — ${BF_DIGITS} chiffres requis`,
        });
      } else if (!/^\d+$/.test(data.whatsapp)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["whatsapp"],
          message: "Chiffres uniquement",
        });
      }
    }
  });

type FieldErrors = Partial<
  Record<"phone" | "whatsapp" | "propertyCity" | "propertyAvailable", string>
>;

interface OwnerDetailsStepProps {
  onNext: (details: {
    phone: string;
    whatsapp?: string;
    propertyCity: string;
    propertyAvailable: string;
  }) => void;
}

const CITIES = ["Ouagadougou", "Bobo-Dioulasso"] as const;
const AVAILABILITY_OPTIONS = [
  { id: "oui", label: "Oui, disponible immédiatement" },
  { id: "non", label: "Non, déjà loué" },
  { id: "bientot", label: "Bientôt disponible" },
] as const;

const CHIP =
  "px-5 py-2.5 rounded-xl font-bold text-sm transition-all border cursor-pointer select-none";
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

function PhoneInput({
  value,
  onChange,
  placeholder,
  hasError,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hasError?: boolean;
}) {
  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <span className="text-xs font-bold text-neutral-500">+226</span>
      </div>
      <Input
        type="tel"
        inputMode="numeric"
        maxLength={BF_DIGITS}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, BF_DIGITS))}
        placeholder={placeholder ?? "70000000"}
        className={`h-12 bg-[#1C1510] text-white rounded-xl pl-14 font-bold tracking-[0.15em] ${
          hasError
            ? "border-red-500/70 focus:ring-red-500"
            : "border-[#3D3027] focus:ring-primary"
        }`}
      />
      <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
        <span className={`text-xs font-bold tabular-nums ${value.length === BF_DIGITS ? "text-green-500" : "text-neutral-600"}`}>
          {value.length}/{BF_DIGITS}
        </span>
      </div>
    </div>
  );
}

export function OwnerDetailsStep({ onNext }: OwnerDetailsStepProps) {
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [isSameAsPhone, setIsSameAsPhone] = useState(false);
  const [propertyCity, setPropertyCity] = useState("");
  const [propertyAvailable, setPropertyAvailable] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [shakeKey, setShakeKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clearError = (field: keyof FieldErrors) =>
    setErrors((e) => ({ ...e, [field]: undefined }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = ownerDetailsSchema.safeParse({
      phone,
      whatsapp: isSameAsPhone ? undefined : whatsapp || undefined,
      isSameAsPhone,
      propertyCity: propertyCity || undefined,
      propertyAvailable: propertyAvailable || undefined,
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

    const fmt = (d: string) => `+226${d}`;
    onNext({
      phone: fmt(parsed.data.phone),
      whatsapp: isSameAsPhone
        ? fmt(parsed.data.phone)
        : parsed.data.whatsapp
          ? fmt(parsed.data.whatsapp)
          : undefined,
      propertyCity: parsed.data.propertyCity,
      propertyAvailable: parsed.data.propertyAvailable,
    });
  };

  return (
    <div className="space-y-8 w-full max-w-2xl py-8">
      <div className="space-y-3 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl font-bold text-white tracking-tight"
        >
          Détails de votre bien
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-neutral-400 leading-relaxed"
        >
          Ces informations nous aident à mieux référencer vos propriétés.
        </motion.p>
      </div>

      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        onSubmit={handleSubmit}
        className="space-y-8 text-left"
      >
        {/* Row 1 — Phone + WhatsApp */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <label className="text-sm font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
              <PhoneIcon size={16} weight="bold" className="text-primary" />
              Téléphone *
            </label>
            <PhoneInput
              value={phone}
              onChange={(v) => { setPhone(v); clearError("phone"); }}
              hasError={!!errors.phone}
            />
            <FieldError msg={errors.phone} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                <WhatsappLogoIcon size={16} weight="bold" className="text-green-500" />
                WhatsApp
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-neutral-500 uppercase font-bold">Identique</span>
                <Switch
                  checked={isSameAsPhone}
                  onCheckedChange={(v) => { setIsSameAsPhone(v); clearError("whatsapp"); }}
                  className="scale-75"
                />
              </div>
            </div>
            {!isSameAsPhone ? (
              <PhoneInput
                value={whatsapp}
                onChange={(v) => { setWhatsapp(v); clearError("whatsapp"); }}
                hasError={!!errors.whatsapp}
              />
            ) : (
              <div className="h-12 bg-[#1C1510]/50 border border-[#3D3027]/50 rounded-xl flex items-center px-4 text-neutral-500 italic text-sm">
                Utilise le numéro ci-dessus
              </div>
            )}
            <FieldError msg={errors.whatsapp} />
          </div>
        </div>

        {/* Row 2 — City + Availability */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <label className="text-sm font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
              <MapPinIcon size={16} weight="bold" className="text-primary" />
              Ville du bien *
            </label>
            <div className="flex flex-wrap gap-2">
              {CITIES.map((city) => (
                <button
                  key={city}
                  type="button"
                  onClick={() => { setPropertyCity(city); clearError("propertyCity"); }}
                  className={`${CHIP} ${propertyCity === city ? CHIP_ACTIVE : errors.propertyCity ? CHIP_ERROR : CHIP_IDLE}`}
                >
                  {city}
                </button>
              ))}
            </div>
            <FieldError msg={errors.propertyCity} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
              <HouseIcon size={16} weight="bold" className="text-primary" />
              Disponibilité *
            </label>
            <div className="flex flex-col gap-2">
              {AVAILABILITY_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => { setPropertyAvailable(option.id); clearError("propertyAvailable"); }}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm transition-all border ${
                    propertyAvailable === option.id ? CHIP_ACTIVE : errors.propertyAvailable ? CHIP_ERROR : CHIP_IDLE
                  }`}
                >
                  {option.label}
                  {propertyAvailable === option.id && <CheckCircleIcon size={18} weight="fill" />}
                </button>
              ))}
            </div>
            <FieldError msg={errors.propertyAvailable} />
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
