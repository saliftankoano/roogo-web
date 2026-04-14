"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

declare global {
  interface Window {
    Trustpilot?: {
      loadFromElement?: (element: Element, forceReload?: boolean) => void;
    };
  }
}

const TRUSTPILOT_WIDGET_EVENT = "trustpilot-widget-ready";

function loadTrustpilotWidget(element: HTMLElement | null) {
  if (!element) {
    return;
  }

  window.Trustpilot?.loadFromElement?.(element, true);
}

export function TrustpilotReviewCollector() {
  const pathname = usePathname();
  const widgetRef = useRef<HTMLDivElement>(null);
  const isAdminRoute = pathname.startsWith("/admin");

  useEffect(() => {
    if (isAdminRoute) {
      return;
    }

    const handleWidgetReady = () => {
      loadTrustpilotWidget(widgetRef.current);
    };

    handleWidgetReady();
    window.addEventListener(TRUSTPILOT_WIDGET_EVENT, handleWidgetReady);

    return () => {
      window.removeEventListener(TRUSTPILOT_WIDGET_EVENT, handleWidgetReady);
    };
  }, [isAdminRoute, pathname]);

  if (isAdminRoute) {
    return null;
  }

  return (
    <div className="rounded-3xl border border-neutral-200 bg-neutral-50 px-6 py-5 sm:px-8">
      <div className="mb-3">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
          Votre avis compte
        </p>
        <p className="mt-2 text-sm text-neutral-500 sm:text-base">
          Vous avez loue, visite ou publie avec Roogo ? Partagez votre
          experience sur Trustpilot.
        </p>
      </div>

      <div
        ref={widgetRef}
        className="trustpilot-widget"
        data-locale="en-US"
        data-template-id="56278e9abfbbba0bdcd568bc"
        data-businessunit-id="69de3e44a9326fb7a7d024df"
        data-style-height="52px"
        data-style-width="100%"
        data-token="cecb08a4-ae96-42eb-9e7b-2f04fe6946af"
      >
        <a
          href="https://www.trustpilot.com/review/roogobf.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Trustpilot
        </a>
      </div>
    </div>
  );
}
