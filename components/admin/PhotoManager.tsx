"use client";

import { useState, useEffect, useRef } from "react";
import {
  ImageIcon,
  CheckIcon,
  CloudArrowUpIcon,
  TrashIcon,
  StarIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import Image from "next/image";
import { useAuth } from "@clerk/nextjs";

interface PhotoManagerProps {
  propertyId: string;
  initialPhotos: string[];
  isProfessional: boolean;
  onPhotosUpdated: (isPro: boolean) => void;
}

export default function PhotoManager({
  propertyId,
  initialPhotos = [],
  isProfessional,
  onPhotosUpdated,
}: PhotoManagerProps) {
  const { getToken } = useAuth();
  const [photos, setPhotos] = useState<string[]>(initialPhotos);
  const [professional, setProfessional] = useState(isProfessional);
  const [uploading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setProfessional(isProfessional);
  }, [isProfessional]);

  // Update photos when initialPhotos changes (e.g. after refresh)
  useEffect(() => {
    setPhotos(initialPhotos);
  }, [initialPhotos]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    setLoading(true);
    try {
      const token = await getToken();
      const files = Array.from(e.target.files);
      const processedImages = await Promise.all(
        files.map((file) => readFile(file))
      );

      const response = await fetch(
        `/api/properties/${propertyId}/upload-images`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            images: processedImages,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to upload images");
      }

      const result = await response.json();
      if (result.success && result.images) {
        // Add new photos to state
        const newUrls = result.images.map((img: { url: string }) => img.url);
        setPhotos((prev) => [...prev, ...newUrls]);
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("Erreur lors du téléchargement des images");
    } finally {
      setLoading(false);
      // Reset input
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

  const setPrimary = async (index: number) => {
    const photoUrl = photos[index];
    // Optimistic update - move selected photo to start
    const newPhotos = [...photos];
    newPhotos.splice(index, 1);
    newPhotos.unshift(photoUrl);
    setPhotos(newPhotos);

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
        // Revert if failed
        setPhotos(photos);
        alert("Erreur lors de la définition de la photo principale");
      }
    } catch (error) {
      console.error("Set primary error:", error);
      setPhotos(photos); // Revert
      alert("Erreur lors de la définition de la photo principale");
    }
  };

  const removePhoto = async (index: number) => {
    const photoUrl = photos[index];
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
      setPhotos(photos); // Revert
      alert("Erreur lors de la suppression de l'image");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <ImageIcon size={24} weight="duotone" />
          Photos du Bien
        </h2>
        <div className="flex items-center gap-2">
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
            <Image
              src={url}
              alt={`Photo ${i}`}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button
                onClick={() => setPrimary(i)}
                className={`p-2 rounded-full transition-colors ${i === 0 ? "bg-yellow-400 text-white" : "bg-white/20 hover:bg-yellow-400 text-white"}`}
                title={i === 0 ? "Photo principale" : "Définir comme principale"}
              >
                <StarIcon size={18} weight={i === 0 ? "fill" : "regular"} />
              </button>
              <button
                onClick={() => removePhoto(i)}
                className="p-2 bg-white/20 hover:bg-red-500 rounded-full text-white transition-colors"
              >
                <TrashIcon size={18} />
              </button>
            </div>
            {i === 0 && (
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
  );
}

const readFile = (
  file: File
): Promise<{ data: string; width: number; height: number; ext: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      // data:image/jpeg;base64,...
      const base64 = dataUrl.split(",")[1];
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";

      const img = new window.Image();
      img.onload = () => {
        resolve({
          data: base64,
          width: img.width,
          height: img.height,
          ext,
        });
      };
      img.onerror = reject;
      img.src = dataUrl;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};
