"use client";

import { Suspense, useState } from "react";
import { useUser, SignIn, useAuth } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  EnvelopeSimpleIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";

export default function StaffJoinPage() {
  return (
    <Suspense fallback={null}>
      <StaffJoin />
    </Suspense>
  );
}

function StaffJoin() {
  const { isSignedIn, isLoaded, user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();
  // Access is given by invitation (founder or director, from /admin/acces/niveaux).
  const invitationToken = useSearchParams().get("invitation") ?? "";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/personnel/invitation/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: invitationToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "L'invitation n'a pas pu être acceptée.");
      }

      setSuccess(true);
      // The session carries the old metadata for a moment: reload it so the
      // admin pages see the new level.
      await user?.reload();
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
                forceRedirectUrl={
                  invitationToken
                    ? `/personnel/rejoindre?invitation=${encodeURIComponent(invitationToken)}`
                    : "/personnel/rejoindre"
                }
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
          /* Step 2: accept the invitation */
          <div className="bg-white rounded-[32px] border border-neutral-100 shadow-xl shadow-neutral-200/40 overflow-hidden">
            <div className="p-6 border-b border-neutral-100 bg-neutral-50/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">
                    2
                  </div>
                  <span className="text-sm font-bold text-neutral-900">
                    Acceptez votre invitation
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

              {invitationToken ? (
                <form onSubmit={handleAccept} className="space-y-6">
                  <p className="text-sm text-neutral-600">
                    Vous avez été invité à rejoindre l&apos;équipe Roogo. Votre
                    niveau d&apos;accès dépend de votre poste. Utilisez
                    l&apos;adresse e-mail à laquelle l&apos;invitation a été
                    envoyée.
                  </p>

                  {error && (
                    <div className="p-4 bg-red-50 border border-red-100 rounded-2xl">
                      <p className="text-sm text-red-600 font-medium">{error}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-4 bg-primary text-white rounded-full font-bold text-sm uppercase tracking-widest shadow-xl shadow-primary/20 active:scale-[0.985] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                  >
                    {isSubmitting ? (
                      "Vérification..."
                    ) : (
                      <>
                        Accepter l&apos;invitation
                        <ArrowRightIcon size={18} weight="bold" />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <div className="flex items-start gap-3 rounded-2xl bg-neutral-50 p-4">
                  <EnvelopeSimpleIcon
                    size={22}
                    weight="bold"
                    className="mt-0.5 shrink-0 text-neutral-400"
                  />
                  <p className="text-sm text-neutral-600">
                    Pour rejoindre l&apos;équipe, il faut un lien d&apos;invitation.
                    Demandez-le à un directeur ou au fondateur, puis ouvrez le
                    lien qu&apos;il vous envoie.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-neutral-400 mt-8">
          Pas d&apos;invitation ? Contactez un directeur ou le fondateur.
        </p>
      </div>
    </div>
  );
}
