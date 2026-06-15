"use client";

import { useState, useEffect, useRef } from "react";
import {
  ImageIcon,
  CheckIcon,
  CloudArrowUpIcon,
  TrashIcon,
  StarIcon,
  ArrowsOutSimpleIcon,
  DownloadSimpleIcon,
  XIcon,
  CaretLeftIcon,
  CaretRightIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import Image from "next/image";
import { useAuth } from "@clerk/nextjs";
import { uploadPropertyPhotoFiles } from "@/lib/clientPropertyPhotoUpload";

interface PhotoManagerProps {
  propertyId: string;
  initialPhotos: string[];
  primaryImageUrl?: string;
  isProfessional: boolean;
  onPhotosUpdated: (isPro: boolean) => void;
}

const sanitizePhotoUrls = (urls: string[]) =>
  urls.filter((url) => typeof url === "string" && url.trim().length > 0);

const extensionFromContentType = (contentType: string | null) => {
  if (!contentType) return null;
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("heic")) return "heic";
  if (contentType.includes("heif")) return "heif";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  return null;
};

const extensionFromUrl = (url: string) => {
  try {
    const pathname = new URL(url, window.location.origin).pathname;
    const fileName = pathname.split("/").pop() || "";
    const extension = fileName.split(".").pop()?.toLowerCase();
    if (extension && /^[a-z0-9]+$/.test(extension) && extension.length <= 5) {
      return extension === "jpeg" ? "jpg" : extension;
    }
  } catch {
    return null;
  }
  return null;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function PhotoManager({
  propertyId,
  initialPhotos = [],
  primaryImageUrl,
  isProfessional,
  onPhotosUpdated,
}: PhotoManagerProps) {
  const { getToken } = useAuth();
  const [photos, setPhotos] = useState<string[]>(
    sanitizePhotoUrls(initialPhotos),
  );
  const [professional, setProfessional] = useState(isProfessional);
  const [uploading, setLoading] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [currentPrimaryUrl, setCurrentPrimaryUrl] = useState(
    primaryImageUrl || "",
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isFullscreenOpen = fullscreenIndex !== null && !!photos[fullscreenIndex];

  const matchedPrimaryIndex = currentPrimaryUrl
    ? photos.findIndex((p) => p === currentPrimaryUrl)
    : -1;
  const primaryIndex = matchedPrimaryIndex >= 0 ? matchedPrimaryIndex : 0;

  useEffect(() => {
    setProfessional(isProfessional);
  }, [isProfessional]);

  // Update photos when initialPhotos changes (e.g. after refresh)
  useEffect(() => {
    const sanitized = sanitizePhotoUrls(initialPhotos);
    setPhotos(sanitized);
  }, [initialPhotos, propertyId]);

  useEffect(() => {
    setCurrentPrimaryUrl(primaryImageUrl || "");
  }, [primaryImageUrl, propertyId]);

  useEffect(() => {
    if (fullscreenIndex !== null && fullscreenIndex >= photos.length) {
      setFullscreenIndex(photos.length > 0 ? photos.length - 1 : null);
    }
  }, [fullscreenIndex, photos.length]);

  useEffect(() => {
    if (!isFullscreenOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFullscreenIndex(null);
      }

      if (event.key === "ArrowRight" && photos.length > 1) {
        setFullscreenIndex((current) =>
          current === null ? current : (current + 1) % photos.length,
        );
      }

      if (event.key === "ArrowLeft" && photos.length > 1) {
        setFullscreenIndex((current) =>
          current === null
            ? current
            : (current - 1 + photos.length) % photos.length,
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreenOpen, photos.length]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    setLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("No token found");
      const files = Array.from(e.target.files);
      const uploadedImages = await uploadPropertyPhotoFiles({
        propertyId,
        token,
        files,
      });
      const newUrls = sanitizePhotoUrls(
        uploadedImages.map((img: { url: string }) => img.url),
      );
      setPhotos((prev) => [...prev, ...newUrls]);
    } catch (error) {
      console.error("Upload error:", error);
      const detail = error instanceof Error ? error.message : String(error);
      alert(`Erreur lors du téléchargement des images\n\n${detail}`);
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const toggleProfessional = () => {
    const newVal = !professional;
    setProfessional(newVal);
    onPhotosUpdated(newVal);
  };

  const getPhotoFilename = (
    url: string,
    index: number,
    contentType?: string | null,
  ) => {
    const extension =
      extensionFromContentType(contentType || null) ||
      extensionFromUrl(url) ||
      "jpg";
    return `roogo-listing-${propertyId}-photo-${index + 1}.${extension}`;
  };

  const downloadPhoto = async (url: string, index: number) => {
    setDownloadingIndex(index);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Unable to download image: ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = getPhotoFilename(
        url,
        index,
        response.headers.get("content-type"),
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error("Download error:", error);
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingIndex(null);
    }
  };

  const downloadAllPhotos = async () => {
    if (photos.length === 0) return;

    setIsDownloadingAll(true);
    try {
      for (let index = 0; index < photos.length; index += 1) {
        await downloadPhoto(photos[index], index);
        await wait(150);
      }
    } finally {
      setIsDownloadingAll(false);
    }
  };

  const showPreviousPhoto = () => {
    if (photos.length <= 1) return;
    setFullscreenIndex((current) =>
      current === null ? current : (current - 1 + photos.length) % photos.length,
    );
  };

  const showNextPhoto = () => {
    if (photos.length <= 1) return;
    setFullscreenIndex((current) =>
      current === null ? current : (current + 1) % photos.length,
    );
  };

  const setPrimary = async (index: number) => {
    const photoUrl = photos[index];
    if (!photoUrl) return;
    // Note: Don't reorder the array - just update the database and rely on primaryImageUrl prop

    try {
      const token = await getToken();
      const response = await fetch(`/api/properties/${propertyId}/images`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url: photoUrl }),
      });

      if (!response.ok) {
        alert("Erreur lors de la définition de la photo principale");
        return;
      }

      setCurrentPrimaryUrl(photoUrl);
    } catch (error) {
      console.error("Set primary error:", error);
      alert("Erreur lors de la définition de la photo principale");
    }
  };

  const removePhoto = async (index: number) => {
    const photoUrl = photos[index];
    if (!photoUrl) return;
    if (!confirm("Voulez-vous vraiment supprimer cette photo ?")) return;

    // Optimistically remove from UI
    const newPhotos = photos.filter((_, i) => i !== index);
    setPhotos(newPhotos);

    try {
      const token = await getToken();
      const response = await fetch(`/api/properties/${propertyId}/images`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url: photoUrl }),
      });

      if (!response.ok) {
        // Revert if failed
        setPhotos(photos);
        alert("Erreur lors de la suppression de l'image");
      }
    } catch (error) {
      console.error("Delete error:", error);
      // No revert needed
      alert("Erreur lors de la suppression de l'image");
    }
  };

  return (
    <>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <ImageIcon size={24} weight="duotone" />
          Photos du Bien
        </h2>
        <div className="flex items-center gap-2">
          {photos.length > 0 && (
            <button
              type="button"
              onClick={downloadAllPhotos}
              disabled={isDownloadingAll}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-700 transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              <DownloadSimpleIcon size={14} weight="bold" />
              {isDownloadingAll ? "Téléchargement..." : "Télécharger tout"}
            </button>
          )}
          <span
            className={`text-[10px] uppercase font-bold px-2 py-1 rounded-full ${
              professional
                ? "bg-green-100 text-green-700"
                : "bg-orange-100 text-orange-700"
            }`}
          >
            {professional ? "Photos Professionnelles" : "Photos Temporaires"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {photos.map((url, i) => (
          <div
            key={i}
            className="aspect-video relative rounded-xl overflow-hidden border border-neutral-100 group"
          >
            <button
              type="button"
              onClick={() => setFullscreenIndex(i)}
              className="absolute inset-0"
              title={`Agrandir la photo ${i + 1}`}
            >
              <Image
                src={url}
                alt={`Photo ${i + 1}`}
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                className="object-cover transition-transform group-hover:scale-105"
              />
            </button>
            <div
              onClick={() => setFullscreenIndex(i)}
              className="absolute inset-0 bg-black/25 opacity-100 transition-opacity sm:bg-black/40 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 flex items-center justify-center gap-2"
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setFullscreenIndex(i);
                }}
                className="p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors backdrop-blur-sm"
                title="Agrandir"
              >
                <ArrowsOutSimpleIcon size={18} weight="bold" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  downloadPhoto(url, i);
                }}
                disabled={downloadingIndex === i || isDownloadingAll}
                className="p-2 bg-white/20 hover:bg-primary rounded-full text-white transition-colors backdrop-blur-sm disabled:cursor-not-allowed disabled:opacity-60"
                title="Télécharger"
              >
                <DownloadSimpleIcon size={18} weight="bold" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setPrimary(i);
                }}
                className={`p-2 rounded-full transition-colors ${i === primaryIndex ? "bg-yellow-400 text-white" : "bg-white/20 hover:bg-yellow-400 text-white"}`}
                title={
                  i === primaryIndex
                    ? "Photo principale"
                    : "Définir comme principale"
                }
              >
                <StarIcon
                  size={18}
                  weight={i === primaryIndex ? "fill" : "regular"}
                />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  removePhoto(i);
                }}
                className="p-2 bg-white/20 hover:bg-red-500 rounded-full text-white transition-colors"
                title="Supprimer"
              >
                <TrashIcon size={18} />
              </button>
            </div>
            {i === primaryIndex && (
              <div className="absolute top-2 left-2 bg-yellow-400 text-white text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider shadow-sm">
                Principale
              </div>
            )}
          </div>
        ))}

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          multiple
          accept="image/*"
          className="hidden"
        />
        <button
          onClick={handleUploadClick}
          disabled={uploading}
          className="aspect-video border-2 border-dashed border-neutral-200 rounded-xl flex flex-col items-center justify-center text-neutral-400 hover:border-primary/50 hover:text-primary transition-all bg-neutral-50/50"
        >
          {uploading ? (
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
          ) : (
            <>
              <CloudArrowUpIcon size={32} />
              <span className="text-[10px] mt-2 font-bold uppercase tracking-wider">
                Importer
              </span>
            </>
          )}
        </button>
      </div>

      {!professional && (
        <div className="pt-4 border-t border-neutral-100">
          <p className="text-xs text-neutral-500 mb-4 bg-blue-50 p-3 rounded-lg border border-blue-100 flex items-start gap-2">
            <CheckIcon size={16} className="text-blue-500 mt-0.5" />
            Une fois que vous avez téléchargé les photos professionnelles,
            validez-les pour mettre l&apos;annonce en ligne.
          </p>
          <Button
            className="w-full bg-primary text-white hover:bg-primary/90 h-12 rounded-xl shadow-lg shadow-primary/20 transition-transform active:scale-[0.98]"
            onClick={toggleProfessional}
          >
            <CheckIcon size={20} className="mr-2" weight="bold" />
            Valider et Publier l&apos;Annonce
          </Button>
        </div>
      )}
    </div>
    {isFullscreenOpen && fullscreenIndex !== null && (
      <div className="fixed inset-0 z-200 bg-black/95 flex items-center justify-center p-4">
        <button
          type="button"
          onClick={() => setFullscreenIndex(null)}
          className="absolute top-4 right-4 z-10 rounded-full bg-white/10 p-3 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
          title="Fermer"
        >
          <XIcon size={28} weight="bold" />
        </button>

        <div className="absolute top-4 left-4 z-10 rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white backdrop-blur-sm">
          {fullscreenIndex + 1} / {photos.length}
        </div>

        <button
          type="button"
          onClick={() => downloadPhoto(photos[fullscreenIndex], fullscreenIndex)}
          disabled={downloadingIndex === fullscreenIndex || isDownloadingAll}
          className="absolute bottom-4 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-5 py-3 text-xs font-bold uppercase tracking-wider text-neutral-900 shadow-lg transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <DownloadSimpleIcon size={18} weight="bold" />
          Télécharger
        </button>

        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={showPreviousPhoto}
              className="absolute left-4 z-10 rounded-full bg-white/10 p-3 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
              title="Photo précédente"
            >
              <CaretLeftIcon size={30} weight="bold" />
            </button>
            <button
              type="button"
              onClick={showNextPhoto}
              className="absolute right-4 z-10 rounded-full bg-white/10 p-3 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
              title="Photo suivante"
            >
              <CaretRightIcon size={30} weight="bold" />
            </button>
          </>
        )}

        <div className="relative h-[85vh] w-[92vw] max-w-7xl">
          <Image
            src={photos[fullscreenIndex]}
            alt={`Photo ${fullscreenIndex + 1}`}
            fill
            sizes="92vw"
            className="object-contain"
            priority
          />
        </div>
      </div>
    )}
    </>
  );
}
