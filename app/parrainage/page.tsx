"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ChangeEvent, FormEvent } from "react";
import { SignInButton, useAuth } from "@clerk/nextjs";
import {
  CopyIcon,
  CheckCircleIcon,
  UploadSimpleIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { formatPrice } from "@/lib/utils";

type ReferrerProfile = {
  id: string;
  code: string | null;
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

const REFERRAL_IMAGE_COMPRESSION_TARGET_BYTES = 1_250_000;
const MAX_REFERRAL_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REFERRAL_IMAGE_DIMENSION = 1600;

const statusLabels: Record<ReferrerProfile["status"], string> = {
  pending: "En vérification",
  approved: "Accepté",
  rejected: "Refusé",
  suspended: "Suspendu",
};

const redemptionStatusLabels: Record<Redemption["status"], string> = {
  pending_payment: "Paiement en attente",
  qualified: "Qualifiée",
  void: "Annulée",
};

const commissionStatusLabels: Record<Commission["status"], string> = {
  pending: "En attente",
  approved: "Validée",
  paid: "Payée",
  cancelled: "Annulée",
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

async function readResponsePayload(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return { error: text || response.statusText };
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image illisible."));
    };
    image.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Compression impossible."));
      },
      type,
      quality,
    );
  });
}

async function compressReferralImage(file: File, fallbackName: string) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Les pièces d'identité doivent être des images.");
  }

  if (file.size > MAX_REFERRAL_IMAGE_BYTES) {
    throw new Error(
      "Image trop volumineuse. Envoyez une photo de moins de 8 Mo ou recadrez la pièce.",
    );
  }

  let image: HTMLImageElement;
  try {
    image = await loadImage(file);
  } catch {
    return file;
  }

  const scale = Math.min(
    1,
    MAX_REFERRAL_IMAGE_DIMENSION / Math.max(image.width, image.height),
  );
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Compression impossible.");

  context.drawImage(image, 0, 0, width, height);

  for (const quality of [0.82, 0.72, 0.62, 0.52]) {
    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (
      blob.size <= REFERRAL_IMAGE_COMPRESSION_TARGET_BYTES ||
      quality === 0.52
    ) {
      if (blob.size > MAX_REFERRAL_IMAGE_BYTES) return file;
      return new File([blob], `${fallbackName}.jpg`, { type: "image/jpeg" });
    }
  }

  return file;
}

export default function ParrainagePage() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [data, setData] = useState<ReferralMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [applicationFormReady, setApplicationFormReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const applicationFormRef = useRef<HTMLFormElement>(null);

  const profile = data?.profile ?? null;
  const redemptions = data?.redemptions ?? [];
  const commissions = data?.commissions ?? [];
  const totals = data?.totals ?? { pending: 0, paid: 0 };
  const canApply = !profile || profile.status === "rejected";
  const isApproved = profile?.status === "approved";

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

  const updateApplicationFormReady = useCallback(() => {
    setApplicationFormReady(
      Boolean(applicationFormRef.current?.checkValidity()),
    );
  }, []);

  useEffect(() => {
    if (canApply) updateApplicationFormReady();
  }, [canApply, updateApplicationFormReady]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;

    if (!formElement.checkValidity()) {
      formElement.reportValidity();
      setApplicationFormReady(false);
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const form = new FormData(formElement);
      const idFront = form.get("idFront");
      const idBack = form.get("idBack");

      if (!(idFront instanceof File) || !(idBack instanceof File)) {
        throw new Error("Ajoutez les deux photos de votre pièce d'identité.");
      }

      const [compressedFront, compressedBack] = await Promise.all([
        compressReferralImage(idFront, "piece-identite-recto"),
        compressReferralImage(idBack, "piece-identite-verso"),
      ]);
      form.set("idFront", compressedFront);
      form.set("idBack", compressedBack);

      const token = await getToken();
      const response = await fetch("/api/referrals/apply", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      const payload = await readResponsePayload(response);
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
      <main className="min-h-screen bg-neutral-50 px-6 pb-12 pt-40">
        <div className="mx-auto max-w-5xl text-neutral-500">Chargement...</div>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="min-h-screen bg-neutral-50 px-6 pb-12 pt-40">
        <section className="mx-auto max-w-3xl rounded-2xl border border-neutral-200 bg-white p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            Roogo Pro Agent
          </p>
          <h1 className="mt-3 text-3xl font-bold text-neutral-950">
            Connectez-vous pour demander votre code.
          </h1>
          <div className="mt-6">
            <SignInButton mode="modal">
              <button className="rounded-xl bg-primary px-5 py-3 font-semibold text-white">
                Se connecter
              </button>
            </SignInButton>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-6 pb-12 pt-40">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">
              Roogo Pro Agent
            </p>
            <h1 className="mt-2 text-3xl font-bold text-neutral-950">
              Devenir parrain Roogo
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-neutral-600">
              Recommandez Roogo à des propriétaires ou agents. Après validation,
              vous recevez un code unique à partager.
            </p>
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
                Comment ça marche
              </h2>
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl bg-neutral-50 p-4">
                  <p className="text-sm font-bold text-neutral-950">
                    1. Demandez votre code
                  </p>
                  <p className="mt-1 text-sm leading-6 text-neutral-600">
                    Remplissez ce formulaire. L’équipe Roogo vérifie votre
                    identité avant d’activer votre code.
                  </p>
                </div>
                <div className="rounded-2xl bg-neutral-50 p-4">
                  <p className="text-sm font-bold text-neutral-950">
                    2. Partagez votre code
                  </p>
                  <p className="mt-1 text-sm leading-6 text-neutral-600">
                    Un propriétaire ou agent utilise votre code sur sa
                    publication payante ou gratuite. La remise s’applique au
                    paiement immédiat ou au frais différé de publication
                    gratuite.
                  </p>
                </div>
                <div className="rounded-2xl bg-neutral-50 p-4">
                  <p className="text-sm font-bold text-neutral-950">
                    3. Touchez votre commission
                  </p>
                  <p className="mt-1 text-sm leading-6 text-neutral-600">
                    Quand l’annonce est créée et qualifiée, votre commission
                    passe en attente de paiement manuel.
                  </p>
                </div>
              </div>
              {profile?.status === "rejected" && (
                <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">
                  {profile.rejection_reason || "Demande refusée."}
                </div>
              )}
            </div>

            <form
              ref={applicationFormRef}
              onSubmit={handleSubmit}
              onInput={updateApplicationFormReady}
              onChange={updateApplicationFormReady}
              onInvalid={() => setApplicationFormReady(false)}
              className="rounded-2xl border border-neutral-200 bg-white p-6"
            >
              <div className="mb-6 border-b border-neutral-100 pb-5">
                <div>
                  <h2 className="text-xl font-bold text-neutral-950">
                    Envoyer ma demande
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-neutral-600">
                    Ces informations servent uniquement à vérifier votre profil
                    et préparer les paiements manuels.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-neutral-700">
                    Nom légal
                  </span>
                  <input
                    name="legalName"
                    required
                    className="w-full rounded-xl border border-neutral-200 px-4 py-3 outline-none focus:border-primary"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-neutral-700">
                    Ville / zone
                  </span>
                  <input
                    name="cityZone"
                    required
                    className="w-full rounded-xl border border-neutral-200 px-4 py-3 outline-none focus:border-primary"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-neutral-700">
                    Téléphone de paiement
                  </span>
                  <input
                    name="payoutPhone"
                    required
                    inputMode="tel"
                    className="w-full rounded-xl border border-neutral-200 px-4 py-3 outline-none focus:border-primary"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-neutral-700">
                    Opérateur
                  </span>
                  <select
                    name="payoutProvider"
                    required
                    className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 outline-none focus:border-primary"
                  >
                    <option value="ORANGE_MONEY">Orange Money</option>
                    <option value="MOOV_MONEY">Moov Money</option>
                  </select>
                </label>
                <FileInputField
                  label="Recto CNIB"
                  name="idFront"
                  onReadyChange={updateApplicationFormReady}
                />
                <FileInputField
                  label="Verso CNIB"
                  name="idBack"
                  onReadyChange={updateApplicationFormReady}
                />
              </div>
              <button
                disabled={submitting || !applicationFormReady}
                className="mt-6 w-full rounded-xl bg-primary px-5 py-4 font-bold text-white shadow-sm transition disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 disabled:shadow-none"
              >
                {submitting
                  ? "Envoi de la demande..."
                  : applicationFormReady
                    ? "Soumettre ma demande"
                    : "Complétez le formulaire"}
              </button>
            </form>
          </section>
        ) : (
          <section className="space-y-6">
            {profile?.status === "pending" && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
                <p className="text-lg font-bold">Demande en cours de validation</p>
                <p className="mt-2 text-sm leading-6">
                  L’équipe Roogo vérifie vos informations. La validation prend
                  généralement entre 24 et 72 heures. Votre code apparaîtra ici
                  dès que votre profil sera accepté.
                </p>
              </div>
            )}

            {profile?.status === "suspended" && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
                Votre code est suspendu.
              </div>
            )}

            {isApproved && profile && (
              <>
                <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                    <p className="text-sm font-semibold text-neutral-500">
                      Code unique
                    </p>
                    {profile.code ? (
                      <>
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
                            {copied ? "Copié" : "Copier"}
                          </button>
                        </div>
                        {shareUrl && (
                          <p className="mt-3 break-all text-sm text-neutral-500">
                            {shareUrl}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="mt-3 text-sm text-neutral-500">
                        Code indisponible. Contactez l’équipe Roogo.
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
                        Commission payée
                      </p>
                      <p className="mt-2 text-2xl font-bold text-neutral-950">
                        {money(totals.paid)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <section className="rounded-2xl border border-neutral-200 bg-white p-6">
                    <h2 className="text-lg font-bold text-neutral-950">
                      Annonces qualifiées
                    </h2>
                    <div className="mt-4 space-y-3">
                      {redemptions.length === 0 && (
                        <p className="text-sm text-neutral-500">
                          Aucune annonce.
                        </p>
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
                              {redemptionStatusLabels[row.status]}
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
                        <p className="text-sm text-neutral-500">
                          Aucune commission.
                        </p>
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
                            <p className="text-neutral-500">
                              {dateLabel(row.created_at)}
                            </p>
                          </div>
                          <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-600">
                            {commissionStatusLabels[row.status]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function FileInputField({
  label,
  name,
  onReadyChange,
}: {
  label: string;
  name: "idFront" | "idBack";
  onReadyChange: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const clearFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setFileName("");
    setFieldError(null);
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.setCustomValidity("");
    }
    window.setTimeout(onReadyChange, 0);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setFileName("");
    setFieldError(null);
    event.currentTarget.setCustomValidity("");

    if (!file) {
      window.setTimeout(onReadyChange, 0);
      return;
    }

    if (!file.type.startsWith("image/")) {
      const message = "Ajoutez une photo de la CNIB au format image.";
      event.currentTarget.value = "";
      event.currentTarget.setCustomValidity(message);
      setFieldError(message);
      window.setTimeout(onReadyChange, 0);
      return;
    }

    if (file.size > MAX_REFERRAL_IMAGE_BYTES) {
      const message = "La photo doit faire moins de 8 Mo.";
      event.currentTarget.value = "";
      event.currentTarget.setCustomValidity(message);
      setFieldError(message);
      window.setTimeout(onReadyChange, 0);
      return;
    }

    setFileName(file.name);
    setPreviewUrl(URL.createObjectURL(file));
    window.setTimeout(onReadyChange, 0);
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-neutral-700" htmlFor={name}>
        {label}
      </label>
      <div
        className={`rounded-2xl border bg-neutral-50 p-3 ${
          fieldError ? "border-red-300" : "border-neutral-200"
        }`}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="group flex min-h-[150px] w-full flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-neutral-200 bg-white text-center transition hover:border-primary/50"
        >
          {previewUrl ? (
            <span
              className="block h-36 w-full rounded-lg bg-cover bg-center"
              style={{ backgroundImage: `url(${previewUrl})` }}
              aria-label={`Aperçu ${label}`}
            />
          ) : (
            <span className="flex flex-col items-center gap-2 px-4 text-sm font-semibold text-neutral-500">
              <UploadSimpleIcon size={24} weight="bold" />
              Ajouter la photo
            </span>
          )}
        </button>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-xs font-semibold text-neutral-500">
            {fileName || "Image JPG, PNG ou HEIC acceptée"}
          </p>
          {fileName && (
            <button
              type="button"
              onClick={clearFile}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-600"
            >
              <XCircleIcon size={14} weight="fill" />
              Retirer
            </button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        id={name}
        name={name}
        type="file"
        accept="image/*"
        required
        className="sr-only"
        onChange={handleChange}
      />
      {fieldError && (
        <p className="text-xs font-semibold text-red-600">{fieldError}</p>
      )}
    </div>
  );
}
