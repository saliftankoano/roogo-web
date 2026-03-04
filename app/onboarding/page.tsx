"use client";

import React, { useEffect, useMemo, useState } from "react";
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

export default function OnboardingPage() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();

  const userType = (user?.publicMetadata?.userType ||
    user?.publicMetadata?.user_type) as RoogoUserType | undefined;
  const userId = user?.id;

  const stepKey = useMemo(
    () => (userId ? `roogo_onboarding_step_${userId}` : null),
    [userId],
  );
  const completedKey = useMemo(
    () => (userId ? `roogo_onboarding_completed_${userId}` : null),
    [userId],
  );

  const [step, setStep] = useState<number>(1);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedUserType, setSelectedUserType] = useState<RoogoUserType | undefined>(
    userType,
  );

  useEffect(() => {
    if (userType) {
      setSelectedUserType(userType);
    }
  }, [userType]);

  // Initialize step from localStorage
  useEffect(() => {
    if (typeof window !== "undefined" && stepKey && !isInitialized) {
      const saved = localStorage.getItem(stepKey);
      if (saved) {
        setStep(Number(saved));
      }
      setIsInitialized(true);
    }
  }, [stepKey, isInitialized]);

  // Persist step to localStorage
  useEffect(() => {
    if (typeof window !== "undefined" && stepKey && isInitialized) {
      localStorage.setItem(stepKey, String(step));
    }
  }, [step, stepKey, isInitialized]);

  const effectiveUserType = selectedUserType ?? userType;

  // Redirect if already completed
  useEffect(() => {
    if (typeof window !== "undefined" && completedKey && effectiveUserType) {
      const completed = localStorage.getItem(completedKey);
      if (completed === "true") {
        router.replace(
          effectiveUserType === "renter" ? "/proprietes" : "/mes-proprietes",
        );
      }
    }
  }, [completedKey, router, effectiveUserType]);

  const handleNext = () => {
    setStep((s) => s + 1);
  };

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

  const handleUserTypeSelect = async (type: string) => {
    if (!user) return;

    setIsSubmitting(true);
    try {
      await updateMetadata({ userType: type });
      setSelectedUserType(type as RoogoUserType);
      handleNext();
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
      await updateMetadata({ webOnboardingData: prefs });
      handleNext();
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
      await updateMetadata({ webOnboardingData: { phone: info.phone, notifications: info.notifications } });
      handleNext();
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
      await updateMetadata({ webOnboardingData: details });
      handleNext();
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
      });
      handleNext();
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
      await updateMetadata({ webOnboardingData: details });
      handleNext();
      await user.reload();
    } catch (error) {
      console.error("Error updating agent details:", error);
      alert("Impossible d'enregistrer vos informations. Reessayez.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinish = async () => {
    if (!completedKey || !stepKey || !effectiveUserType) return;

    setIsSubmitting(true);
    try {
      await updateMetadata({ hasCompletedWebOnboarding: true, signupPlatform: "web" });
      // Reload the Clerk session so the updated JWT is used on the next request,
      // ensuring the middleware gate sees hasCompletedWebOnboarding = true.
      await user?.reload();
      localStorage.setItem(completedKey, "true");
      localStorage.removeItem(stepKey);
      router.push(effectiveUserType === "renter" ? "/proprietes" : "/mes-proprietes");
    } catch (error) {
      console.error("Error flagging web onboarding completion:", error);
      alert("Impossible d'enregistrer votre profil. Veuillez réessayer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isLoaded || !isInitialized) {
    return (
      <div className="fixed inset-0 bg-[#2B241D] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totalSteps = effectiveUserType === "agent" ? 5 : effectiveUserType === "renter" ? 5 : 4;

  return (
    <OnboardingShell currentStep={step} totalSteps={totalSteps}>
      {step === 1 && <WelcomeStep onNext={handleNext} />}

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
