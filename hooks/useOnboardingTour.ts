import { useState, useCallback, useEffect } from "react";
import { useUser } from "@clerk/nextjs";

export function useOnboardingTour() {
  const { user, isLoaded } = useUser();
  const [run, setRun] = useState(false);

  useEffect(() => {
    if (isLoaded && user) {
      const hasCompletedMetadata = !!user.publicMetadata?.hasCompletedWebOnboarding;
      const hasCompletedLocal = localStorage.getItem("roogo_web_onboarding_completed");
      
      if (!hasCompletedMetadata && !hasCompletedLocal) {
        setRun(true);
      }
    }
  }, [isLoaded, user]);

  const completeTour = useCallback(async () => {
    if (!user) return;
    
    // Immediately update local state and storage to prevent rerun
    localStorage.setItem("roogo_web_onboarding_completed", "true");
    setRun(false);
    
    try {
      // Update Clerk metadata via API
      await fetch("/api/clerk/users/me/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hasCompletedWebOnboarding: true,
        }),
      });
    } catch (error) {
      console.error("Error completing web tour:", error);
    }
  }, [user]);

  return {
    run,
    setRun,
    completeTour,
  };
}
