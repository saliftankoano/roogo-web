"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { SignInButton, useAuth } from "@clerk/nextjs";
import { CopyIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { formatPrice } from "@/lib/utils";

type ReferrerProfile = {
  id: string;
  code: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  legal_name: string;
  city_zone: string;
  payout_phone: string;
  payout_provider: string;
  rejection_reason: string | null;
  submitted_at: string | null;
};

type Redemption = {
  id: string;
  code_used: string;
  original_amount: number;
  discount_amount: number;
  paid_amount: number;
  status: "pending_payment" | "qualified" | "void";
  created_at: string;
  properties?: { quartier?: string | null; address?: string | null } | null;
};

type Commission = {
  id: string;
  amount: number;
  currency: string;
  status: "pending" | "approved" | "paid" | "cancelled";
  paid_at: string | null;
  created_at: string;
};

type ReferralMeResponse = {
  profile: ReferrerProfile | null;
  redemptions?: Redemption[];
  commissions?: Commission[];
  totals?: { pending: number; paid: number };
};

const statusLabels: Record<ReferrerProfile["status"], string> = {
  pending: "En verification",
  approved: "Approuve",
  rejected: "Refuse",
  suspended: "Suspendu",
};

function money(amount: number | undefined) {
  return `${formatPrice(Math.round(Number(amount || 0)))} FCFA`;
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default function ParrainagePage() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [data, setData] = useState<ReferralMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const profile = data?.profile ?? null;
  const redemptions = data?.redemptions ?? [];
  const commissions = data?.commissions ?? [];
  const totals = data?.totals ?? { pending: 0, paid: 0 };

  const shareUrl = useMemo(() => {
    if (!profile?.code || typeof window === "undefined") return "";
    return `${window.location.origin}/?ref=${encodeURIComponent(profile.code)}`;
  }, [profile?.code]);

  const loadProfile = useCallback(async () => {
    if (!isSignedIn) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const response = await fetch("/api/referrals/me", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Chargement impossible");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, [getToken, isSignedIn]);

  useEffect(() => {
    if (isLoaded) void loadProfile();
  }, [isLoaded, loadProfile]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const token = await getToken();
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/referrals/apply", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Envoi impossible");
      await loadProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible");
    } finally {
      setSubmitting(false);
    }
  };

  const copyCode = async () => {
    if (!profile?.code) return;
    await navigator.clipboard.writeText(shareUrl || profile.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  if (!isLoaded || loading) {
    return (
      <main className="min-h-screen bg-neutral-50 px-6 py-12">
        <div className="mx-auto max-w-5xl text-neutral-500">Chargement...</div>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="min-h-screen bg-neutral-50 px-6 py-12">
        <section className="mx-auto max-w-3xl rounded-2xl border border-neutral-200 bg-white p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-roogo-primary-600">
            Roogo Pro Agent
          </p>
          <h1 className="mt-3 text-3xl font-bold text-neutral-950">
            Connectez-vous pour demander votre code.
          </h1>
          <div className="mt-6">
            <SignInButton mode="modal">
              <button className="rounded-xl bg-roogo-primary-600 px-5 py-3 font-semibold text-white">
                Se connecter
              </button>
            </SignInButton>
          </div>
        </section>
      </main>
    );
  }

  const canApply = !profile || profile.status === "rejected";

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-roogo-primary-600">
              Roogo Pro Agent
            </p>
            <h1 className="mt-2 text-3xl font-bold text-neutral-950">
              Parrainage
            </h1>
          </div>
          {profile && (
            <span className="w-fit rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700">
              {statusLabels[profile.status]}
            </span>
          )}
        </header>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {canApply ? (
          <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-2xl border border-neutral-200 bg-white p-6">
              <h2 className="text-xl font-bold text-neutral-950">
                Demande de verification
              </h2>
              <dl className="mt-6 space-y-4 text-sm">
                <div>
                  <dt className="font-semibold text-neutral-500">Remise filleul</dt>
                  <dd className="mt-1 text-lg font-bold text-neutral-950">5%</dd>
                </div>
                <div>
                  <dt className="font-semibold text-neutral-500">
                    Commission Pro Agent
                  </dt>
                  <dd className="mt-1 text-lg font-bold text-neutral-950">
                    5% du montant paye apres remise
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-neutral-500">
                    Qualification
                  </dt>
                  <dd className="mt-1 text-neutral-700">
                    Paiement termine et annonce creee.
                  </dd>
                </div>
              </dl>
              {profile?.status === "rejected" && (
                <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">
                  {profile.rejection_reason || "Demande refusee."}
                </div>
              )}
            </div>

            <form
              onSubmit={handleSubmit}
              className="rounded-2xl border border-neutral-200 bg-white p-6"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-neutral-700">
                    Nom legal
                  </span>
                  <input
                    name="legalName"
                    required
                    className="w-full rounded-xl border border-neutral-200 px-4 py-3 outline-none focus:border-roogo-primary-500"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-neutral-700">
                    Ville / zone
                  </span>
                  <input
                    name="cityZone"
                    required
                    className="w-full rounded-xl border border-neutral-200 px-4 py-3 outline-none focus:border-roogo-primary-500"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-neutral-700">
                    Telephone de paiement
                  </span>
                  <input
                    name="payoutPhone"
                    required
                    inputMode="tel"
                    className="w-full rounded-xl border border-neutral-200 px-4 py-3 outline-none focus:border-roogo-primary-500"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-neutral-700">
                    Operateur
                  </span>
                  <select
                    name="payoutProvider"
                    required
                    className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 outline-none focus:border-roogo-primary-500"
                  >
                    <option value="ORANGE_MONEY">Orange Money</option>
                    <option value="MOOV_MONEY">Moov Money</option>
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-neutral-700">
                    Piece ID recto
                  </span>
                  <input
                    name="idFront"
                    type="file"
                    accept="image/*"
                    required
                    className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-neutral-700">
                    Piece ID verso
                  </span>
                  <input
                    name="idBack"
                    type="file"
                    accept="image/*"
                    required
                    className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm"
                  />
                </label>
              </div>
              <button
                disabled={submitting}
                className="mt-6 rounded-xl bg-roogo-primary-600 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Envoi..." : "Soumettre la demande"}
              </button>
            </form>
          </section>
        ) : (
          <section className="space-y-6">
            {profile?.status === "pending" && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
                Votre demande est en verification.
              </div>
            )}

            {profile?.status === "suspended" && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
                Votre code est suspendu.
              </div>
            )}

            {profile && (
              <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                  <p className="text-sm font-semibold text-neutral-500">
                    Code unique
                  </p>
                  <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
                    <code className="rounded-xl bg-neutral-950 px-4 py-3 text-xl font-bold tracking-wide text-white">
                      {profile.code}
                    </code>
                    <button
                      onClick={copyCode}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 px-4 py-3 font-semibold text-neutral-800"
                    >
                      {copied ? (
                        <CheckCircleIcon size={18} weight="bold" />
                      ) : (
                        <CopyIcon size={18} weight="bold" />
                      )}
                      {copied ? "Copie" : "Copier"}
                    </button>
                  </div>
                  {shareUrl && (
                    <p className="mt-3 break-all text-sm text-neutral-500">
                      {shareUrl}
                    </p>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                    <p className="text-sm font-semibold text-neutral-500">
                      Commission en attente
                    </p>
                    <p className="mt-2 text-2xl font-bold text-neutral-950">
                      {money(totals.pending)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                    <p className="text-sm font-semibold text-neutral-500">
                      Commission payee
                    </p>
                    <p className="mt-2 text-2xl font-bold text-neutral-950">
                      {money(totals.paid)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-2xl border border-neutral-200 bg-white p-6">
                <h2 className="text-lg font-bold text-neutral-950">
                  Annonces qualifiees
                </h2>
                <div className="mt-4 space-y-3">
                  {redemptions.length === 0 && (
                    <p className="text-sm text-neutral-500">Aucune annonce.</p>
                  )}
                  {redemptions.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-xl border border-neutral-100 p-4 text-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-neutral-900">
                          {row.properties?.quartier ||
                            row.properties?.address ||
                            "Annonce"}
                        </span>
                        <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-600">
                          {row.status}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-neutral-500">
                        <span>{money(row.original_amount)}</span>
                        <span>-{money(row.discount_amount)}</span>
                        <span>{money(row.paid_amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-neutral-200 bg-white p-6">
                <h2 className="text-lg font-bold text-neutral-950">
                  Commissions
                </h2>
                <div className="mt-4 space-y-3">
                  {commissions.length === 0 && (
                    <p className="text-sm text-neutral-500">Aucune commission.</p>
                  )}
                  {commissions.map((row) => (
                    <div
                      key={row.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-neutral-100 p-4 text-sm"
                    >
                      <div>
                        <p className="font-bold text-neutral-950">
                          {money(row.amount)}
                        </p>
                        <p className="text-neutral-500">{dateLabel(row.created_at)}</p>
                      </div>
                      <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-600">
                        {row.status}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
