"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { Camera, X, AlertCircle, Image as ImageIcon } from "lucide-react";
import Image from "next/image";
import { MAX_LISTING_PHOTOS, MIN_LISTING_PHOTOS } from "@/lib/validations";

interface PhotoUploaderProps {
  files: File[];
  onChange: (files: File[]) => void;
  min?: number;
  max?: number;
}

export const PhotoUploader: React.FC<PhotoUploaderProps> = ({
  files,
  onChange,
  min = MIN_LISTING_PHOTOS,
  max = MAX_LISTING_PHOTOS,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const updatedFiles = [...files, ...newFiles].slice(0, max);
      onChange(updatedFiles);
    }
  };

  const removeFile = (index: number) => {
    const updatedFiles = files.filter((_, i) => i !== index);
    onChange(updatedFiles);
  };

  const isUnderMin = files.length < min;
  const isAtMax = files.length >= max;

  const previewUrls = useMemo(
    () => files.map((file) => URL.createObjectURL(file)),
    [files],
  );

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <ImageIcon className="w-4 h-4" />
          Photos du bien <span className="text-red-500">*</span> ({files.length}/{max})
        </label>
        <span className={`text-xs ${isUnderMin ? "text-amber-600" : "text-gray-500"}`}>
          Min {min}, Max {max}
        </span>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
        {files.map((file, idx) => (
          <div key={idx} className="relative aspect-square bg-gray-100 rounded-xl overflow-hidden group">
            <Image
              src={previewUrls[idx]}
              alt={`Preview ${idx + 1}`}
              fill
              unoptimized
              className="object-cover"
            />
            <button
              type="button"
              onClick={() => removeFile(idx)}
              className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}

        {!isAtMax && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="aspect-square bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 hover:border-gray-300 transition-all"
          >
            <Camera className="w-6 h-6 text-gray-400" />
            <span className="text-[10px] text-gray-500 mt-1 font-medium">Ajouter</span>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </button>
        )}
      </div>

      {isUnderMin && files.length > 0 && (
        <div className="flex items-center gap-2 text-amber-600 text-xs mt-2 bg-amber-50 p-2 rounded-lg">
          <AlertCircle className="w-3 h-3" />
          Veuillez ajouter au moins {min} photos pour valider l&apos;annonce.
        </div>
      )}
    </div>
  );
};
