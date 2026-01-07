"use client";

import { useState } from "react";
import { useUser, SignIn, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import {
  KeyIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";

export default function StaffJoinPage() {
  const { isSignedIn, isLoaded, user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();

  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/verify-staff-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Verification failed");
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/admin");
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="animate-pulse text-neutral-400">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-neutral-50 via-white to-primary/5 flex flex-col items-center justify-start pt-32 p-6">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-primary/10 rounded-3xl mb-6">
            <ShieldCheckIcon
              size={40}
              weight="duotone"
              className="text-primary"
            />
          </div>
          <h1 className="text-3xl font-black text-neutral-900 tracking-tight">
            Espace Staff
          </h1>
          <p className="text-neutral-500 mt-2 text-sm">
            Rejoignez l&apos;équipe Roogo
          </p>
        </div>

        {!isSignedIn ? (
          /* Step 1: Sign In/Up */
          <div className="bg-white rounded-[32px] border border-neutral-100 shadow-xl shadow-neutral-200/40 overflow-hidden">
            <div className="p-6 border-b border-neutral-100 bg-neutral-50/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">
                  1
                </div>
                <span className="text-sm font-bold text-neutral-900">
                  Créez ou connectez-vous à votre compte
                </span>
              </div>
            </div>
            <div className="p-6 flex justify-center">
              <SignIn
                appearance={{
                  elements: {
                    rootBox: "w-full",
                    card: "shadow-none border-none w-full",
                    headerTitle: "hidden",
                    headerSubtitle: "hidden",
                    socialButtonsBlockButton:
                      "rounded-full border-neutral-200 hover:bg-neutral-50",
                    formButtonPrimary:
                      "bg-primary hover:bg-primary/90 rounded-full",
                    footerActionLink: "text-primary hover:text-primary/80",
                  },
                }}
                routing="hash"
                forceRedirectUrl="/staff/join"
              />
            </div>
          </div>
        ) : success ? (
          /* Success State */
          <div className="bg-white rounded-[32px] border border-neutral-100 shadow-xl shadow-neutral-200/40 p-10 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-3xl mb-6">
              <CheckCircleIcon
                size={40}
                weight="duotone"
                className="text-green-600"
              />
            </div>
            <h2 className="text-2xl font-black text-neutral-900 mb-2">
              Bienvenue dans l&apos;équipe !
            </h2>
            <p className="text-neutral-500 text-sm mb-6">
              Votre compte a été activé. Redirection vers le tableau de bord...
            </p>
            <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
              <div className="h-full bg-primary animate-pulse rounded-full w-full" />
            </div>
          </div>
        ) : (
          /* Step 2: Enter Staff Code */
          <div className="bg-white rounded-[32px] border border-neutral-100 shadow-xl shadow-neutral-200/40 overflow-hidden">
            <div className="p-6 border-b border-neutral-100 bg-neutral-50/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">
                    2
                  </div>
                  <span className="text-sm font-bold text-neutral-900">
                    Entrez votre code d&apos;accès staff
                  </span>
                </div>
                <button
                  onClick={() => signOut()}
                  className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  Changer de compte
                </button>
              </div>
            </div>

            <div className="p-8">
              <div className="mb-6 p-4 bg-neutral-50 rounded-2xl">
                <p className="text-xs text-neutral-500">Connecté en tant que</p>
                <p className="font-bold text-neutral-900 truncate">
                  {user?.emailAddresses[0]?.emailAddress}
                </p>
              </div>

              <form onSubmit={handleVerifyCode} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest ml-4">
                    Code Secret
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="Entrez le code fourni"
                      className="w-full pl-14 pr-6 py-4 bg-neutral-50 rounded-full border border-neutral-100 focus:bg-white focus:ring-4 focus:ring-primary/5 focus:border-primary/20 transition-all text-sm font-bold placeholder:text-neutral-300"
                      required
                    />
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-300">
                      <KeyIcon size={22} weight="bold" />
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-2xl">
                    <p className="text-sm text-red-600 font-medium">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || !code}
                  className="w-full py-4 bg-primary text-white rounded-full font-bold text-sm uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                >
                  {isSubmitting ? (
                    "Vérification..."
                  ) : (
                    <>
                      Activer mon compte Staff
                      <ArrowRightIcon size={18} weight="bold" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-neutral-400 mt-8">
          Vous n&apos;avez pas de code ? Contactez l&apos;administrateur.
        </p>
      </div>
    </div>
  );
}
