"use client";

import { useMemo, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";

// Global blocking gate that catches any signed-in non-staff user who has no
// first/last name (e.g. an OAuth signup where the provider returned no name, or
// a legacy account created before names were enforced). Mirrors
// AcquisitionSourceGate. The authoritative guarantee lives server-side in
// /api/clerk/users/me/metadata (completion is rejected without a name); this gate
// is the user-facing "catch + fix" so existing nameless users must provide one.

function isGateExemptPath(pathname: string) {
  return (
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/connexion") ||
    pathname.startsWith("/inscription") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/personnel")
  );
}

function hasValue(value?: string | null) {
  return Boolean(value?.trim());
}

export function ProfileNameGate() {
  const pathname = usePathname();
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shouldShow = useMemo(() => {
    if (!isLoaded || !user || isGateExemptPath(pathname)) return false;
    const publicMetadata =
      (user.publicMetadata as Record<string, unknown> | undefined) ?? {};
    const userType =
      typeof publicMetadata.userType === "string"
        ? publicMetadata.userType
        : null;
    if (userType === "staff" || userType === "founder") return false;
    return !hasValue(user.firstName) || !hasValue(user.lastName);
  }, [isLoaded, user, pathname]);

  if (!shouldShow) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    if (!trimmedFirstName || !trimmedLastName) {
      setError("Entrez votre prénom et votre nom.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Session introuvable");
      const response = await fetch("/api/clerk/users/me/metadata", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName: trimmedFirstName,
          lastName: trimmedLastName,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Impossible d'enregistrer votre nom");
      }
      await user?.reload();
    } catch (err) {
      console.error("Failed to save profile name:", err);
      setError("Impossible d'enregistrer votre nom. Veuillez réessayer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#0f0c0a]/90 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-[#3D3027] bg-[#0f0c0a] p-6 shadow-2xl"
      >
        <div className="mb-6 space-y-2 text-center">
          <h2 className="text-2xl font-bold text-white">Complétez votre profil</h2>
          <p className="text-sm font-medium text-neutral-400">
            Ajoutez votre prénom et votre nom pour continuer à utiliser Roogo.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-400">
              Prénom
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
              disabled={isSubmitting}
              className="w-full rounded-xl border border-[#3D3027] bg-[#1a1410] px-4 py-3 text-white outline-none focus:border-primary"
              placeholder="Prénom"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-400">
              Nom
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
              disabled={isSubmitting}
              className="w-full rounded-xl border border-[#3D3027] bg-[#1a1410] px-4 py-3 text-white outline-none focus:border-primary"
              placeholder="Nom"
            />
          </div>
        </div>

        {error && (
          <p className="mt-4 text-sm font-semibold text-red-400">{error}</p>
        )}

        <Button
          type="submit"
          disabled={isSubmitting}
          variant="primary"
          size="lg"
          className="mt-6 h-12 w-full rounded-xl font-bold"
        >
          {isSubmitting ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </form>
    </div>
  );
}
