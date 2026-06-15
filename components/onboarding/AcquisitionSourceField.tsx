"use client";

import {
  CheckCircleIcon,
  FacebookLogoIcon,
  InstagramLogoIcon,
  MagnifyingGlassIcon,
  TiktokLogoIcon,
  WhatsappLogoIcon,
} from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import {
  REFERRAL_SOURCE_OTHER,
  REFERRAL_SOURCE_SOCIAL,
  REFERRAL_SOURCES,
  SOCIAL_PLATFORMS,
} from "@/lib/acquisition-source";

type AcquisitionSourceErrors = {
  referralSource?: string;
  socialPlatform?: string;
  referralSourceDetail?: string;
};

type AcquisitionSourceFieldProps = {
  referralSource: string;
  socialPlatform: string;
  referralSourceDetail: string;
  errors?: AcquisitionSourceErrors;
  onReferralSourceChange: (source: string) => void;
  onSocialPlatformChange: (platform: string) => void;
  onReferralSourceDetailChange: (detail: string) => void;
};

const CHIP_ACTIVE = "bg-primary border-primary text-white shadow-lg shadow-primary/20";
const CHIP_IDLE = "bg-[#1C1510] border-[#3D3027] text-neutral-400 hover:border-[#5A4535]";
const CHIP_ERROR = "bg-[#1C1510] border-red-500/50 text-neutral-400 hover:border-red-400";

const SOCIAL_PLATFORM_ICONS = {
  Facebook: FacebookLogoIcon,
  Instagram: InstagramLogoIcon,
  TikTok: TiktokLogoIcon,
  WhatsApp: WhatsappLogoIcon,
} as const;

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs font-semibold text-red-400">{msg}</p>;
}

export function AcquisitionSourceField({
  referralSource,
  socialPlatform,
  referralSourceDetail,
  errors,
  onReferralSourceChange,
  onSocialPlatformChange,
  onReferralSourceDetailChange,
}: AcquisitionSourceFieldProps) {
  const showSocialPlatforms = referralSource === REFERRAL_SOURCE_SOCIAL;
  const showOtherDetail = referralSource === REFERRAL_SOURCE_OTHER;

  return (
    <div className="space-y-3">
      <label className="text-sm font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
        <MagnifyingGlassIcon size={16} weight="bold" className="text-primary" />
        Comment nous avez-vous connu ? *
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {REFERRAL_SOURCES.map((source) => (
          <button
            key={source}
            type="button"
            onClick={() => onReferralSourceChange(source)}
            className={`flex items-center justify-between px-4 py-2.5 rounded-xl font-bold text-sm transition-all border ${
              referralSource === source
                ? CHIP_ACTIVE
                : errors?.referralSource
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
      <FieldError msg={errors?.referralSource} />

      {showSocialPlatforms && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SOCIAL_PLATFORMS.map((platform) => {
              const Icon = SOCIAL_PLATFORM_ICONS[platform];
              return (
                <button
                  key={platform}
                  type="button"
                  onClick={() => onSocialPlatformChange(platform)}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-3 py-3 text-xs font-bold transition-all ${
                    socialPlatform === platform
                      ? CHIP_ACTIVE
                      : errors?.socialPlatform
                        ? CHIP_ERROR
                        : CHIP_IDLE
                  }`}
                >
                  <Icon size={22} weight="fill" />
                  {platform}
                </button>
              );
            })}
          </div>
          <FieldError msg={errors?.socialPlatform} />
        </div>
      )}

      {showOtherDetail && (
        <div className="space-y-1">
          <Input
            value={referralSourceDetail}
            onChange={(event) => onReferralSourceDetailChange(event.target.value)}
            placeholder="Précisez ici..."
            className={`h-12 rounded-xl bg-[#1C1510] text-white font-bold ${
              errors?.referralSourceDetail
                ? "border-red-500/70 focus-visible:ring-red-500"
                : "border-[#3D3027] focus-visible:ring-primary"
            }`}
          />
          <FieldError msg={errors?.referralSourceDetail} />
        </div>
      )}
    </div>
  );
}
