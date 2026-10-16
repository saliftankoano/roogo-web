"use client";

import { useCallback, useEffect, useState } from "react";
import {
  STAFF_LEVEL_LABELS,
  STAFF_LEVEL_SHORT_LABELS,
  type AssignableStaffLevel,
  type EffectiveStaffLevel,
} from "@/lib/staff-access";

type Member = {
  id: string;
  fullName: string | null;
  email: string | null;
  userType: string | null;
  level: EffectiveStaffLevel | null;
  isYou: boolean;
  canChange: boolean;
};

type Invitation = {
  id: string;
  email: string;
  level: AssignableStaffLevel;
  reason: string | null;
  createdAt: string;
  expiresAt: string;
  state: "open" | "accepted" | "revoked" | "expired";
  canRevoke: boolean;
};

type LogEntry = {
  id: string;
  action: "invite" | "invite_revoked" | "accepted" | "level_set" | "access_removed";
  actor_name: string | null;
  target_name: string | null;
  target_email: string | null;
  from_level: string | null;
  to_level: string | null;
  reason: string | null;
  created_at: string;
};

type TeamData = {
  you: { userId: string; level: EffectiveStaffLevel };
  assignableLevels: AssignableStaffLevel[];
  members: Member[];
  invitations: Invitation[];
  log: LogEntry[];
};

const LEVEL_TASKS: Record<AssignableStaffLevel, string> = {
  director: "Opérations quotidiennes, formation et encadrement. Donne les accès aux trois autres niveaux.",
  assistant: "Annonces vérifiées, documents de propriété, mandats, suivi des ventes.",
  advisor: "Premier contact, support, réseaux sociaux, visites et tournages.",
  intern: "Tâches assignées, en lecture ou en brouillon.",
};

function levelLabel(level: string | null | undefined) {
  if (!level || level === "none") return "Sans niveau";
  if (level === "legacy") return "Sans niveau (accès d'avant)";
  return STAFF_LEVEL_SHORT_LABELS[level as keyof typeof STAFF_LEVEL_SHORT_LABELS] ?? level;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function describe(entry: LogEntry) {
  const actor = entry.actor_name ?? "Quelqu'un";
  const target = entry.target_name ?? entry.target_email ?? "une personne";
  switch (entry.action) {
    case "invite":
      return `${actor} a invité ${entry.target_email} comme ${levelLabel(entry.to_level)}`;
    case "invite_revoked":
      return `${actor} a annulé l'invitation de ${entry.target_email}`;
    case "accepted":
      return `${target} a rejoint l'équipe comme ${levelLabel(entry.to_level)}`;
    case "level_set":
      return `${actor} a changé ${target} : ${levelLabel(entry.from_level)} vers ${levelLabel(entry.to_level)}`;
    case "access_removed":
      return `${actor} a retiré l'accès de ${target}`;
  }
}

type Pending =
  | { kind: "level"; member: Member; level: AssignableStaffLevel }
  | { kind: "remove"; member: Member };

export default function TeamPage() {
  const [data, setData] = useState<TeamData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLevel, setInviteLevel] = useState<AssignableStaffLevel | "">("");
  const [inviteNote, setInviteNote] = useState("");
  const [freshLink, setFreshLink] = useState<{ email: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/team", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Chargement impossible");
      setData(json as TeamData);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const call = async (url: string, init: RequestInit) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json" },
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Action impossible");
      return json;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action impossible");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const confirmPending = async () => {
    if (!pending) return;
    const url = `/api/admin/team/members/${pending.member.id}`;
    const result =
      pending.kind === "level"
        ? await call(url, {
            method: "PATCH",
            body: JSON.stringify({ level: pending.level, reason }),
          })
        : await call(url, { method: "DELETE", body: JSON.stringify({ reason }) });
    if (result) {
      setPending(null);
      setReason("");
      await load();
    }
  };

  const createInvitation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inviteLevel) return;
    const result = await call("/api/admin/team/invitations", {
      method: "POST",
      body: JSON.stringify({ email: inviteEmail, level: inviteLevel, reason: inviteNote }),
    });
    if (result) {
      setFreshLink({
        email: inviteEmail.trim().toLowerCase(),
        url: `${window.location.origin}${result.path}`,
      });
      setCopied(false);
      setInviteEmail("");
      setInviteNote("");
      await load();
    }
  };

  const revoke = async (id: string) => {
    const result = await call(`/api/admin/team/invitations/${id}`, { method: "DELETE" });
    if (result) await load();
  };

  const copyLink = async () => {
    if (!freshLink) return;
    try {
      await navigator.clipboard.writeText(freshLink.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-neutral-500">Chargement de l&apos;équipe...</p>;
  }
  if (!data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
        {error || "Chargement impossible"}
      </div>
    );
  }

  const isFounder = data.you.level === "founder";
  const openInvitations = data.invitations.filter((i) => i.state === "open");

  return (
    <main className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-roogo-primary-600">Admin</p>
        <h1 className="mt-2 text-3xl font-bold text-neutral-950">Équipe et accès</h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-600">
          Chaque personne a un niveau qui dépend de son poste. Le fondateur donne
          ou retire n&apos;importe quel niveau. Un directeur donne les niveaux
          assistant, conseiller et stagiaire. Chaque changement est écrit dans le
          journal.
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-neutral-200 bg-white">
        <h2 className="border-b border-neutral-100 px-5 py-4 text-lg font-bold text-neutral-950">
          L&apos;équipe
        </h2>
        <ul className="divide-y divide-neutral-100">
          {data.members.map((member) => (
            <li key={member.id} className="space-y-3 px-5 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-neutral-950">
                    {member.fullName || member.email || "Sans nom"}
                    {member.isYou && (
                      <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600">
                        Vous
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-neutral-500">{member.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      member.level === "legacy"
                        ? "bg-amber-50 text-amber-800"
                        : "bg-neutral-100 text-neutral-800"
                    }`}
                  >
                    {member.level === "founder" ? "Fondateur" : levelLabel(member.level)}
                  </span>
                  {member.canChange && (
                    <>
                      <select
                        aria-label={`Changer le niveau de ${member.fullName ?? member.email}`}
                        value=""
                        disabled={busy}
                        onChange={(e) => {
                          if (!e.target.value) return;
                          setReason("");
                          setPending({
                            kind: "level",
                            member,
                            level: e.target.value as AssignableStaffLevel,
                          });
                        }}
                        className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-700"
                      >
                        <option value="">Changer le niveau</option>
                        {data.assignableLevels.map((level) => (
                          <option key={level} value={level} disabled={member.level === level}>
                            {STAFF_LEVEL_LABELS[level]}
                          </option>
                        ))}
                      </select>
                      <button
                        disabled={busy}
                        onClick={() => {
                          setReason("");
                          setPending({ kind: "remove", member });
                        }}
                        className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                      >
                        Retirer l&apos;accès
                      </button>
                    </>
                  )}
                </div>
              </div>

              {pending?.member.id === member.id && (
                <div className="space-y-3 rounded-xl bg-neutral-50 p-4">
                  <p className="text-sm font-semibold text-neutral-900">
                    {pending.kind === "level"
                      ? `${member.fullName ?? member.email} passe de « ${levelLabel(member.level)} » à « ${STAFF_LEVEL_LABELS[pending.level]} ».`
                      : `${member.fullName ?? member.email} perd tout accès au personnel. Son compte redevient un compte ordinaire.`}
                  </p>
                  {!isFounder && (
                    <p className="text-xs text-neutral-600">
                      Prévenez le fondateur le jour même (WhatsApp : qui, quel accès, pourquoi).
                    </p>
                  )}
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={300}
                    placeholder="Motif (facultatif)"
                    className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      disabled={busy}
                      onClick={confirmPending}
                      className="rounded-xl bg-neutral-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Confirmer
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => setPending(null)}
                      className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-lg font-bold text-neutral-950">Inviter quelqu&apos;un</h2>
        <p className="mt-1 text-sm text-neutral-600">
          La personne reçoit un lien valable 7 jours. Elle doit se connecter avec
          l&apos;adresse e-mail invitée.
        </p>
        <form onSubmit={createInvitation} className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            type="email"
            required
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="Adresse e-mail"
            className="rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
          />
          <select
            required
            value={inviteLevel}
            onChange={(e) => setInviteLevel(e.target.value as AssignableStaffLevel | "")}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm"
          >
            <option value="">Niveau</option>
            {data.assignableLevels.map((level) => (
              <option key={level} value={level}>
                {STAFF_LEVEL_LABELS[level]}
              </option>
            ))}
          </select>
          <input
            value={inviteNote}
            onChange={(e) => setInviteNote(e.target.value)}
            maxLength={300}
            placeholder="Motif (facultatif)"
            className="rounded-xl border border-neutral-200 px-3 py-2.5 text-sm md:col-span-2"
          />
          <button
            type="submit"
            disabled={busy || !inviteLevel || !inviteEmail}
            className="w-fit rounded-xl bg-neutral-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Créer l&apos;invitation
          </button>
        </form>

        {freshLink && (
          <div className="mt-4 space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-900">
              Invitation créée pour {freshLink.email}. Envoyez-lui ce lien par WhatsApp.
            </p>
            <p className="break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-neutral-700">
              {freshLink.url}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={copyLink}
                className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
              >
                {copied ? "Copié" : "Copier le lien"}
              </button>
              <p className="text-xs text-emerald-900">
                Ce lien ne sera plus affiché. Annulez l&apos;invitation et recréez-la si vous le perdez.
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white">
        <h2 className="border-b border-neutral-100 px-5 py-4 text-lg font-bold text-neutral-950">
          Invitations
        </h2>
        {data.invitations.length === 0 ? (
          <p className="px-5 py-4 text-sm text-neutral-500">Aucune invitation pour le moment.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {data.invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-neutral-950">{invitation.email}</p>
                  <p className="text-xs text-neutral-500">
                    {STAFF_LEVEL_LABELS[invitation.level]}, envoyée le {formatDate(invitation.createdAt)}
                    {invitation.state === "open" && `, valable jusqu'au ${formatDate(invitation.expiresAt)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-700">
                    {{ open: "Ouverte", accepted: "Acceptée", revoked: "Annulée", expired: "Expirée" }[invitation.state]}
                  </span>
                  {invitation.canRevoke && (
                    <button
                      disabled={busy}
                      onClick={() => revoke(invitation.id)}
                      className="rounded-xl border border-neutral-200 px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
                    >
                      Annuler
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {openInvitations.length > 0 && (
          <p className="border-t border-neutral-100 px-5 py-3 text-xs text-neutral-500">
            Le lien d&apos;une invitation n&apos;est montré qu&apos;au moment de sa création.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white">
        <h2 className="border-b border-neutral-100 px-5 py-4 text-lg font-bold text-neutral-950">
          {isFounder ? "Journal des accès" : "Vos changements d'accès"}
        </h2>
        {data.log.length === 0 ? (
          <p className="px-5 py-4 text-sm text-neutral-500">Rien à afficher pour le moment.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {data.log.map((entry) => (
              <li key={entry.id} className="px-5 py-3">
                <p className="text-sm text-neutral-900">{describe(entry)}</p>
                <p className="text-xs text-neutral-500">
                  {formatDate(entry.created_at)}
                  {entry.reason ? `, ${entry.reason}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-lg font-bold text-neutral-950">Les niveaux</h2>
        <dl className="mt-3 grid gap-3 md:grid-cols-2">
          {(Object.keys(LEVEL_TASKS) as AssignableStaffLevel[]).map((level) => (
            <div key={level} className="rounded-xl bg-neutral-50 p-4">
              <dt className="font-semibold text-neutral-950">{STAFF_LEVEL_LABELS[level]}</dt>
              <dd className="mt-1 text-sm text-neutral-600">{LEVEL_TASKS[level]}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
