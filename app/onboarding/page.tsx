"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { WelcomeStep } from "@/components/onboarding/steps/1-WelcomeStep";
import { UserTypeStep } from "@/components/onboarding/steps/2-UserTypeStep";
import { RenterPreferencesStep } from "@/components/onboarding/steps/renter/3-RenterPreferencesStep";
import { RenterContactStep } from "@/components/onboarding/steps/renter/4-RenterContactStep";
import { RenterReadyStep } from "@/components/onboarding/steps/renter/5-RenterReadyStep";
import { OwnerDetailsStep } from "@/components/onboarding/steps/owner/3-OwnerDetailsStep";
import { OwnerReadyStep } from "@/components/onboarding/steps/owner/4-OwnerReadyStep";
import { AgentInfoStep } from "@/components/onboarding/steps/agent/3-AgentInfoStep";
import { AgentDetailsStep } from "@/components/onboarding/steps/agent/4-AgentDetailsStep";
import { AgentReadyStep } from "@/components/onboarding/steps/agent/5-AgentReadyStep";

type RoogoUserType = "renter" | "owner" | "agent" | "staff" | "founder" | "regular";

function hasCompletedOnboarding(metadata: Record<string, unknown>) {
  return (
    metadata.hasCompletedWebOnboarding === true ||
    metadata.hasCompletedMobileOnboarding === true ||
    metadata.hasCompletedOnboarding === true
  );
}

function getRedirectPath(userType?: RoogoUserType) {
  return userType === "renter" ? "/proprietes" : "/mes-proprietes";
}

function getTotalSteps(userType?: RoogoUserType) {
  if (userType === "agent") return 5;
  if (userType === "renter") return 5;
  if (userType === "owner") return 4;
  return 2;
}

function clampStep(step: unknown, userType?: RoogoUserType) {
  const parsedStep =
    typeof step === "number"
      ? step
      : typeof step === "string"
        ? Number(step)
        : 1;

  if (!Number.isFinite(parsedStep)) {
    return 1;
  }

  return Math.min(Math.max(Math.trunc(parsedStep), 1), getTotalSteps(userType));
}

export default function OnboardingPage() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();

  const publicMetadata =
    (user?.publicMetadata as Record<string, unknown> | undefined) ?? {};
  const userType = (publicMetadata.userType ||
    publicMetadata.user_type) as RoogoUserType | undefined;
  const isCompleted = hasCompletedOnboarding(publicMetadata);

  const [step, setStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedUserType, setSelectedUserType] = useState<RoogoUserType | undefined>(
    userType,
  );

  useEffect(() => {
    if (userType) {
      setSelectedUserType(userType);
    }
  }, [userType]);

  const effectiveUserType = selectedUserType ?? userType;
  const totalSteps = getTotalSteps(effectiveUserType);

  const updateMetadata = async (payload: Record<string, unknown>) => {
    const token = await getToken();
    if (!token) {
      throw new Error("Session introuvable. Veuillez vous reconnecter.");
    }

    const response = await fetch("/api/clerk/users/me/metadata", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(raw || "Echec de mise a jour du profil");
    }

    return response;
  };

  useEffect(() => {
    if (!isLoaded) return;

    if (isCompleted) {
      router.replace(getRedirectPath(effectiveUserType));
      return;
    }

    setStep(clampStep(publicMetadata.webOnboardingStep, effectiveUserType));
  }, [
    effectiveUserType,
    isCompleted,
    isLoaded,
    publicMetadata.webOnboardingStep,
    router,
  ]);

  useEffect(() => {
    setStep((currentStep) => clampStep(currentStep, effectiveUserType));
  }, [effectiveUserType]);

  const handleWelcomeNext = async () => {
    if (!user) return;

    setIsSubmitting(true);
    try {
      await updateMetadata({ webOnboardingStep: 2 });
      setStep(2);
      await user.reload();
    } catch (error) {
      console.error("Error updating onboarding step:", error);
      alert("Impossible d'enregistrer votre progression. Reessayez.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUserTypeSelect = async (type: string) => {
    if (!user) return;

    setIsSubmitting(true);
    try {
      await updateMetadata({ userType: type, webOnboardingStep: 3 });
      setSelectedUserType(type as RoogoUserType);
      setStep(3);
      await user.reload();
    } catch (error) {
      console.error("Error updating user type:", error);
      alert("Impossible d'enregistrer votre profil. Reessayez.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRenterPreferences = async (prefs: Record<string, unknown>) => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      await updateMetadata({ webOnboardingData: prefs, webOnboardingStep: 4 });
      setStep(4);
      await user.reload();
    } catch (error) {
      console.error("Error updating renter preferences:", error);
      alert("Impossible d'enregistrer vos préférences. Reessayez.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRenterContact = async (info: { phone: string; notifications: { newListings: boolean } }) => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      await updateMetadata({
        webOnboardingData: {
          phone: info.phone,
          notifications: info.notifications,
        },
        webOnboardingStep: 5,
      });
      setStep(5);
      await user.reload();
    } catch (error) {
      console.error("Error updating renter contact:", error);
      alert("Impossible d'enregistrer votre contact. Reessayez.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOwnerDetails = async (details: Record<string, unknown>) => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      await updateMetadata({ webOnboardingData: details, webOnboardingStep: 4 });
      setStep(4);
      await user.reload();
    } catch (error) {
      console.error("Error updating owner details:", error);
      alert("Impossible d'enregistrer vos informations. Reessayez.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAgentInfo = async (info: Record<string, unknown>) => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      await updateMetadata({
        ...(typeof info.companyName === "string" && { companyName: info.companyName }),
        ...(typeof info.facebookUrl === "string" && info.facebookUrl && { facebookUrl: info.facebookUrl }),
        webOnboardingData: info,
        webOnboardingStep: 4,
      });
      setStep(4);
      await user.reload();
    } catch (error) {
      console.error("Error updating agent info:", error);
      alert("Impossible d'enregistrer vos informations. Reessayez.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAgentDetails = async (details: Record<string, unknown>) => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      await updateMetadata({ webOnboardingData: details, webOnboardingStep: 5 });
      setStep(5);
      await user.reload();
    } catch (error) {
      console.error("Error updating agent details:", error);
      alert("Impossible d'enregistrer vos informations. Reessayez.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinish = async () => {
    if (!effectiveUserType) return;

    setIsSubmitting(true);
    try {
      await updateMetadata({
        hasCompletedWebOnboarding: true,
        signupPlatform: "web",
        webOnboardingStep: null,
      });
      // Reload the Clerk session so the updated JWT is used on the next request,
      // ensuring the middleware gate sees hasCompletedWebOnboarding = true.
      await user?.reload();
      router.push(getRedirectPath(effectiveUserType));
    } catch (error) {
      console.error("Error flagging web onboarding completion:", error);
      alert("Impossible d'enregistrer votre profil. Veuillez réessayer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isLoaded || isCompleted) {
    return (
      <div className="fixed inset-0 bg-[#2B241D] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <OnboardingShell currentStep={step} totalSteps={totalSteps}>
      {step === 1 && <WelcomeStep onNext={handleWelcomeNext} />}

      {step === 2 && (
        <UserTypeStep onNext={handleUserTypeSelect} initialType={userType} />
      )}

      {/* Renter Flow */}
      {effectiveUserType === "renter" && (
        <>
          {step === 3 && <RenterPreferencesStep onNext={handleRenterPreferences} />}
          {step === 4 && <RenterContactStep onNext={handleRenterContact} />}
          {step === 5 && <RenterReadyStep onFinish={handleFinish} />}
        </>
      )}

      {/* Owner Flow */}
      {effectiveUserType === "owner" && (
        <>
          {step === 3 && <OwnerDetailsStep onNext={handleOwnerDetails} />}
          {step === 4 && <OwnerReadyStep onFinish={handleFinish} />}
        </>
      )}

      {/* Agent Flow */}
      {effectiveUserType === "agent" && (
        <>
          {step === 3 && <AgentInfoStep onNext={handleAgentInfo} />}
          {step === 4 && <AgentDetailsStep onNext={handleAgentDetails} />}
          {step === 5 && <AgentReadyStep onFinish={handleFinish} />}
        </>
      )}

      {isSubmitting && (
        <div className="mt-4 text-xs text-neutral-400">Enregistrement...</div>
      )}
    </OnboardingShell>
  );
}
