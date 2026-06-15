"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  WhatsappLogoIcon,
  MapPinIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/switch";
import { PhoneNumberInput } from "@/components/ui/PhoneNumberInput";
import { normalizePhone, parseStoredPhone } from "@/lib/phone";
import { AcquisitionSourceField } from "@/components/onboarding/AcquisitionSourceField";
import {
  REFERRAL_SOURCE_OTHER,
  REFERRAL_SOURCE_SOCIAL,
} from "@/lib/acquisition-source";
import { CITY_OPTIONS } from "@/lib/validations";

type FieldErrors = Partial<
  Record<
    | "phone"
    | "whatsapp"
    | "serviceAreas"
    | "referralSource"
    | "socialPlatform"
    | "referralSourceDetail",
    string
  >
>;

interface AgentDetailsStepProps {
  onNext: (details: {
    phone: string;
    whatsapp?: string;
    serviceAreas: string[];
    referralSource: string;
    socialPlatform?: string;
    referralSourceDetail?: string;
  }) => void;
  initialValues?: {
    phone?: string | null;
    whatsapp?: string | null;
    serviceAreas?: string[] | null;
    referralSource?: string | null;
    socialPlatform?: string | null;
    referralSourceDetail?: string | null;
    referralSourceOther?: string | null;
  };
}

const SERVICE_AREAS = CITY_OPTIONS.map((city) => city.label);

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

export function AgentDetailsStep({
  onNext,
  initialValues,
}: AgentDetailsStepProps) {
  const [phoneIso, setPhoneIso] = useState("BF");
  const [phoneNational, setPhoneNational] = useState("");
  const [whatsappIso, setWhatsappIso] = useState("BF");
  const [whatsappNational, setWhatsappNational] = useState("");
  const [isSameAsPhone, setIsSameAsPhone] = useState(true);
  const [serviceAreas, setServiceAreas] = useState<string[]>([]);
  const [referralSource, setReferralSource] = useState("");
  const [socialPlatform, setSocialPlatform] = useState("");
  const [referralSourceDetail, setReferralSourceDetail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [shakeKey, setShakeKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clearError = (field: keyof FieldErrors) =>
    setErrors((e) => ({ ...e, [field]: undefined }));

  useEffect(() => {
    const parsedPhone = parseStoredPhone(initialValues?.phone);
    const parsedWa = parseStoredPhone(initialValues?.whatsapp);
    const sameAsPhone = !parsedWa || parsedPhone?.national === parsedWa.national;

    setPhoneIso(parsedPhone?.iso ?? "BF");
    setPhoneNational(parsedPhone?.national ?? "");
    setWhatsappIso(sameAsPhone ? (parsedPhone?.iso ?? "BF") : (parsedWa?.iso ?? "BF"));
    setWhatsappNational(sameAsPhone ? (parsedPhone?.national ?? "") : (parsedWa?.national ?? ""));
    setIsSameAsPhone(Boolean(sameAsPhone));
    setServiceAreas(initialValues?.serviceAreas ?? []);
    setReferralSource(initialValues?.referralSource ?? "");
    setSocialPlatform(initialValues?.socialPlatform ?? "");
    setReferralSourceDetail(
      initialValues?.referralSourceDetail ??
        initialValues?.referralSourceOther ??
        "",
    );
    setErrors({});
  }, [initialValues]);

  useEffect(() => {
    if (isSameAsPhone) {
      setWhatsappIso(phoneIso);
      setWhatsappNational(phoneNational);
    }
  }, [isSameAsPhone, phoneIso, phoneNational]);

  const toggleArea = (area: string) => {
    setServiceAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area],
    );
    clearError("serviceAreas");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: FieldErrors = {};
    const phoneE164 = normalizePhone(phoneNational, phoneIso);
    if (!phoneE164) newErrors.phone = "Numéro de téléphone invalide";

    const whatsappE164 = isSameAsPhone
      ? phoneE164
      : normalizePhone(whatsappNational, whatsappIso);
    if (!isSameAsPhone && !whatsappE164) newErrors.whatsapp = "Numéro WhatsApp invalide";

    if (serviceAreas.length === 0) newErrors.serviceAreas = "Sélectionnez au moins une zone";
    if (!referralSource) newErrors.referralSource = "Indiquez comment vous nous avez trouvés";
    if (referralSource === REFERRAL_SOURCE_SOCIAL && !socialPlatform) {
      newErrors.socialPlatform = "Choisissez le réseau social";
    }
    if (referralSource === REFERRAL_SOURCE_OTHER && !referralSourceDetail.trim()) {
      newErrors.referralSourceDetail = "Précisez comment vous nous avez trouvés";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setShakeKey((k) => k + 1);
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    onNext({
      phone: phoneE164!,
      whatsapp: isSameAsPhone ? phoneE164! : whatsappE164 ?? undefined,
      serviceAreas,
      referralSource,
      ...(socialPlatform ? { socialPlatform } : {}),
      ...(referralSourceDetail.trim()
        ? { referralSourceDetail: referralSourceDetail.trim() }
        : {}),
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
          <PhoneNumberInput
            iso={phoneIso}
            national={phoneNational}
            onIsoChange={(iso) => { setPhoneIso(iso); clearError("phone"); }}
            onNationalChange={(n) => { setPhoneNational(n); clearError("phone"); }}
            label="Téléphone professionnel"
            required
            error={errors.phone}
            variant="dark"
          />

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
              <PhoneNumberInput
                iso={whatsappIso}
                national={whatsappNational}
                onIsoChange={(iso) => { setWhatsappIso(iso); clearError("whatsapp"); }}
                onNationalChange={(n) => { setWhatsappNational(n); clearError("whatsapp"); }}
                error={errors.whatsapp}
                variant="dark"
                prefixIcon={<WhatsappLogoIcon size={16} weight="fill" className="text-green-500" />}
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

          <AcquisitionSourceField
            referralSource={referralSource}
            socialPlatform={socialPlatform}
            referralSourceDetail={referralSourceDetail}
            errors={errors}
            onReferralSourceChange={(source) => {
              setReferralSource(source);
              if (source !== REFERRAL_SOURCE_SOCIAL) setSocialPlatform("");
              if (source !== REFERRAL_SOURCE_OTHER) setReferralSourceDetail("");
              setErrors((current) => ({
                ...current,
                referralSource: undefined,
                socialPlatform: undefined,
                referralSourceDetail: undefined,
              }));
            }}
            onSocialPlatformChange={(platform) => {
              setSocialPlatform(platform);
              setErrors((current) => ({ ...current, socialPlatform: undefined }));
            }}
            onReferralSourceDetailChange={(detail) => {
              setReferralSourceDetail(detail);
              setErrors((current) => ({
                ...current,
                referralSourceDetail: undefined,
              }));
            }}
          />
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
