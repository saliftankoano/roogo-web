"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildKuulaRenderUrl } from "@/lib/virtual-tour";

type EmbedState = "loading" | "ready" | "error";

interface KuulaEmbedProps {
  virtualTourUrl: string;
  title?: string;
  className?: string;
}

export function KuulaEmbed({
  virtualTourUrl,
  title = "Visite virtuelle Kuula",
  className,
}: KuulaEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<EmbedState>("loading");
  const renderUrl = useMemo(
    () => buildKuulaRenderUrl(virtualTourUrl),
    [virtualTourUrl],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setState("loading");
    container.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://static.kuula.io/embed.js";
    script.async = true;
    script.setAttribute("data-kuula", renderUrl);
    script.setAttribute("data-width", "100%");
    script.setAttribute("data-height", "100%");

    const observer = new MutationObserver(() => {
      if (container.querySelector("iframe")) {
        setState("ready");
        observer.disconnect();
      }
    });

    const timeout = window.setTimeout(() => {
      if (!container.querySelector("iframe")) {
        observer.disconnect();
        setState("error");
      }
    }, 8000);

    script.onerror = () => {
      window.clearTimeout(timeout);
      observer.disconnect();
      setState("error");
    };

    observer.observe(container, { childList: true, subtree: true });
    container.appendChild(script);

    return () => {
      window.clearTimeout(timeout);
      observer.disconnect();
      container.innerHTML = "";
    };
  }, [renderUrl]);

  return (
    <div className={className}>
      <div
        className={`relative h-[420px] overflow-hidden rounded-[28px] border border-neutral-200 bg-neutral-950/5 md:h-[640px] ${
          state === "loading" ? "animate-pulse" : ""
        }`}
      >
        {state !== "error" && (
          <div
            ref={containerRef}
            className="h-full w-full"
            aria-label={title}
          />
        )}
        {state === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm">
            <div className="text-center">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="mt-3 text-sm font-semibold text-neutral-600">
                Chargement de la visite virtuelle...
              </p>
            </div>
          </div>
        )}
        {state === "error" && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-50 p-6">
            <div className="max-w-md text-center">
              <p className="text-lg font-bold text-neutral-900">
                Impossible de charger la visite virtuelle
              </p>
              <p className="mt-2 text-sm font-medium text-neutral-500">
                Ouvrez la visite directement sur Kuula si l&apos;intégration ne
                répond pas.
              </p>
              <a
                href={renderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-extrabold text-white hover:bg-primary/90"
              >
                Ouvrir sur Kuula
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
