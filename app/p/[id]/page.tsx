"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";

// ─── Store URLs ───────────────────────────────────────────────────────────────
// TODO: replace APP_STORE_ID with the actual numeric App Store ID once published
const IOS_STORE_URL = "https://apps.apple.com/app/roogo/idAPP_STORE_ID";
const ANDROID_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.kazedra.roogo";

type Phase = "trying" | "installing" | "redirecting";

export default function PropertyDeepLinkPage() {
  const params = useParams();
  const id = params?.id as string;
  const [phase, setPhase] = useState<Phase>("trying");

  useEffect(() => {
    if (!id) return;

    // 1. Try the custom scheme — opens the app if installed
    const appUrl = `roogo://details?id=${id}`;
    window.location.href = appUrl;

    // 2. If the app opens, the browser tab becomes hidden/blurred.
    //    We watch for that signal to cancel the store redirect.
    let appOpened = false;

    const onHide = () => {
      if (document.hidden) appOpened = true;
    };
    const onBlur = () => {
      appOpened = true;
    };

    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("blur", onBlur);

    // 3. Give the app 800ms to respond — covers Android intent resolution (~500ms)
    //    while staying snappy on iOS (~200ms). Going shorter risks false-redirecting
    //    to the store before the OS has had time to intercept the scheme.
    const timer = setTimeout(() => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("blur", onBlur);

      if (appOpened) return; // App opened — nothing more to do

      setPhase("installing");

      const ua = navigator.userAgent;
      const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
      const isAndroid = /Android/.test(ua);

      // Small extra delay so the user reads the message before being redirected
      setTimeout(() => {
        setPhase("redirecting");
        if (isIOS) {
          window.location.href = IOS_STORE_URL;
        } else if (isAndroid) {
          window.location.href = ANDROID_STORE_URL;
        } else {
          // Desktop — fall back to the web property page
          window.location.href = `/proprietes/${id}`;
        }
      }, 800);
    }, 800);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("blur", onBlur);
    };
  }, [id]);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
      {/* Logo */}
      <div className="mb-8">
        <div className="w-20 h-20 rounded-[28px] bg-[#C96A2E] flex items-center justify-center shadow-lg mx-auto overflow-hidden">
          <Image
            src="/logo.png"
            alt="Roogo"
            width={80}
            height={80}
            className="object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      </div>

      {phase === "trying" && (
        <>
          <h1 className="text-xl font-black text-neutral-900 mb-2">
            Ouverture de Roogo…
          </h1>
          <p className="text-sm text-neutral-400 max-w-xs leading-relaxed">
            Si l&apos;application ne s&apos;ouvre pas automatiquement, nous
            vous redirigerons vers le téléchargement.
          </p>
          <div className="mt-8 flex gap-1.5 justify-center">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-2 h-2 rounded-full bg-[#C96A2E] animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        </>
      )}

      {phase === "installing" && (
        <>
          <h1 className="text-xl font-black text-neutral-900 mb-2">
            Téléchargez Roogo
          </h1>
          <p className="text-sm text-neutral-400 max-w-xs leading-relaxed">
            Découvrez des centaines de biens à louer à Ouagadougou et
            Bobo-Dioulasso. Nous vous redirigeons vers le store…
          </p>
          <div className="mt-8 flex gap-1.5 justify-center">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-2 h-2 rounded-full bg-[#C96A2E] animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        </>
      )}

      {phase === "redirecting" && (
        <>
          <h1 className="text-xl font-black text-neutral-900 mb-2">
            Redirection…
          </h1>
          <p className="text-sm text-neutral-400 max-w-xs">
            Un instant…
          </p>
        </>
      )}

      {/* Manual fallback links always visible */}
      <div className="mt-12 flex flex-col gap-3 w-full max-w-xs">
        <a
          href={`/proprietes/${id}`}
          className="w-full py-3 rounded-2xl border border-neutral-200 text-sm font-bold text-neutral-600 hover:bg-neutral-50 transition-colors"
        >
          Voir sur le web à la place
        </a>
      </div>
    </div>
  );
}
