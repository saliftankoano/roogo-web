"use client";

import { useState } from "react";
import {
  ImageIcon,
  CheckIcon,
  CloudArrowUpIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import Image from "next/image";

interface PhotoManagerProps {
  propertyId: string;
  initialPhotos: string[];
  isProfessional: boolean;
  onPhotosUpdated: (isPro: boolean) => void;
}

export default function PhotoManager({
  initialPhotos = [],
  isProfessional,
  onPhotosUpdated,
}: PhotoManagerProps) {
  const [photos, setPhotos] = useState<string[]>(initialPhotos);
  const [professional, setProfessional] = useState(isProfessional);
  const [uploading, setLoading] = useState(false);

  const handleUpload = () => {
    // Mock upload
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      // In a real app, update state with new URLs
    }, 1500);
  };

  const toggleProfessional = () => {
    const newVal = !professional;
    setProfessional(newVal);
    onPhotosUpdated(newVal);
  };

  const removePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
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
            <Image src={url} alt={`Photo ${i}`} fill className="object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button
                onClick={() => removePhoto(i)}
                className="p-2 bg-white/20 hover:bg-red-500 rounded-full text-white transition-colors"
              >
                <TrashIcon size={18} />
              </button>
            </div>
          </div>
        ))}

        <button
          onClick={handleUpload}
          disabled={uploading}
          className="aspect-video border-2 border-dashed border-neutral-200 rounded-xl flex flex-col items-center justify-center text-neutral-400 hover:border-primary/50 hover:text-primary transition-all bg-neutral-50/50"
        >
          {uploading ? (
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
          ) : (
            <>
              <CloudArrowUpIcon size={32} />
              <span className="text-[10px] mt-2 font-bold uppercase tracking-wider">
                Télécharger
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
