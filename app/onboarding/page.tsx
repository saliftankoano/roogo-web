"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { UserIcon, WarningCircleIcon } from "@phosphor-icons/react";
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
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";

type RoogoUserType = "renter" | "owner" | "agent" | "staff" | "founder" | "regular";
type NameErrors = { firstName?: string; lastName?: string; form?: string };
type OnboardingResume = {
  userType: RoogoUserType | null;
  signupPlatform: string | null;
  hasCompletedMobileOnboarding: boolean;
  hasCompletedWebOnboarding: boolean;
  webOnboardingStep: number | null;
  webOnboardingData: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

function hasRequiredName(user?: { firstName?: string | null; lastName?: string | null } | null) {
  return Boolean(user?.firstName?.trim() && user?.lastName?.trim());
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-400">
      <WarningCircleIcon size={13} weight="fill" />
      {message}
    </p>
  );
}

function RequiredNameGate({
  initialFirstName,
  initialLastName,
  isSubmitting,
  onSave,
}: {
  initialFirstName?: string | null;
  initialLastName?: string | null;
  isSubmitting: boolean;
  onSave: (name: { firstName: string; lastName: string }) => Promise<void>;
}) {
  const [firstName, setFirstName] = useState(initialFirstName?.trim() ?? "");
  const [lastName, setLastName] = useState(initialLastName?.trim() ?? "");
  const [errors, setErrors] = useState<NameErrors>({});

  useEffect(() => {
    setFirstName(initialFirstName?.trim() ?? "");
    setLastName(initialLastName?.trim() ?? "");
  }, [initialFirstName, initialLastName]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const nextErrors: NameErrors = {};

    if (!trimmedFirstName) {
      nextErrors.firstName = "Entrez votre prénom pour continuer.";
    }

    if (!trimmedLastName) {
      nextErrors.lastName = "Entrez votre nom pour continuer.";
    }

    if (nextErrors.firstName || nextErrors.lastName) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});

    try {
      await onSave({ firstName: trimmedFirstName, lastName: trimmedLastName });
    } catch (error) {
      console.error("Error saving required name:", error);
      setErrors({
        form: "Impossible d'enregistrer votre nom. Veuillez réessayer.",
      });
    }
  };

  return (
    <div className="w-full max-w-md space-y-8">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 shadow-xl">
        <UserIcon size={40} weight="fill" className="text-primary" />
      </div>

      <div className="space-y-3 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-white">
          Complétez votre profil
        </h2>
        <p className="leading-relaxed text-neutral-400">
          Ajoutez votre prénom et votre nom pour continuer à utiliser Roogo.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 text-left">
        <div className="space-y-2">
          <label
            htmlFor="required-first-name"
            className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-400"
          >
            <UserIcon size={14} weight="bold" className="text-primary" />
            Prénom *
          </label>
          <Input
            id="required-first-name"
            autoComplete="given-name"
            value={firstName}
            onChange={(event) => {
              setFirstName(event.target.value);
              setErrors((current) => ({ ...current, firstName: undefined, form: undefined }));
            }}
            disabled={isSubmitting}
            className={`h-14 rounded-xl bg-[#1C1510] text-base font-bold text-white ${
              errors.firstName
                ? "border-red-500/70 focus-visible:ring-red-500"
                : "border-[#3D3027] focus-visible:ring-primary"
            }`}
            placeholder="Votre prénom"
          />
          <FieldError message={errors.firstName} />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="required-last-name"
            className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-400"
          >
            <UserIcon size={14} weight="bold" className="text-primary" />
            Nom *
          </label>
          <Input
            id="required-last-name"
            autoComplete="family-name"
            value={lastName}
            onChange={(event) => {
              setLastName(event.target.value);
              setErrors((current) => ({ ...current, lastName: undefined, form: undefined }));
            }}
            disabled={isSubmitting}
            className={`h-14 rounded-xl bg-[#1C1510] text-base font-bold text-white ${
              errors.lastName
                ? "border-red-500/70 focus-visible:ring-red-500"
                : "border-[#3D3027] focus-visible:ring-primary"
            }`}
            placeholder="Votre nom"
          />
          <FieldError message={errors.lastName} />
        </div>

        <FieldError message={errors.form} />

        <Button
          type="submit"
          disabled={isSubmitting}
          variant="primary"
          size="lg"
          className="h-14 w-full rounded-xl text-lg font-bold shadow-lg"
        >
          {isSubmitting ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </form>
    </div>
  );
}

export default function OnboardingPage() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();

  const publicMetadata =
    (user?.publicMetadata as Record<string, unknown> | undefined) ?? {};
  const userType = (publicMetadata.userType ||
    publicMetadata.user_type) as RoogoUserType | undefined;
  const publicIsCompleted = hasCompletedOnboarding(publicMetadata);

  const [step, setStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resumeData, setResumeData] = useState<OnboardingResume | null>(null);
  const [selectedUserType, setSelectedUserType] = useState<RoogoUserType | undefined>(
    userType,
  );

  const isCompleted =
    publicIsCompleted ||
    resumeData?.hasCompletedWebOnboarding === true ||
    resumeData?.hasCompletedMobileOnboarding === true;

  useEffect(() => {
    if (userType) {
      setSelectedUserType(userType);
    } else if (resumeData?.userType) {
      setSelectedUserType(resumeData.userType);
    }
  }, [resumeData?.userType, userType]);

  const effectiveUserType = selectedUserType ?? userType ?? resumeData?.userType ?? undefined;
  const totalSteps = getTotalSteps(effectiveUserType);
  const requiresName = isLoaded && user ? !hasRequiredName(user) : false;
  const webOnboardingData = resumeData?.webOnboardingData ?? {};
  const renterPreferencesInitial =
    webOnboardingData as React.ComponentProps<
      typeof RenterPreferencesStep
    >["initialValues"];
  const renterContactInitial =
    webOnboardingData as React.ComponentProps<
      typeof RenterContactStep
    >["initialValues"];
  const ownerDetailsInitial =
    webOnboardingData as React.ComponentProps<
      typeof OwnerDetailsStep
    >["initialValues"];
  const agentInfoInitial =
    webOnboardingData as React.ComponentProps<
      typeof AgentInfoStep
    >["initialValues"];
  const agentDetailsInitial =
    webOnboardingData as React.ComponentProps<
      typeof AgentDetailsStep
    >["initialValues"];

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

    setResumeData((current) => {
      const currentData = current?.webOnboardingData ?? {};
      const nextWebData = isRecord(payload.webOnboardingData)
        ? { ...currentData, ...payload.webOnboardingData }
        : currentData;
      return {
        userType:
          typeof payload.userType === "string"
            ? (payload.userType as RoogoUserType)
            : current?.userType ?? null,
        signupPlatform:
          typeof payload.signupPlatform === "string"
            ? payload.signupPlatform
            : current?.signupPlatform ?? null,
        hasCompletedMobileOnboarding:
          typeof payload.hasCompletedMobileOnboarding === "boolean"
            ? payload.hasCompletedMobileOnboarding
            : current?.hasCompletedMobileOnboarding ?? false,
        hasCompletedWebOnboarding:
          typeof payload.hasCompletedWebOnboarding === "boolean"
            ? payload.hasCompletedWebOnboarding
            : current?.hasCompletedWebOnboarding ?? false,
        webOnboardingStep:
          payload.webOnboardingStep === null
            ? null
            : typeof payload.webOnboardingStep === "number"
              ? payload.webOnboardingStep
              : current?.webOnboardingStep ?? null,
        webOnboardingData: nextWebData,
      };
    });

    return response;
  };

  useEffect(() => {
    if (!isLoaded || !user?.id || publicIsCompleted) return;

    let isCancelled = false;

    async function loadResumeData() {
      try {
        const token = await getToken();
        if (!token) return;

        const response = await fetch("/api/clerk/users/me/metadata", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;

        const data = (await response.json()) as OnboardingResume;
        if (isCancelled) return;

        setResumeData({
          userType: data.userType,
          signupPlatform: data.signupPlatform,
          hasCompletedMobileOnboarding:
            data.hasCompletedMobileOnboarding === true,
          hasCompletedWebOnboarding: data.hasCompletedWebOnboarding === true,
          webOnboardingStep: data.webOnboardingStep,
          webOnboardingData: isRecord(data.webOnboardingData)
            ? data.webOnboardingData
            : {},
        });

        if (data.userType) {
          setSelectedUserType(data.userType);
        }
        setStep(clampStep(data.webOnboardingStep, data.userType ?? userType));
      } catch (error) {
        console.error("Error loading onboarding resume data:", error);
      }
    }

    loadResumeData();

    return () => {
      isCancelled = true;
    };
  }, [getToken, isLoaded, publicIsCompleted, user?.id, userType]);

  useEffect(() => {
    if (!isLoaded) return;

    if (isCompleted) {
      router.replace(getRedirectPath(effectiveUserType));
      return;
    }

    setStep(
      clampStep(
        resumeData?.webOnboardingStep ?? publicMetadata.webOnboardingStep,
        effectiveUserType,
      ),
    );
  }, [
    effectiveUserType,
    isCompleted,
    isLoaded,
    publicMetadata.webOnboardingStep,
    resumeData?.webOnboardingStep,
    router,
  ]);

  useEffect(() => {
    setStep((currentStep) => clampStep(currentStep, effectiveUserType));
  }, [effectiveUserType]);

  const handleWelcomeNext = async () => {
    if (!user) return;

    setIsSubmitting(true);
    try {
      await updateMetadata({ webOnboardingStep: 2, signupPlatform: "web" });
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
      await updateMetadata({
        userType: type,
        webOnboardingStep: 3,
        signupPlatform: "web",
      });
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

  const handleRequiredNameSave = async (name: { firstName: string; lastName: string }) => {
    if (!user) return;

    setIsSubmitting(true);
    try {
      await updateMetadata(name);
      await user.reload();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinish = async () => {
    if (!effectiveUserType) return;
    if (!hasRequiredName(user)) {
      alert("Ajoutez votre prénom et votre nom pour continuer.");
      return;
    }

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

  if (requiresName) {
    return (
      <OnboardingShell currentStep={1} totalSteps={totalSteps}>
        <RequiredNameGate
          initialFirstName={user?.firstName}
          initialLastName={user?.lastName}
          isSubmitting={isSubmitting}
          onSave={handleRequiredNameSave}
        />
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell currentStep={step} totalSteps={totalSteps}>
      {step === 1 && <WelcomeStep onNext={handleWelcomeNext} />}

      {step === 2 && (
        <UserTypeStep onNext={handleUserTypeSelect} initialType={effectiveUserType} />
      )}

      {/* Renter Flow */}
      {effectiveUserType === "renter" && (
        <>
          {step === 3 && (
            <RenterPreferencesStep
              onNext={handleRenterPreferences}
              initialValues={renterPreferencesInitial}
            />
          )}
          {step === 4 && (
            <RenterContactStep
              onNext={handleRenterContact}
              initialValues={renterContactInitial}
            />
          )}
          {step === 5 && <RenterReadyStep onFinish={handleFinish} />}
        </>
      )}

      {/* Owner Flow */}
      {effectiveUserType === "owner" && (
        <>
          {step === 3 && (
            <OwnerDetailsStep
              onNext={handleOwnerDetails}
              initialValues={ownerDetailsInitial}
            />
          )}
          {step === 4 && <OwnerReadyStep onFinish={handleFinish} />}
        </>
      )}

      {/* Agent Flow */}
      {effectiveUserType === "agent" && (
        <>
          {step === 3 && (
            <AgentInfoStep
              onNext={handleAgentInfo}
              initialValues={agentInfoInitial}
            />
          )}
          {step === 4 && (
            <AgentDetailsStep
              onNext={handleAgentDetails}
              initialValues={agentDetailsInitial}
            />
          )}
          {step === 5 && <AgentReadyStep onFinish={handleFinish} />}
        </>
      )}

      {isSubmitting && (
        <div className="mt-4 text-xs text-neutral-400">Enregistrement...</div>
      )}
    </OnboardingShell>
  );
}
