"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SignInButton, SignUpButton, useUser } from "@clerk/nextjs";
import { supabase } from "@/lib/supabase";
import { TALENT_DOCUMENTS_BUCKET, formatTalentStatus } from "@/lib/talent";
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  ClockIcon,
  FilePdfIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  PaperPlaneTiltIcon,
  ShieldCheckIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

type TalentJob = {
  title: string;
  company_name: string;
  hiring_objective: string;
  location: string;
  salary_range: string | null;
  description: string;
  success_metrics: string[];
  talent_challenges?: Array<{
    title: string;
    instructions: string;
    deadline_hours: number;
    target_leads: number;
    is_paid: boolean;
  }>;
};

type TalentProfile = {
  full_name: string;
  email: string;
  phone: string;
  whatsapp: string | null;
  location: string;
  languages: string[];
  resume_filename: string;
};

type TalentApplication = {
  id: string;
  status: string;
  challenge_deadline_at: string | null;
  submitted_at: string | null;
  appeal_note: string | null;
  reviewer_score: number | null;
};

type TalentLead = {
  id: string;
  owner_name: string;
  owner_phone: string;
  owner_address: string;
  notes: string;
  candidate_visible_status: string;
  review_status: string;
  partial_credit: boolean;
  credited: boolean;
  submitted_at: string;
  matched_owner_id: string | null;
  matched_property_id: string | null;
};

type OwnerMatch = {
  id: string;
  displayName: string;
  maskedPhone: string | null;
  city: string | null;
  type: string;
  properties: Array<{
    id: string;
    status: string | null;
    quartier: string | null;
    city: string | null;
  }>;
};

type TalentMeResponse = {
  success: boolean;
  user?: {
    fullName: string | null;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
  };
  job?: TalentJob;
  profile?: TalentProfile | null;
  application?: TalentApplication | null;
  leads?: TalentLead[];
  error?: string;
};

const LEAD_DRAFT_KEY = "roogo_talent_lead_draft";

const visibleLeadLabels: Record<string, string> = {
  received: "Reçu",
  under_review: "En revue",
  credited: "Crédité",
  duplicate: "Doublon",
  converted: "Converti",
  rejected: "Refusé",
};

function formatDateTime(value: string | null) {
  if (!value) return "Non défini";
  return new Date(value).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function deadlineState(deadline: string | null) {
  if (!deadline) return { expired: false, label: "Délai non défini" };
  const deadlineTime = new Date(deadline).getTime();
  const remaining = deadlineTime - Date.now();
  if (remaining <= 0) return { expired: true, label: "Délai dépassé" };
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining / (1000 * 60)) % 60);
  return {
    expired: false,
    label: hours > 0 ? `${hours}h ${minutes}min restantes` : `${minutes}min restantes`,
  };
}

export function TalentCandidateClient() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [data, setData] = useState<TalentMeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    whatsapp: "",
    location: "",
    languages: "Français",
    resumePath: "",
    resumeFilename: "",
  });
  const [leadForm, setLeadForm] = useState({
    ownerName: "",
    ownerPhone: "",
    ownerAddress: "",
    notes: "",
    matchedOwnerId: "",
    matchedPropertyId: "",
  });
  const [ownerMatches, setOwnerMatches] = useState<OwnerMatch[]>([]);
  const [appealNote, setAppealNote] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const challenge = data?.job?.talent_challenges?.[0];
  const deadline = useMemo(
    () => deadlineState(data?.application?.challenge_deadline_at ?? null),
    [data?.application?.challenge_deadline_at],
  );
  const validCount = (data?.leads ?? []).filter((lead) =>
    ["credited", "converted"].includes(lead.candidate_visible_status),
  ).length;

  const loadTalent = useCallback(async () => {
    if (!isSignedIn) return;
    setLoading(true);
    try {
      const response = await fetch("/api/talent/me", { cache: "no-store" });
      const payload = (await response.json()) as TalentMeResponse;
      setData(payload);
      if (payload.user && !payload.profile) {
        setProfileForm((current) => ({
          ...current,
          fullName: payload.user?.fullName || user?.fullName || current.fullName,
          email:
            payload.user?.email ||
            user?.primaryEmailAddress?.emailAddress ||
            current.email,
          phone: payload.user?.phone || current.phone,
          whatsapp: payload.user?.whatsapp || current.whatsapp,
        }));
      }
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, user?.fullName, user?.primaryEmailAddress?.emailAddress]);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      void loadTalent();
    }
  }, [isLoaded, isSignedIn, loadTalent]);

  useEffect(() => {
    const saved = localStorage.getItem(LEAD_DRAFT_KEY);
    if (saved) {
      try {
        setLeadForm((current) => ({ ...current, ...JSON.parse(saved) }));
      } catch {
        localStorage.removeItem(LEAD_DRAFT_KEY);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(LEAD_DRAFT_KEY, JSON.stringify(leadForm));
  }, [leadForm]);

  async function uploadResume(file: File) {
    if (file.type !== "application/pdf") {
      setMessage("Le CV doit être un PDF.");
      return;
    }
    setBusyAction("resume");
    setMessage(null);
    try {
      const slotRes = await fetch("/api/talent/resume-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      });
      const slot = await slotRes.json();
      if (!slot.success) throw new Error(slot.error);

      const { error } = await supabase.storage
        .from(TALENT_DOCUMENTS_BUCKET)
        .uploadToSignedUrl(slot.upload.path, slot.upload.token, file);

      if (error) throw error;
      setProfileForm((current) => ({
        ...current,
        resumePath: slot.upload.path,
        resumeFilename: file.name,
      }));
      setMessage("CV ajouté.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Échec de l'envoi du CV.");
    } finally {
      setBusyAction(null);
    }
  }

  async function submitProfile(event: React.FormEvent) {
    event.preventDefault();
    setBusyAction("profile");
    setMessage(null);
    try {
      const response = await fetch("/api/talent/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileForm),
      });
      const payload = await response.json();
      if (!payload.success) throw new Error(payload.error);
      setMessage("Profil enregistré. Le challenge est débloqué.");
      await loadTalent();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Échec du profil.");
    } finally {
      setBusyAction(null);
    }
  }

  async function matchOwner() {
    if (!leadForm.ownerPhone.trim()) return;
    setBusyAction("match");
    setMessage(null);
    try {
      const response = await fetch(
        `/api/talent/owners/match?phone=${encodeURIComponent(leadForm.ownerPhone)}`,
      );
      const payload = await response.json();
      if (!payload.success) throw new Error(payload.error);
      setOwnerMatches(payload.matches ?? []);
      if ((payload.matches ?? []).length === 0) {
        setMessage("Aucun propriétaire existant trouvé avec ce numéro.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Vérification impossible.");
    } finally {
      setBusyAction(null);
    }
  }

  async function submitLead(event: React.FormEvent) {
    event.preventDefault();
    setBusyAction("lead");
    setMessage(null);
    try {
      const response = await fetch("/api/talent/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...leadForm,
          matchedOwnerId: leadForm.matchedOwnerId || null,
          matchedPropertyId: leadForm.matchedPropertyId || null,
        }),
      });
      const payload = await response.json();
      if (!payload.success) throw new Error(payload.error);
      setMessage("Contact soumis. Roogo va le vérifier.");
      setLeadForm({
        ownerName: "",
        ownerPhone: "",
        ownerAddress: "",
        notes: "",
        matchedOwnerId: "",
        matchedPropertyId: "",
      });
      setOwnerMatches([]);
      localStorage.removeItem(LEAD_DRAFT_KEY);
      await loadTalent();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Soumission impossible.");
    } finally {
      setBusyAction(null);
    }
  }

  async function submitAppeal(event: React.FormEvent) {
    event.preventDefault();
    setBusyAction("appeal");
    setMessage(null);
    try {
      const response = await fetch("/api/talent/appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: appealNote }),
      });
      const payload = await response.json();
      if (!payload.success) throw new Error(payload.error);
      setAppealNote("");
      setMessage("Explication envoyée.");
      await loadTalent();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Envoi impossible.");
    } finally {
      setBusyAction(null);
    }
  }

  if (!isLoaded) return null;

  return (
    <main className="min-h-screen bg-neutral-50 pt-28 pb-16">
      <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-primary">
              <ShieldCheckIcon size={14} weight="fill" />
              Roogo Talent
            </div>
            <h1 className="text-3xl font-black tracking-tight text-neutral-950 sm:text-4xl">
              Chargé(e) acquisition propriétaires
            </h1>
            <p className="mt-4 text-base leading-7 text-neutral-600">
              Montrez que vous savez exécuter sur le terrain: trouver des propriétaires,
              communiquer clairement et respecter un délai strict.
            </p>
            <div className="mt-6 grid gap-3 text-sm font-semibold text-neutral-700">
              <div className="flex items-center gap-2">
                <MapPinIcon className="text-primary" size={18} weight="bold" />
                Ouagadougou, Burkina Faso
              </div>
              <div className="flex items-center gap-2">
                <ClockIcon className="text-primary" size={18} weight="bold" />
                Challenge 48h, non rémunéré, avec attribution
              </div>
              <div className="flex items-center gap-2">
                <FilePdfIcon className="text-primary" size={18} weight="bold" />
                CV PDF requis avant le challenge
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-neutral-950">Objectif du challenge</h2>
            <p className="mt-3 text-sm leading-6 text-neutral-600">
              Soumettre 3 contacts propriétaires qualifiés avec nom, téléphone,
              adresse ou zone, et notes utiles. Les doublons peuvent recevoir un
              crédit partiel si vos notes apportent une information exploitable.
            </p>
            <div className="mt-5 space-y-3">
              {["Contacts vérifiables", "Notes claires", "Délai respecté"].map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm font-bold text-neutral-800">
                  <CheckCircleIcon size={18} className="text-green-600" weight="fill" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {!isSignedIn ? (
            <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black text-neutral-950">Commencer l&apos;évaluation</h2>
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                Connectez-vous ou créez un compte pour compléter votre profil,
                ajouter votre CV et recevoir le challenge.
              </p>
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SignUpButton mode="modal" forceRedirectUrl="/talent">
                  <button className="rounded-full bg-primary px-5 py-3 text-sm font-black text-white transition hover:bg-primary-hover">
                    Créer un compte
                  </button>
                </SignUpButton>
                <SignInButton mode="modal" forceRedirectUrl="/talent">
                  <button className="rounded-full border border-neutral-200 px-5 py-3 text-sm font-black text-neutral-800 transition hover:bg-neutral-50">
                    Se connecter
                  </button>
                </SignInButton>
              </div>
            </div>
          ) : loading ? (
            <div className="rounded-lg border border-neutral-200 bg-white p-6 text-sm font-bold text-neutral-500 shadow-sm">
              Chargement de votre espace Talent...
            </div>
          ) : (
            <>
              {message && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm font-bold text-primary">
                  {message}
                </div>
              )}

              <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-black text-neutral-950">Votre candidature</h2>
                    <p className="text-sm font-semibold text-neutral-500">
                      {formatTalentStatus(data?.application?.status || "applied")}
                    </p>
                  </div>
                  {data?.application?.challenge_deadline_at && (
                    <div className="rounded-lg border border-neutral-200 px-4 py-3 text-sm font-black text-neutral-800">
                      {deadline.label}
                    </div>
                  )}
                </div>
              </div>

              {!data?.profile ? (
                <form onSubmit={submitProfile} className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-black text-neutral-950">Profil requis</h2>
                  <p className="mt-2 text-sm text-neutral-500">
                    Ces informations débloquent le challenge. L&apos;évaluation reste centrée sur l&apos;exécution.
                  </p>
                  <div className="mt-6 grid gap-4">
                    {[
                      ["fullName", "Nom complet"],
                      ["email", "Email"],
                      ["phone", "Téléphone"],
                      ["whatsapp", "WhatsApp"],
                      ["location", "Ville / quartier"],
                      ["languages", "Langues parlées, séparées par des virgules"],
                    ].map(([key, label]) => (
                      <label key={key} className="grid gap-2 text-sm font-bold text-neutral-700">
                        {label}
                        <input
                          className="rounded-lg border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-primary"
                          value={profileForm[key as keyof typeof profileForm]}
                          onChange={(event) =>
                            setProfileForm((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                          required={key !== "whatsapp"}
                        />
                      </label>
                    ))}
                    <label className="grid gap-2 text-sm font-bold text-neutral-700">
                      CV PDF
                      <div className="flex items-center gap-3 rounded-lg border border-dashed border-neutral-300 p-4">
                        <UploadSimpleIcon size={22} className="text-primary" weight="bold" />
                        <input
                          type="file"
                          accept="application/pdf"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void uploadResume(file);
                          }}
                          className="min-w-0 flex-1 text-sm"
                        />
                      </div>
                      {profileForm.resumeFilename && (
                        <span className="text-xs font-bold text-green-700">
                          {profileForm.resumeFilename}
                        </span>
                      )}
                    </label>
                  </div>
                  <button
                    type="submit"
                    disabled={busyAction === "profile" || !profileForm.resumePath}
                    className="mt-6 w-full rounded-full bg-primary px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Enregistrer et débloquer le challenge
                  </button>
                </form>
              ) : (
                <>
                  <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
                    <h2 className="text-xl font-black text-neutral-950">{challenge?.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-neutral-600">
                      {challenge?.instructions}
                    </p>
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-neutral-50 p-4">
                        <p className="text-2xl font-black text-neutral-950">{data.leads?.length ?? 0}</p>
                        <p className="text-xs font-bold uppercase text-neutral-500">Soumis</p>
                      </div>
                      <div className="rounded-lg bg-neutral-50 p-4">
                        <p className="text-2xl font-black text-neutral-950">{validCount}</p>
                        <p className="text-xs font-bold uppercase text-neutral-500">Crédités</p>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={submitLead} className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
                    <div className="flex items-start gap-3">
                      {deadline.expired ? (
                        <WarningCircleIcon size={24} className="mt-1 text-red-600" weight="fill" />
                      ) : (
                        <PaperPlaneTiltIcon size={24} className="mt-1 text-primary" weight="fill" />
                      )}
                      <div>
                        <h2 className="text-xl font-black text-neutral-950">Soumettre un contact</h2>
                        <p className="text-sm text-neutral-500">
                          Délai exact: {formatDateTime(data.application?.challenge_deadline_at ?? null)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-6 grid gap-4">
                      <label className="grid gap-2 text-sm font-bold text-neutral-700">
                        Nom du propriétaire
                        <input
                          className="rounded-lg border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-primary"
                          value={leadForm.ownerName}
                          onChange={(event) =>
                            setLeadForm((current) => ({ ...current, ownerName: event.target.value }))
                          }
                          required
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-bold text-neutral-700">
                        Téléphone propriétaire
                        <div className="flex gap-2">
                          <input
                            className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-primary"
                            value={leadForm.ownerPhone}
                            onChange={(event) =>
                              setLeadForm((current) => ({ ...current, ownerPhone: event.target.value }))
                            }
                            required
                          />
                          <button
                            type="button"
                            onClick={matchOwner}
                            disabled={busyAction === "match"}
                            className="rounded-lg border border-neutral-200 px-3 text-neutral-700"
                            aria-label="Vérifier propriétaire"
                          >
                            {busyAction === "match" ? (
                              <ArrowClockwiseIcon size={18} className="animate-spin" />
                            ) : (
                              <MagnifyingGlassIcon size={18} />
                            )}
                          </button>
                        </div>
                      </label>
                      {ownerMatches.length > 0 && (
                        <div className="grid gap-2">
                          {ownerMatches.map((match) => (
                            <button
                              key={match.id}
                              type="button"
                              onClick={() =>
                                setLeadForm((current) => ({
                                  ...current,
                                  matchedOwnerId: match.id,
                                  matchedPropertyId: match.properties[0]?.id || "",
                                }))
                              }
                              className={`rounded-lg border p-3 text-left text-sm transition ${
                                leadForm.matchedOwnerId === match.id
                                  ? "border-primary bg-primary/5"
                                  : "border-neutral-200 hover:bg-neutral-50"
                              }`}
                            >
                              <span className="font-black text-neutral-900">
                                Correspondance: {match.displayName} {match.maskedPhone}
                              </span>
                              <span className="mt-1 block text-xs font-semibold text-neutral-500">
                                {match.properties.length > 0
                                  ? `${match.properties.length} annonce(s) liée(s), statut: ${match.properties[0]?.status || "inconnu"}`
                                  : "Aucune annonce liée visible"}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      <label className="grid gap-2 text-sm font-bold text-neutral-700">
                        Adresse ou zone
                        <input
                          className="rounded-lg border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-primary"
                          value={leadForm.ownerAddress}
                          onChange={(event) =>
                            setLeadForm((current) => ({ ...current, ownerAddress: event.target.value }))
                          }
                          required
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-bold text-neutral-700">
                        Notes sur la conversation
                        <textarea
                          className="min-h-28 rounded-lg border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-primary"
                          value={leadForm.notes}
                          onChange={(event) =>
                            setLeadForm((current) => ({ ...current, notes: event.target.value }))
                          }
                          required
                        />
                      </label>
                    </div>
                    <button
                      type="submit"
                      disabled={deadline.expired || busyAction === "lead"}
                      className="mt-6 w-full rounded-full bg-primary px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Soumettre ce contact
                    </button>
                  </form>

                  <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
                    <h2 className="text-xl font-black text-neutral-950">Contacts soumis</h2>
                    <div className="mt-5 grid gap-3">
                      {(data.leads ?? []).length === 0 ? (
                        <p className="text-sm font-semibold text-neutral-500">
                          Aucun contact soumis pour le moment.
                        </p>
                      ) : (
                        data.leads?.map((lead) => (
                          <div key={lead.id} className="rounded-lg border border-neutral-100 bg-neutral-50 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-black text-neutral-900">{lead.owner_name}</p>
                                <p className="text-sm font-semibold text-neutral-500">{lead.owner_address}</p>
                              </div>
                              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-neutral-700">
                                {visibleLeadLabels[lead.candidate_visible_status] || lead.candidate_visible_status}
                              </span>
                            </div>
                            {lead.partial_credit && (
                              <p className="mt-2 text-xs font-bold text-amber-700">
                                Crédit partiel possible grâce aux notes utiles.
                              </p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {!data.application?.appeal_note && (
                    <form onSubmit={submitAppeal} className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
                      <h2 className="text-lg font-black text-neutral-950">Envoyer une explication</h2>
                      <p className="mt-2 text-sm text-neutral-500">
                        Une seule explication est possible en cas de délai manqué, doublon ou rejet.
                      </p>
                      <textarea
                        className="mt-4 min-h-24 w-full rounded-lg border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-primary"
                        value={appealNote}
                        onChange={(event) => setAppealNote(event.target.value)}
                      />
                      <button
                        type="submit"
                        disabled={busyAction === "appeal"}
                        className="mt-4 rounded-full border border-neutral-200 px-5 py-3 text-sm font-black text-neutral-800"
                      >
                        Envoyer
                      </button>
                    </form>
                  )}

                  <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-black text-neutral-950">
                      <LinkIcon size={18} className="text-primary" weight="bold" />
                      Attribution
                    </div>
                    <p className="mt-2 text-sm leading-6 text-neutral-600">
                      Les contacts soumis peuvent être utilisés par Roogo. Votre candidature
                      garde l&apos;attribution pour l&apos;évaluation, y compris si un contact devient
                      une annonce en attente ou convertie.
                    </p>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}
