"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  CheckCircleIcon,
  ClockIcon,
  FilePdfIcon,
  HouseLineIcon,
  SealCheckIcon,
  UploadSimpleIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type OwnershipUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  user_type: string;
};

type OwnershipProperty = {
  id: string;
  property_type: string;
  price: number;
  quartier: string;
  city: string;
  status: string;
  ownership_verification_status: string;
};

type OwnershipSubmission = {
  id: string;
  property_id: string;
  user_id: string;
  status: "pending" | "approved" | "rejected";
  submitted_at: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
  review_notes: string | null;
  users: OwnershipUser | null;
  property: OwnershipProperty | null;
};

type OwnershipDetail = OwnershipSubmission & {
  documents: OwnershipDocument[];
};

type OwnershipDocument = {
  label: string;
  storage_path: string;
  url: string | null;
  file_name?: string;
  mime_type?: string;
  size_bytes?: number;
  source?: "seller" | "staff";
};

type PreparedUpload = {
  body: Blob;
  file_name: string;
  label: string;
  mime_type: string;
  size_bytes: number;
};

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_FILES = 10;

const fileMimeByExtension: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

const supportedInputMimeTypes = new Set(Object.values(fileMimeByExtension));

const statusTabs = [
  { value: "pending", label: "En attente" },
  { value: "approved", label: "Approuvées" },
  { value: "rejected", label: "Rejetées" },
  { value: "all", label: "Toutes" },
];

const statusConfig = {
  pending: {
    label: "En attente",
    className: "bg-amber-50 text-amber-700 border-amber-200",
    Icon: ClockIcon,
  },
  approved: {
    label: "Approuvée",
    className: "bg-green-50 text-green-700 border-green-200",
    Icon: CheckCircleIcon,
  },
  rejected: {
    label: "Rejetée",
    className: "bg-red-50 text-red-600 border-red-200",
    Icon: XCircleIcon,
  },
};

function formatDate(value: string | null) {
  if (!value) return "Non renseigné";
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDisplayName(user: OwnershipUser | null) {
  return user?.full_name || user?.email || "Vendeur sans nom";
}

function propertyLabel(property: OwnershipProperty | null) {
  if (!property) return "Bien inconnu";
  return `${property.property_type} · ${property.quartier}, ${property.city}`;
}

function extensionFromName(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function getInputMimeType(file: File) {
  return file.type.toLowerCase() || fileMimeByExtension[extensionFromName(file.name)] || "";
}

function labelFromFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").trim() || "Document";
}

function replaceExtension(fileName: string, extension: string) {
  const base = fileName.replace(/\.[^.]+$/, "").trim() || "document";
  return `${base}.${extension}`;
}

function base64ToBlob(base64: string, mimeType: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

async function prepareUpload(file: File): Promise<PreparedUpload> {
  const inputMimeType = getInputMimeType(file);
  const isImage = inputMimeType.startsWith("image/");

  if (!supportedInputMimeTypes.has(inputMimeType)) {
    throw new Error(
      `« ${file.name} » n'est pas pris en charge. Utilisez PDF, JPG, PNG ou WebP.`,
    );
  }
  if (file.size < 1 || file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`« ${file.name} » dépasse la limite de 10 Mo.`);
  }

  if (!isImage) {
    return {
      body: file,
      file_name: file.name,
      label: labelFromFileName(file.name),
      mime_type: "application/pdf",
      size_bytes: file.size,
    };
  }

  const { compressImageToBase64 } = await import("@/lib/clientImageCompression");
  const compressed = await compressImageToBase64(file);
  const outputMimeType = fileMimeByExtension[compressed.ext] || "";
  if (!["image/jpeg", "image/png", "image/webp"].includes(outputMimeType)) {
    throw new Error(`Impossible de convertir « ${file.name} » en image compatible.`);
  }

  const body = base64ToBlob(compressed.data, outputMimeType);
  if (body.size < 1 || body.size > MAX_UPLOAD_BYTES) {
    throw new Error(`« ${file.name} » dépasse 10 Mo après optimisation.`);
  }

  const extension = outputMimeType === "image/jpeg" ? "jpg" : compressed.ext;
  return {
    body,
    file_name: replaceExtension(file.name, extension),
    label: labelFromFileName(file.name),
    mime_type: outputMimeType,
    size_bytes: body.size,
  };
}

function isImageDocument(document: OwnershipDocument) {
  if (document.mime_type) return document.mime_type.startsWith("image/");
  return /\.(jpe?g|png|webp)$/i.test(document.storage_path);
}

function formatFileSize(value?: number) {
  if (!value || value < 1) return null;
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} Ko`;
  return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function AdminOwnershipVerificationsPage() {
  const [status, setStatus] = useState("pending");
  const [submissions, setSubmissions] = useState<OwnershipSubmission[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OwnershipDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewing, setReviewing] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadSubmissions(nextStatus = status) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/ownership-verifications?status=${nextStatus}`,
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Impossible de charger les vérifications");
      setSubmissions(data.submissions || []);
      setSelectedId((current) => {
        if (
          current &&
          data.submissions?.some((item: OwnershipSubmission) => item.id === current)
        ) {
          return current;
        }
        return data.submissions?.[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSubmissions(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    async function loadDetail() {
      if (!selectedId) {
        setDetail(null);
        return;
      }
      setDetailLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/admin/ownership-verifications/${selectedId}`);
        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error || "Impossible de charger la soumission");
        setDetail(data.submission);
        setReason(data.submission?.rejection_reason || "");
        setNotes(data.submission?.review_notes || "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      } finally {
        setDetailLoading(false);
      }
    }
    loadDetail();
  }, [selectedId]);

  const selectedSubmission = useMemo(
    () => submissions.find((submission) => submission.id === selectedId) ?? null,
    [selectedId, submissions],
  );

  async function submitReview(decision: "approve" | "reject") {
    if (!selectedId) return;
    setReviewing(decision);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/ownership-verifications/${selectedId}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, reason, notes }),
        },
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Impossible d'enregistrer la décision");
      await loadSubmissions(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setReviewing(null);
    }
  }

  async function uploadDocuments(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selectedId || files.length === 0) return;

    if (files.length > MAX_UPLOAD_FILES) {
      setError("Vous pouvez ajouter 10 fichiers à la fois maximum.");
      return;
    }
    if ((detail?.documents.length ?? 0) + files.length > 20) {
      setError("Une soumission ne peut pas contenir plus de 20 fichiers.");
      return;
    }

    setUploading(true);
    setError("");
    try {
      const prepared: PreparedUpload[] = [];
      for (const file of files) {
        prepared.push(await prepareUpload(file));
      }

      const slotResponse = await fetch(
        `/api/admin/ownership-verifications/${selectedId}/documents/upload-url`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: prepared.map((file) => ({
              file_name: file.file_name,
              mime_type: file.mime_type,
              size_bytes: file.size_bytes,
            })),
          }),
        },
      );
      const slotData = await slotResponse.json().catch(() => ({}));
      if (!slotResponse.ok) {
        throw new Error(slotData.error || "Impossible de préparer les fichiers.");
      }

      await Promise.all(
        prepared.map(async (file, index) => {
          const upload = slotData.uploads?.[index];
          if (!upload?.signed_url) {
            throw new Error("Lien de téléversement manquant.");
          }
          const response = await fetch(upload.signed_url, {
            method: "PUT",
            headers: { "Content-Type": file.mime_type },
            body: file.body,
          });
          if (!response.ok) {
            const detail = await response.text().catch(() => "");
            throw new Error(
              `Échec du téléversement de « ${file.file_name} » (${response.status}${detail ? ` : ${detail}` : ""}).`,
            );
          }
        }),
      );

      const attachResponse = await fetch(
        `/api/admin/ownership-verifications/${selectedId}/documents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documents: prepared.map((file, index) => ({
              label: file.label,
              storage_path: slotData.uploads[index].path,
              file_name: file.file_name,
              mime_type: file.mime_type,
              size_bytes: file.size_bytes,
            })),
          }),
        },
      );
      const attachData = await attachResponse.json().catch(() => ({}));
      if (!attachResponse.ok) {
        throw new Error(
          attachData.error || "Impossible d'ajouter les fichiers à la soumission.",
        );
      }

      setDetail((current) =>
        current ? { ...current, documents: attachData.documents ?? [] } : current,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Téléversement impossible");
    } finally {
      setUploading(false);
    }
  }

  const detailStatus = detail?.status ?? selectedSubmission?.status ?? "pending";
  const StatusIcon = statusConfig[detailStatus].Icon;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <HouseLineIcon size={24} weight="bold" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-neutral-900">
                Documents de propriété
              </h1>
              <p className="mt-1 text-sm font-medium text-neutral-500">
                Vérifiez les titres avant de publier une annonce à vendre.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 rounded-full border border-neutral-100 bg-white p-1 shadow-sm">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatus(tab.value)}
              className={cn(
                "rounded-full px-4 py-2 text-xs font-black uppercase tracking-wider transition-all",
                status === tab.value
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-500 hover:bg-neutral-50",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <section className="rounded-[32px] border border-neutral-100 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between px-2">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-neutral-400">
              File de revue
            </h2>
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-500">
              {submissions.length}
            </span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="h-24 animate-pulse rounded-3xl bg-neutral-50"
                />
              ))}
            </div>
          ) : submissions.length === 0 ? (
            <div className="rounded-3xl bg-neutral-50 p-8 text-center">
              <SealCheckIcon
                size={40}
                weight="duotone"
                className="mx-auto text-neutral-300"
              />
              <p className="mt-3 text-sm font-bold text-neutral-500">
                Aucune soumission dans cette vue.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {submissions.map((submission) => {
                const cfg = statusConfig[submission.status];
                const Icon = cfg.Icon;
                return (
                  <button
                    key={submission.id}
                    onClick={() => setSelectedId(submission.id)}
                    className={cn(
                      "w-full rounded-3xl border p-4 text-left transition-all",
                      selectedId === submission.id
                        ? "border-primary bg-primary/5"
                        : "border-neutral-100 hover:border-primary/30 hover:bg-neutral-50",
                    )}
                  >
                    <p className="truncate text-sm font-black text-neutral-900">
                      {propertyLabel(submission.property)}
                    </p>
                    <p className="mt-0.5 truncate text-xs font-bold uppercase tracking-wider text-neutral-400">
                      {getDisplayName(submission.users)} ·{" "}
                      {formatDate(submission.submitted_at)}
                    </p>
                    <span
                      className={cn(
                        "mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider",
                        cfg.className,
                      )}
                    >
                      <Icon size={11} weight="fill" />
                      {cfg.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="min-h-[560px] rounded-[32px] border border-neutral-100 bg-white p-6 shadow-sm">
          {!selectedId ? (
            <div className="flex h-full min-h-[420px] items-center justify-center rounded-3xl bg-neutral-50 text-center">
              <div>
                <HouseLineIcon
                  size={56}
                  weight="duotone"
                  className="mx-auto text-neutral-300"
                />
                <p className="mt-4 text-sm font-bold text-neutral-500">
                  Sélectionnez une soumission pour voir les documents.
                </p>
              </div>
            </div>
          ) : detailLoading || !detail ? (
            <div className="h-[520px] animate-pulse rounded-3xl bg-neutral-50" />
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col gap-4 border-b border-neutral-100 pb-6 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-black tracking-tight text-neutral-900">
                      {propertyLabel(detail.property)}
                    </h2>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-[10px] font-black uppercase tracking-widest",
                        statusConfig[detailStatus].className,
                      )}
                    >
                      <StatusIcon size={11} weight="fill" />
                      {statusConfig[detailStatus].label}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm font-bold text-neutral-500">
                    <span>Vendeur : {getDisplayName(detail.users)}</span>
                    <span>{detail.users?.phone || "Téléphone non renseigné"}</span>
                    <span>Soumis le {formatDate(detail.submitted_at)}</span>
                  </div>
                </div>
              </div>

              {detail.status === "pending" && (
                <div className="rounded-3xl border border-dashed border-primary/30 bg-primary/5 p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-primary shadow-sm">
                        <UploadSimpleIcon size={22} weight="bold" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-neutral-900">
                          Ajouter des documents ou des images
                        </p>
                        <p className="mt-1 text-xs font-medium text-neutral-500">
                          PDF, JPG, PNG, WebP ou HEIC. 10 Mo maximum par fichier,
                          10 fichiers à la fois.
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="h-11 shrink-0 rounded-2xl px-5"
                    >
                      <UploadSimpleIcon size={17} weight="bold" className="mr-2" />
                      {uploading ? "Ajout en cours..." : "Choisir des fichiers"}
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      hidden
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
                      onChange={uploadDocuments}
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                {detail.documents.length === 0 ? (
                  <p className="text-sm font-bold text-neutral-400">
                    Aucun document fourni.
                  </p>
                ) : (
                  detail.documents.map((doc, index) => (
                    <div
                      key={`${doc.storage_path}-${index}`}
                      className="overflow-hidden rounded-3xl border border-neutral-100 bg-neutral-50"
                    >
                      <div className="border-b border-neutral-100 bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-neutral-400">
                        {doc.label}
                      </div>
                      {doc.url && isImageDocument(doc) ? (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="relative block h-[360px]"
                        >
                          <Image
                            src={doc.url}
                            alt={doc.label}
                            fill
                            sizes="(max-width: 1024px) 100vw, 50vw"
                            unoptimized
                            className="object-contain"
                          />
                        </a>
                      ) : doc.url ? (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-[360px] flex-col items-center justify-center p-8 text-center transition hover:bg-white"
                        >
                          <FilePdfIcon
                            size={64}
                            weight="duotone"
                            className="text-red-500"
                          />
                          <span className="mt-4 max-w-full truncate text-sm font-black text-neutral-800">
                            {doc.file_name || doc.label}
                          </span>
                          <span className="mt-1 text-xs font-bold text-neutral-400">
                            {[formatFileSize(doc.size_bytes), "Ouvrir le document"]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          {doc.source === "staff" && (
                            <span className="mt-4 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-primary">
                              Ajouté par l&apos;équipe
                            </span>
                          )}
                        </a>
                      ) : (
                        <div className="flex h-[360px] items-center justify-center text-sm font-bold text-neutral-400">
                          URL signée indisponible
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {detail.status === "pending" ? (
                <div className="rounded-3xl border border-neutral-100 bg-neutral-50 p-5">
                  <label className="block text-xs font-black uppercase tracking-[0.2em] text-neutral-400">
                    Notes internes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className="mt-2 min-h-20 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-primary"
                    placeholder="Notes visibles seulement par l'équipe..."
                  />

                  <label className="mt-4 block text-xs font-black uppercase tracking-[0.2em] text-neutral-400">
                    Raison du rejet
                  </label>
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    className="mt-2 min-h-20 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-primary"
                    placeholder="Obligatoire uniquement pour rejeter..."
                  />

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <Button
                      onClick={() => submitReview("approve")}
                      disabled={!!reviewing}
                      className="h-12 flex-1 rounded-2xl bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircleIcon size={18} weight="bold" className="mr-2" />
                      {reviewing === "approve" ? "Validation..." : "Approuver"}
                    </Button>
                    <Button
                      onClick={() => submitReview("reject")}
                      disabled={!!reviewing}
                      className="h-12 flex-1 rounded-2xl bg-red-600 hover:bg-red-700"
                    >
                      <XCircleIcon size={18} weight="bold" className="mr-2" />
                      {reviewing === "reject" ? "Rejet..." : "Rejeter"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-neutral-100 bg-neutral-50 p-5">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-400">
                    Décision
                  </p>
                  <p className="mt-2 text-sm font-bold text-neutral-700">
                    {detail.status === "approved"
                      ? "Ces documents ont été approuvés. L'annonce peut être mise en ligne."
                      : detail.rejection_reason || "Ces documents ont été rejetés."}
                  </p>
                  <p className="mt-1 text-xs font-medium text-neutral-400">
                    Revue le {formatDate(detail.reviewed_at)}
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
