"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  WhatsappLogoIcon,
  MapPinIcon,
  HouseIcon,
  BellIcon,
  CheckCircleIcon,
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
    | "propertyCity"
    | "propertyAvailable"
    | "referralSource"
    | "socialPlatform"
    | "referralSourceDetail",
    string
  >
>;

interface OwnerNotifications {
  viewingRequests: boolean;
  messages: boolean;
  payments: boolean;
}

interface OwnerDetailsStepProps {
  onNext: (details: {
    phone: string;
    whatsapp?: string;
    propertyCity: string;
    propertyAvailable: string;
    notifications: OwnerNotifications;
    referralSource: string;
    socialPlatform?: string;
    referralSourceDetail?: string;
  }) => void;
  initialValues?: {
    phone?: string | null;
    whatsapp?: string | null;
    propertyCity?: string | null;
    propertyAvailable?: string | null;
    notifications?: Partial<OwnerNotifications> | null;
    referralSource?: string | null;
    socialPlatform?: string | null;
    referralSourceDetail?: string | null;
    referralSourceOther?: string | null;
  };
}

const CITIES = CITY_OPTIONS.map((city) => city.label);
const AVAILABILITY_OPTIONS = [
  { id: "Oui, maintenant", label: "Oui, disponible maintenant" },
  { id: "Dans 1-2 semaines", label: "Dans 1-2 semaines" },
  { id: "Dans 1-3 mois", label: "Dans 1-3 mois" },
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

export function OwnerDetailsStep({
  onNext,
  initialValues,
}: OwnerDetailsStepProps) {
  const [phoneIso, setPhoneIso] = useState("BF");
  const [phoneNational, setPhoneNational] = useState("");
  const [whatsappIso, setWhatsappIso] = useState("BF");
  const [whatsappNational, setWhatsappNational] = useState("");
  const [isSameAsPhone, setIsSameAsPhone] = useState(true);
  const [propertyCity, setPropertyCity] = useState("");
  const [propertyAvailable, setPropertyAvailable] = useState("");
  const [referralSource, setReferralSource] = useState("");
  const [socialPlatform, setSocialPlatform] = useState("");
  const [referralSourceDetail, setReferralSourceDetail] = useState("");
  const [notifications, setNotifications] = useState<OwnerNotifications>({
    viewingRequests: true,
    messages: true,
    payments: true,
  });
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
    setPropertyCity(initialValues?.propertyCity ?? "");
    setPropertyAvailable(initialValues?.propertyAvailable ?? "");
    setReferralSource(initialValues?.referralSource ?? "");
    setSocialPlatform(initialValues?.socialPlatform ?? "");
    setReferralSourceDetail(
      initialValues?.referralSourceDetail ??
        initialValues?.referralSourceOther ??
        "",
    );
    setNotifications({
      viewingRequests: initialValues?.notifications?.viewingRequests ?? true,
      messages: initialValues?.notifications?.messages ?? true,
      payments: initialValues?.notifications?.payments ?? true,
    });
    setErrors({});
  }, [initialValues]);

  useEffect(() => {
    if (isSameAsPhone) {
      setWhatsappIso(phoneIso);
      setWhatsappNational(phoneNational);
    }
  }, [isSameAsPhone, phoneIso, phoneNational]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: FieldErrors = {};
    const phoneE164 = normalizePhone(phoneNational, phoneIso);
    if (!phoneE164) newErrors.phone = "Numéro de téléphone invalide";

    const whatsappE164 = isSameAsPhone
      ? phoneE164
      : normalizePhone(whatsappNational, whatsappIso);
    if (!isSameAsPhone && !whatsappE164) newErrors.whatsapp = "Numéro WhatsApp invalide";

    if (!propertyCity) newErrors.propertyCity = "Choisissez la ville du bien";
    if (!propertyAvailable) newErrors.propertyAvailable = "Choisissez la disponibilité";
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
      propertyCity,
      propertyAvailable,
      notifications,
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
          <PhoneNumberInput
            iso={phoneIso}
            national={phoneNational}
            onIsoChange={(iso) => { setPhoneIso(iso); clearError("phone"); }}
            onNationalChange={(n) => { setPhoneNational(n); clearError("phone"); }}
            label="Téléphone"
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

        {/* Row 3 — Acquisition source */}
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

        {/* Row 4 — Notifications */}
        <div className="space-y-3">
          <label className="text-sm font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
            <BellIcon size={16} weight="bold" className="text-primary" />
            Notifications
          </label>
          <div className="bg-[#1C1510] border border-[#3D3027] rounded-xl divide-y divide-[#3D3027]">
            {(
              [
                { key: "viewingRequests", label: "Demandes de visite" },
                { key: "messages", label: "Messages" },
                { key: "payments", label: "Paiements" },
              ] as { key: keyof OwnerNotifications; label: string }[]
            ).map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-medium text-neutral-300">{label}</span>
                <Switch
                  checked={notifications[key]}
                  onCheckedChange={(v) =>
                    setNotifications((n) => ({ ...n, [key]: v }))
                  }
                />
              </div>
            ))}
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
