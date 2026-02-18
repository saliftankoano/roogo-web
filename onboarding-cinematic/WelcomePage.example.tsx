"use client";

import React, { useEffect, useMemo, useState } from "react";
import { OnboardingLayout } from "./components/OnboardingLayout";

/**
 * Example wizard controller.
 *
 * Replace `workspaceId` derivation and step components with your app's needs.
 * Keep the persistence pattern (step + completion flags) to survive reloads/OAuth.
 */
const TOTAL_STEPS = 6;

export default function WelcomePageExample() {
  // TODO: Replace with your auth / workspace derivation.
  // Examples:
  // - const workspaceId = orgId ?? userId
  // - const workspaceId = tenantId
  const workspaceId = useMemo(() => "example_workspace", []);

  const stepKey = `yourapp_onboarding_step_${workspaceId}`;
  const completedKey = `yourapp_onboarding_completed_${workspaceId}`;

  const [step, setStep] = useState(() => {
    if (typeof window === "undefined") return 1;
    const saved = localStorage.getItem(stepKey);
    return saved ? Math.max(1, Math.min(TOTAL_STEPS, Number(saved))) : 1;
  });

  useEffect(() => {
    if (!workspaceId) return;
    localStorage.setItem(stepKey, String(step));
  }, [step, stepKey, workspaceId]);

  const next = () => {
    if (step < TOTAL_STEPS) {
      // Optional pacing delay to match cinematic animations.
      setTimeout(() => setStep((s) => s + 1), 200);
    }
  };

  const finish = () => {
    localStorage.setItem(completedKey, "true");
    localStorage.removeItem(stepKey);
    // TODO: Replace with your routing.
    // router.push("/app");
  };

  return (
    <OnboardingLayout currentStep={step} totalSteps={TOTAL_STEPS}>
      {/* Replace with your step components: */}
      <div className="text-white">
        Step {step} (replace this with your step component)
        <div className="mt-4 flex gap-3 justify-center">
          <button
            className="px-4 py-2 rounded bg-gray-800 hover:bg-gray-700"
            onClick={next}
          >
            Next
          </button>
          <button
            className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700"
            onClick={finish}
          >
            Finish
          </button>
        </div>
      </div>
    </OnboardingLayout>
  );
}

