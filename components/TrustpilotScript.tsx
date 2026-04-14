"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    Trustpilot?: {
      loadFromElement?: (element: Element, forceReload?: boolean) => void;
    };
  }
}

const TRUSTPILOT_SCRIPT_ID = "trustpilot-widget-script";
const TRUSTPILOT_WIDGET_EVENT = "trustpilot-widget-ready";
const TRUSTPILOT_SCRIPT_SRC =
  "https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js";

export function TrustpilotScript() {
  useEffect(() => {
    const existingScript = document.getElementById(
      TRUSTPILOT_SCRIPT_ID,
    ) as HTMLScriptElement | null;

    if (window.Trustpilot) {
      window.dispatchEvent(new Event(TRUSTPILOT_WIDGET_EVENT));
      return;
    }

    if (existingScript) {
      existingScript.addEventListener("load", handleLoad);

      return () => {
        existingScript.removeEventListener("load", handleLoad);
      };
    }

    const script = document.createElement("script");
    script.id = TRUSTPILOT_SCRIPT_ID;
    script.src = TRUSTPILOT_SCRIPT_SRC;
    script.async = true;
    script.addEventListener("load", handleLoad);
    document.head.appendChild(script);

    return () => {
      script.removeEventListener("load", handleLoad);
    };
  }, []);

  return null;
}

function handleLoad() {
  window.dispatchEvent(new Event(TRUSTPILOT_WIDGET_EVENT));
}
