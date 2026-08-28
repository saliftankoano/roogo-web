"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { AcquisitionSourceField } from "@/components/onboarding/AcquisitionSourceField";
import {
  REFERRAL_SOURCE_OTHER,
  REFERRAL_SOURCE_SOCIAL,
} from "@/lib/acquisition-source";

type MetadataStatus = {
  userType: string | null;
  hasCompletedMobileOnboarding: boolean;
  hasCompletedWebOnboarding: boolean;
  hasReferralSource: boolean;
};

type FieldErrors = {
  referralSource?: string;
  socialPlatform?: string;
  referralSourceDetail?: string;
  form?: string;
};

function isGateExemptPath(pathname: string) {
  return (
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/connexion") ||
    pathname.startsWith("/inscription") ||
    pathname.startsWith("/blog") ||
    pathname.startsWith("/tutoriels") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/personnel")
  );
}

export function AcquisitionSourceGate() {
  const pathname = usePathname();
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const [status, setStatus] = useState<MetadataStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [referralSource, setReferralSource] = useState("");
  const [socialPlatform, setSocialPlatform] = useState("");
  const [referralSourceDetail, setReferralSourceDetail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (!isLoaded || !user || isGateExemptPath(pathname)) return;

    const publicMetadata =
      (user.publicMetadata as Record<string, unknown> | undefined) ?? {};
    const userType =
      typeof publicMetadata.userType === "string" ? publicMetadata.userType : null;
    const isExemptRole = userType === "staff" || userType === "founder";
    const hasCompleted =
      publicMetadata.hasCompletedWebOnboarding === true ||
      publicMetadata.hasCompletedMobileOnboarding === true ||
      publicMetadata.hasCompletedOnboarding === true;

    if (!hasCompleted || isExemptRole) {
      setStatus(null);
      return;
    }

    let cancelled = false;
    async function loadStatus() {
      setIsLoading(true);
      try {
        const token = await getToken();
        if (!token) return;
        const response = await fetch("/api/clerk/users/me/metadata", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const data = (await response.json()) as MetadataStatus;
        if (!cancelled) setStatus(data);
      } catch (error) {
        console.error("Failed to check acquisition source status:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadStatus();

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, pathname, user]);

  const shouldShow = useMemo(() => {
    if (!status || isLoading) return false;
    const hasCompleted =
      status.hasCompletedMobileOnboarding || status.hasCompletedWebOnboarding;
    return (
      hasCompleted &&
      !status.hasReferralSource &&
      status.userType !== "staff" &&
      status.userType !== "founder"
    );
  }, [isLoading, status]);

  if (!shouldShow) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: FieldErrors = {};
    if (!referralSource) {
      nextErrors.referralSource = "Indiquez comment vous nous avez trouvés";
    }
    if (referralSource === REFERRAL_SOURCE_SOCIAL && !socialPlatform) {
      nextErrors.socialPlatform = "Choisissez le réseau social";
    }
    if (referralSource === REFERRAL_SOURCE_OTHER && !referralSourceDetail.trim()) {
      nextErrors.referralSourceDetail = "Précisez comment vous nous avez trouvés";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setIsSubmitting(true);
    setErrors({});
    try {
      const token = await getToken();
      if (!token) throw new Error("Session introuvable");
      const response = await fetch("/api/clerk/users/me/metadata", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          webOnboardingData: {
            referralSource,
            ...(socialPlatform ? { socialPlatform } : {}),
            ...(referralSourceDetail.trim()
              ? { referralSourceDetail: referralSourceDetail.trim() }
              : {}),
          },
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Impossible d'enregistrer la source");
      }
      setStatus((current) =>
        current ? { ...current, hasReferralSource: true } : current,
      );
      await user?.reload();
    } catch (error) {
      console.error("Failed to save acquisition source:", error);
      setErrors({
        form: "Impossible d'enregistrer votre réponse. Veuillez réessayer.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#0f0c0a]/90 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl rounded-2xl border border-[#3D3027] bg-[#0f0c0a] p-6 shadow-2xl"
      >
        <div className="mb-6 space-y-2 text-center">
          <h2 className="text-2xl font-bold text-white">
            Dernière question
          </h2>
          <p className="text-sm font-medium text-neutral-400">
            Comment avez-vous découvert Roogo ?
          </p>
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
            setErrors({});
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

        {errors.form && (
          <p className="mt-4 text-sm font-semibold text-red-400">{errors.form}</p>
        )}

        <Button
          type="submit"
          disabled={isSubmitting}
          variant="primary"
          size="lg"
          className="mt-6 h-12 w-full rounded-xl font-bold"
        >
          {isSubmitting ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </form>
    </div>
  );
}
