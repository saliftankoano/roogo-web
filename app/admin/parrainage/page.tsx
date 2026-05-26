"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { formatPrice } from "@/lib/utils";

type UserSummary = {
  id: string;
  full_name: string | null;
  email: string | null;
  user_type: string | null;
  phone?: string | null;
  whatsapp?: string | null;
};

type ReferrerProfile = {
  id: string;
  user_id: string;
  code: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  legal_name: string;
  city_zone: string;
  payout_phone: string;
  payout_provider: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  idFrontUrl?: string | null;
  idBackUrl?: string | null;
  users?: UserSummary | UserSummary[] | null;
};

type Redemption = {
  id: string;
  code_used: string;
  original_amount: number;
  discount_amount: number;
  paid_amount: number;
  status: string;
  created_at: string;
  users?: UserSummary | UserSummary[] | null;
  referrer_profiles?: { code?: string | null; legal_name?: string | null } | null;
  properties?: { quartier?: string | null; address?: string | null } | null;
  transactions?: { deposit_id?: string | null; status?: string | null } | null;
};

type Commission = {
  id: string;
  amount: number;
  currency: string;
  status: "pending" | "approved" | "paid" | "cancelled";
  paid_at: string | null;
  payout_reference: string | null;
  notes: string | null;
  created_at: string;
  referrer_profiles?: { code?: string | null; legal_name?: string | null } | null;
  referral_redemptions?: {
    code_used?: string | null;
    paid_amount?: number | null;
    property_id?: string | null;
  } | null;
};

type AdminReferralResponse = {
  profiles: ReferrerProfile[];
  redemptions: Redemption[];
  commissions: Commission[];
};

type Tab = "queue" | "approved" | "commissions" | "paid";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "queue", label: "Verification" },
  { id: "approved", label: "Referrers" },
  { id: "commissions", label: "Commissions" },
  { id: "paid", label: "Historique paye" },
];

function money(amount: number | undefined | null) {
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

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default function AdminParrainagePage() {
  const { getToken } = useAuth();
  const [tab, setTab] = useState<Tab>("queue");
  const [data, setData] = useState<AdminReferralResponse>({
    profiles: [],
    redemptions: [],
    commissions: [],
  });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queue = useMemo(
    () => data.profiles.filter((profile) => profile.status === "pending"),
    [data.profiles],
  );
  const approvedProfiles = useMemo(
    () => data.profiles.filter((profile) => profile.status === "approved"),
    [data.profiles],
  );
  const openCommissions = useMemo(
    () =>
      data.commissions.filter(
        (commission) =>
          commission.status === "pending" || commission.status === "approved",
      ),
    [data.commissions],
  );
  const paidCommissions = useMemo(
    () => data.commissions.filter((commission) => commission.status === "paid"),
    [data.commissions],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const response = await fetch("/api/admin/referrals", {
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
  }, [getToken]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const updateProfile = async (
    id: string,
    status: ReferrerProfile["status"],
  ) => {
    setBusyId(id);
    setError(null);
    try {
      const token = await getToken();
      const rejectionReason =
        status === "rejected"
          ? window.prompt("Motif du refus") || "Verification refusee"
          : undefined;
      const response = await fetch(`/api/admin/referrals/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status, rejectionReason }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Mise a jour impossible");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mise a jour impossible");
    } finally {
      setBusyId(null);
    }
  };

  const updateCommission = async (
    id: string,
    status: Commission["status"],
  ) => {
    setBusyId(id);
    setError(null);
    try {
      const token = await getToken();
      const payoutReference =
        status === "paid" ? window.prompt("Reference de paiement") || "" : "";
      const notes = status === "cancelled" ? window.prompt("Note") || "" : "";
      const response = await fetch(`/api/admin/referrals/commissions/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status, payoutReference, notes }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Mise a jour impossible");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mise a jour impossible");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-roogo-primary-600">
              Admin
            </p>
            <h1 className="mt-2 text-3xl font-bold text-neutral-950">
              Parrainage
            </h1>
          </div>
          <button
            onClick={loadData}
            className="w-fit rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700"
          >
            Actualiser
          </button>
        </header>

        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="En verification" value={queue.length.toString()} />
          <Metric label="Approuves" value={approvedProfiles.length.toString()} />
          <Metric label="A payer" value={money(total(openCommissions))} />
          <Metric label="Paye" value={money(total(paidCommissions))} />
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        <nav className="flex flex-wrap gap-2 rounded-2xl border border-neutral-200 bg-white p-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                tab === item.id
                  ? "bg-neutral-950 text-white"
                  : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {loading ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-neutral-500">
            Chargement...
          </div>
        ) : (
          <>
            {tab === "queue" && (
              <section className="grid gap-4">
                {queue.length === 0 && <Empty label="Aucune demande en attente." />}
                {queue.map((profile) => (
                  <ProfileReviewCard
                    key={profile.id}
                    profile={profile}
                    busy={busyId === profile.id}
                    onApprove={() => updateProfile(profile.id, "approved")}
                    onReject={() => updateProfile(profile.id, "rejected")}
                    onSuspend={() => updateProfile(profile.id, "suspended")}
                  />
                ))}
              </section>
            )}

            {tab === "approved" && (
              <section className="rounded-2xl border border-neutral-200 bg-white">
                <ProfileTable
                  profiles={data.profiles}
                  busyId={busyId}
                  onApprove={(id) => updateProfile(id, "approved")}
                  onSuspend={(id) => updateProfile(id, "suspended")}
                />
              </section>
            )}

            {tab === "commissions" && (
              <section className="rounded-2xl border border-neutral-200 bg-white">
                <CommissionTable
                  commissions={openCommissions}
                  busyId={busyId}
                  onApprove={(id) => updateCommission(id, "approved")}
                  onPaid={(id) => updateCommission(id, "paid")}
                  onCancel={(id) => updateCommission(id, "cancelled")}
                />
              </section>
            )}

            {tab === "paid" && (
              <section className="rounded-2xl border border-neutral-200 bg-white">
                <CommissionTable
                  commissions={paidCommissions}
                  busyId={busyId}
                  onApprove={(id) => updateCommission(id, "approved")}
                  onPaid={(id) => updateCommission(id, "paid")}
                  onCancel={(id) => updateCommission(id, "cancelled")}
                />
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function total(rows: Commission[]) {
  return rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <p className="text-sm font-semibold text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-neutral-950">{value}</p>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-neutral-500">
      {label}
    </div>
  );
}

function ProfileReviewCard({
  profile,
  busy,
  onApprove,
  onReject,
  onSuspend,
}: {
  profile: ReferrerProfile;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onSuspend: () => void;
}) {
  const user = one(profile.users);
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div>
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-neutral-950">
                {profile.legal_name}
              </h2>
              <p className="text-sm text-neutral-500">
                {user?.email || "Email inconnu"} · {user?.user_type || "-"}
              </p>
            </div>
            <code className="w-fit rounded-lg bg-neutral-950 px-3 py-2 text-sm font-bold text-white">
              {profile.code}
            </code>
          </div>
          <dl className="mt-5 grid gap-3 text-sm md:grid-cols-3">
            <Field label="Zone" value={profile.city_zone} />
            <Field label="Telephone" value={profile.payout_phone} />
            <Field label="Operateur" value={profile.payout_provider} />
            <Field label="Soumis le" value={dateLabel(profile.submitted_at)} />
            <Field label="Nom compte" value={user?.full_name || "-"} />
            <Field label="Statut" value={profile.status} />
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <Action disabled={busy} onClick={onApprove} label="Approuver" />
            <Action disabled={busy} onClick={onReject} label="Refuser" tone="danger" />
            <Action
              disabled={busy}
              onClick={onSuspend}
              label="Suspendre"
              tone="neutral"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <IdImage label="Recto" src={profile.idFrontUrl} />
          <IdImage label="Verso" src={profile.idBackUrl} />
        </div>
      </div>
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-semibold text-neutral-500">{label}</dt>
      <dd className="mt-1 font-semibold text-neutral-950">{value}</dd>
    </div>
  );
}

function IdImage({ label, src }: { label: string; src?: string | null }) {
  return (
    <a
      href={src || undefined}
      target="_blank"
      rel="noreferrer"
      className="block overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100"
    >
      <div className="border-b border-neutral-200 bg-white px-3 py-2 text-xs font-bold text-neutral-600">
        {label}
      </div>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} className="h-40 w-full object-cover" />
      ) : (
        <div className="flex h-40 items-center justify-center text-sm text-neutral-400">
          -
        </div>
      )}
    </a>
  );
}

function ProfileTable({
  profiles,
  busyId,
  onApprove,
  onSuspend,
}: {
  profiles: ReferrerProfile[];
  busyId: string | null;
  onApprove: (id: string) => void;
  onSuspend: (id: string) => void;
}) {
  if (profiles.length === 0) return <Empty label="Aucun referrer." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="border-b border-neutral-200 text-neutral-500">
          <tr>
            <Th>Nom</Th>
            <Th>Code</Th>
            <Th>Statut</Th>
            <Th>Paiement</Th>
            <Th>Soumis</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((profile) => (
            <tr key={profile.id} className="border-b border-neutral-100">
              <Td>{profile.legal_name}</Td>
              <Td>
                <code className="rounded bg-neutral-100 px-2 py-1 font-bold">
                  {profile.code}
                </code>
              </Td>
              <Td>{profile.status}</Td>
              <Td>
                {profile.payout_provider} · {profile.payout_phone}
              </Td>
              <Td>{dateLabel(profile.submitted_at)}</Td>
              <Td>
                <div className="flex gap-2">
                  {profile.status !== "approved" && (
                    <Action
                      disabled={busyId === profile.id}
                      onClick={() => onApprove(profile.id)}
                      label="Approuver"
                    />
                  )}
                  {profile.status !== "suspended" && (
                    <Action
                      disabled={busyId === profile.id}
                      onClick={() => onSuspend(profile.id)}
                      label="Suspendre"
                      tone="neutral"
                    />
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CommissionTable({
  commissions,
  busyId,
  onApprove,
  onPaid,
  onCancel,
}: {
  commissions: Commission[];
  busyId: string | null;
  onApprove: (id: string) => void;
  onPaid: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  if (commissions.length === 0) return <Empty label="Aucune commission." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="border-b border-neutral-200 text-neutral-500">
          <tr>
            <Th>Referrer</Th>
            <Th>Code</Th>
            <Th>Montant paye annonce</Th>
            <Th>Commission</Th>
            <Th>Statut</Th>
            <Th>Date</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {commissions.map((commission) => (
            <tr key={commission.id} className="border-b border-neutral-100">
              <Td>{commission.referrer_profiles?.legal_name || "-"}</Td>
              <Td>
                <code className="rounded bg-neutral-100 px-2 py-1 font-bold">
                  {commission.referrer_profiles?.code ||
                    commission.referral_redemptions?.code_used ||
                    "-"}
                </code>
              </Td>
              <Td>{money(commission.referral_redemptions?.paid_amount)}</Td>
              <Td>{money(commission.amount)}</Td>
              <Td>{commission.status}</Td>
              <Td>{dateLabel(commission.paid_at || commission.created_at)}</Td>
              <Td>
                <div className="flex gap-2">
                  {commission.status === "pending" && (
                    <Action
                      disabled={busyId === commission.id}
                      onClick={() => onApprove(commission.id)}
                      label="Valider"
                      tone="neutral"
                    />
                  )}
                  {commission.status !== "paid" &&
                    commission.status !== "cancelled" && (
                      <Action
                        disabled={busyId === commission.id}
                        onClick={() => onPaid(commission.id)}
                        label="Marquer paye"
                      />
                    )}
                  {commission.status !== "cancelled" &&
                    commission.status !== "paid" && (
                      <Action
                        disabled={busyId === commission.id}
                        onClick={() => onCancel(commission.id)}
                        label="Annuler"
                        tone="danger"
                      />
                    )}
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="px-4 py-3 font-bold">{children}</th>;
}

function Td({ children }: { children: ReactNode }) {
  return <td className="px-4 py-4 align-top text-neutral-700">{children}</td>;
}

function Action({
  label,
  onClick,
  disabled,
  tone = "primary",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "danger" | "neutral";
}) {
  const className =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "neutral"
        ? "border-neutral-200 bg-white text-neutral-700"
        : "border-roogo-primary-600 bg-roogo-primary-600 text-white";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {disabled ? "..." : label}
    </button>
  );
}
