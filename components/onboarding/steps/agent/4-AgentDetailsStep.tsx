"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  PhoneIcon,
  WhatsappLogoIcon,
  MapPinIcon,
  MagnifyingGlassIcon,
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

const agentDetailsSchema = z
  .object({
    phone: bfPhone,
    whatsapp: z.string().optional(),
    isSameAsPhone: z.boolean(),
    serviceAreas: z
      .array(z.enum(["Ouagadougou", "Bobo-Dioulasso"]))
      .min(1, "Sélectionnez au moins une zone"),
    referralSource: z.enum(
      ["Réseaux sociaux", "Bouche à oreille", "Google", "Publicité", "Autre"],
      { message: "Indiquez comment vous nous avez trouvés" },
    ),
  })
  .superRefine((data, ctx) => {
    if (!data.isSameAsPhone) {
      if (!data.whatsapp) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["whatsapp"],
          message: "Entrez votre numéro WhatsApp",
        });
      } else if (data.whatsapp.length !== BF_DIGITS) {
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
  Record<"phone" | "whatsapp" | "serviceAreas" | "referralSource", string>
>;

interface AgentDetailsStepProps {
  onNext: (details: {
    phone: string;
    whatsapp?: string;
    serviceAreas: string[];
    referralSource: string;
  }) => void;
  initialValues?: {
    phone?: string | null;
    whatsapp?: string | null;
    serviceAreas?: string[] | null;
    referralSource?: string | null;
  };
}

const SERVICE_AREAS = ["Ouagadougou", "Bobo-Dioulasso"] as const;
const REFERRAL_SOURCES = [
  "Réseaux sociaux",
  "Bouche à oreille",
  "Google",
  "Publicité",
  "Autre",
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
  hasError,
}: {
  value: string;
  onChange: (v: string) => void;
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
        placeholder="70000000"
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

function getLocalPhoneDigits(value?: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("226")) return digits.slice(3);
  if (digits.length === 9 && digits.startsWith("0")) return digits.slice(1);
  return digits.slice(0, BF_DIGITS);
}

export function AgentDetailsStep({
  onNext,
  initialValues,
}: AgentDetailsStepProps) {
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [isSameAsPhone, setIsSameAsPhone] = useState(true);
  const [serviceAreas, setServiceAreas] = useState<string[]>([]);
  const [referralSource, setReferralSource] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [shakeKey, setShakeKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clearError = (field: keyof FieldErrors) =>
    setErrors((e) => ({ ...e, [field]: undefined }));

  useEffect(() => {
    const initialPhone = getLocalPhoneDigits(initialValues?.phone);
    const initialWhatsapp = getLocalPhoneDigits(initialValues?.whatsapp);
    const sameAsPhone =
      !initialWhatsapp || (initialPhone && initialPhone === initialWhatsapp);

    setPhone(initialPhone);
    setWhatsapp(sameAsPhone ? initialPhone : initialWhatsapp);
    setIsSameAsPhone(Boolean(sameAsPhone));
    setServiceAreas(initialValues?.serviceAreas ?? []);
    setReferralSource(initialValues?.referralSource ?? "");
    setErrors({});
  }, [initialValues]);

  useEffect(() => {
    if (isSameAsPhone) setWhatsapp(phone);
  }, [isSameAsPhone, phone]);

  const toggleArea = (area: string) => {
    setServiceAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area],
    );
    clearError("serviceAreas");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = agentDetailsSchema.safeParse({
      phone,
      whatsapp: isSameAsPhone ? undefined : whatsapp || undefined,
      isSameAsPhone,
      serviceAreas,
      referralSource: referralSource || undefined,
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
      serviceAreas: parsed.data.serviceAreas,
      referralSource: parsed.data.referralSource,
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
          Contact et zones d&apos;activité
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-neutral-400 leading-relaxed"
        >
          Ces informations nous permettent de vous mettre en relation avec les bons clients.
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
              Téléphone professionnel *
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
                Utilise le numéro professionnel
              </div>
            )}
            <FieldError msg={errors.whatsapp} />
          </div>
        </div>

        {/* Row 2 — Service areas + Referral */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <label className="text-sm font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
              <MapPinIcon size={16} weight="bold" className="text-primary" />
              Zones d&apos;activité *
            </label>
            <div className="flex flex-wrap gap-2">
              {SERVICE_AREAS.map((area) => (
                <button
                  key={area}
                  type="button"
                  onClick={() => toggleArea(area)}
                  className={`${CHIP} ${serviceAreas.includes(area) ? CHIP_ACTIVE : errors.serviceAreas ? CHIP_ERROR : CHIP_IDLE}`}
                >
                  {area}
                </button>
              ))}
            </div>
            <FieldError msg={errors.serviceAreas} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
              <MagnifyingGlassIcon size={16} weight="bold" className="text-primary" />
              Comment nous avez-vous connu ? *
            </label>
            <div className="flex flex-col gap-2">
              {REFERRAL_SOURCES.map((source) => (
                <button
                  key={source}
                  type="button"
                  onClick={() => { setReferralSource(source); clearError("referralSource"); }}
                  className={`flex items-center justify-between px-4 py-2.5 rounded-xl font-bold text-sm transition-all border ${
                    referralSource === source
                      ? CHIP_ACTIVE
                      : errors.referralSource
                        ? CHIP_ERROR
                        : CHIP_IDLE
                  }`}
                >
                  {source}
                  {referralSource === source && (
                    <CheckCircleIcon size={18} weight="fill" />
                  )}
                </button>
              ))}
            </div>
            <FieldError msg={errors.referralSource} />
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
