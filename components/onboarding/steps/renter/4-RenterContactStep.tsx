"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { PhoneIcon, BellIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/switch";
import { PhoneNumberInput } from "@/components/ui/PhoneNumberInput";
import { normalizePhone, parseStoredPhone } from "@/lib/phone";
import { AcquisitionSourceField } from "@/components/onboarding/AcquisitionSourceField";
import {
  REFERRAL_SOURCE_OTHER,
  REFERRAL_SOURCE_SOCIAL,
} from "@/lib/acquisition-source";

type FieldErrors = {
  phone?: string;
  referralSource?: string;
  socialPlatform?: string;
  referralSourceDetail?: string;
};

interface RenterContactStepProps {
  onNext: (info: {
    phone: string;
    notifications: { newListings: boolean };
    referralSource: string;
    socialPlatform?: string;
    referralSourceDetail?: string;
  }) => void;
  initialValues?: {
    phone?: string | null;
    notifications?: { newListings?: boolean } | null;
    referralSource?: string | null;
    socialPlatform?: string | null;
    referralSourceDetail?: string | null;
    referralSourceOther?: string | null;
  };
}

export function RenterContactStep({
  onNext,
  initialValues,
}: RenterContactStepProps) {
  const [phoneIso, setPhoneIso] = useState("BF");
  const [phoneNational, setPhoneNational] = useState("");
  const [newListings, setNewListings] = useState(true);
  const [referralSource, setReferralSource] = useState("");
  const [socialPlatform, setSocialPlatform] = useState("");
  const [referralSourceDetail, setReferralSourceDetail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [shakeKey, setShakeKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const parsed = parseStoredPhone(initialValues?.phone);
    setPhoneIso(parsed?.iso ?? "BF");
    setPhoneNational(parsed?.national ?? "");
    setNewListings(initialValues?.notifications?.newListings ?? true);
    setReferralSource(initialValues?.referralSource ?? "");
    setSocialPlatform(initialValues?.socialPlatform ?? "");
    setReferralSourceDetail(
      initialValues?.referralSourceDetail ??
        initialValues?.referralSourceOther ??
        "",
    );
    setErrors({});
  }, [initialValues]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: FieldErrors = {};
    const e164 = normalizePhone(phoneNational, phoneIso);
    if (!e164) newErrors.phone = "Numéro de téléphone invalide";
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
      phone: e164!,
      notifications: { newListings },
      referralSource,
      ...(socialPlatform ? { socialPlatform } : {}),
      ...(referralSourceDetail.trim()
        ? { referralSourceDetail: referralSourceDetail.trim() }
        : {}),
    });
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
          <PhoneNumberInput
            iso={phoneIso}
            national={phoneNational}
            onIsoChange={(iso) => { setPhoneIso(iso); setErrors({}); }}
            onNationalChange={(n) => { setPhoneNational(n); setErrors({}); }}
            label="Numéro de téléphone"
            required
            error={errors.phone}
            variant="dark"
          />
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
