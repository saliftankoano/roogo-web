"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { driver, type DriveStep, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useOnboardingTour } from "../../hooks/useOnboardingTour";
import {
  staffOnboardingSteps,
  founderOnboardingSteps,
  publicOnboardingSteps,
} from "../../lib/onboardingSteps";
import { useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "../ui/Button";

function CompletionModal({ onComplete }: { onComplete: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="bg-white rounded-[32px] p-8 max-w-sm w-full shadow-2xl text-center border border-white/50"
      >
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-4xl">🎉</span>
        </div>
        <h2 className="text-2xl font-bold text-neutral-900 mb-3">
          Félicitations !
        </h2>
        <p className="text-neutral-600 mb-8 font-medium leading-relaxed">
          Vous etes maintenant pret a profiter pleinement de l&apos;experience Roogo.
        </p>
        <Button
          onClick={onComplete}
          fullWidth
          variant="primary"
          size="lg"
          className="rounded-2xl font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all"
        >
          C&apos;est parti !
        </Button>
      </motion.div>
    </motion.div>
  );
}

function hasTargetElement(step: DriveStep): boolean {
  if (!step.element || step.element === "body") {
    return true;
  }

  if (typeof step.element === "string") {
    return Boolean(document.querySelector(step.element));
  }

  if (typeof step.element === "function") {
    return Boolean(step.element());
  }

  return true;
}

export function WebOnboardingTour() {
  const [mounted, setMounted] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const { user } = useUser();
  const { run, completeTour } = useOnboardingTour();
  const pathname = usePathname();
  const driverRef = useRef<Driver | null>(null);
  const isProfileOnboardingRoute = pathname?.startsWith("/onboarding") ?? false;

  useEffect(() => {
    setMounted(true);
  }, []);

  const userType = user?.publicMetadata?.userType as string;

  const baseSteps = useMemo(() => {
    if (userType === "founder") {
      return founderOnboardingSteps;
    }

    if (userType === "staff") {
      return staffOnboardingSteps;
    }

    return publicOnboardingSteps;
  }, [userType]);

  const steps = useMemo(() => {
    if (!mounted) {
      return [] as DriveStep[];
    }

    const availableSteps = baseSteps.filter(hasTargetElement);

    return availableSteps.map((step, index) => {
      const isLastStep = index === availableSteps.length - 1;

      return {
        ...step,
        popover: {
          ...step.popover,
          onNextClick: (_element: unknown, _activeStep: unknown, options: { driver: Driver }) => {
            if (isLastStep) {
              setShowCompletionModal(true);
              options.driver.destroy();
              return;
            }

            options.driver.moveNext();
          },
          onPrevClick: (_element: unknown, _activeStep: unknown, options: { driver: Driver }) => {
            options.driver.movePrevious();
          },
          onCloseClick: () => {
            void completeTour();
          },
        },
      };
    });
  }, [baseSteps, completeTour, mounted]);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    const driverObj = driver({
      overlayOpacity: 0.4,
      overlayColor: "#000000",
      smoothScroll: true,
      animate: true,
      allowClose: false,
      overlayClickBehavior: () => {},
      showProgress: true,
      progressText: "{{current}} / {{total}}",
      showButtons: ["previous", "next", "close"],
      prevBtnText: "Precedent",
      nextBtnText: "Suivant",
      doneBtnText: "Terminer",
      popoverClass: "roogo-driver-popover",
      onPopoverRender: (popover) => {
        popover.closeButton.textContent = "Passer";
        popover.closeButton.setAttribute("aria-label", "Passer le guide");
      },
      onDestroyed: () => {
        if (!showCompletionModal) {
          return;
        }
      },
    });

    driverRef.current = driverObj;

    return () => {
      driverObj.destroy();
      driverRef.current = null;
    };
  }, [mounted, showCompletionModal]);

  useEffect(() => {
    if (!mounted || !run || showCompletionModal || isProfileOnboardingRoute) {
      return;
    }

    const driverObj = driverRef.current;
    if (!driverObj) {
      return;
    }

    if (steps.length === 0) {
      void completeTour();
      return;
    }

    if (driverObj.isActive()) {
      driverObj.destroy();
    }

    driverObj.setSteps(steps);
    driverObj.drive();
  }, [
    completeTour,
    isProfileOnboardingRoute,
    mounted,
    run,
    showCompletionModal,
    steps,
  ]);

  const handleModalComplete = () => {
    setShowCompletionModal(false);
    void completeTour();
  };

  if (!mounted || isProfileOnboardingRoute) {
    return null;
  }

  return (
    <AnimatePresence>
      {showCompletionModal && (
        <CompletionModal onComplete={handleModalComplete} />
      )}
    </AnimatePresence>
  );
}
