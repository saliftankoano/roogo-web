"use client";

import React, { useState } from "react";
import { MapPin, Crosshair, X, Loader2 } from "lucide-react";

interface LocationPickerProps {
  latitude?: number;
  longitude?: number;
  onChange: (lat?: number, lng?: number) => void;
}

export const LocationPicker: React.FC<LocationPickerProps> = ({
  latitude,
  longitude,
  onChange,
}) => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCaptureLocation = () => {
    setIsCapturing(true);
    setError(null);

    if (!navigator.geolocation) {
      setError("La géolocalisation n'est pas supportée par votre navigateur");
      setIsCapturing(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange(position.coords.latitude, position.coords.longitude);
        setIsCapturing(false);
      },
      (err) => {
        console.error("Geolocation error:", err);
        setError("Impossible de récupérer votre position. Assurez-vous d'avoir autorisé l'accès.");
        setIsCapturing(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleClear = () => {
    onChange(undefined, undefined);
    setError(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Coordonnées GPS (Optionnel)
        </label>
        {(latitude !== undefined || longitude !== undefined) && (
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Effacer
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="relative">
          <input
            type="number"
            step="any"
            placeholder="Latitude"
            value={latitude ?? ""}
            onChange={(e) => onChange(e.target.value ? parseFloat(e.target.value) : undefined, longitude)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"
          />
        </div>
        <div className="relative">
          <input
            type="number"
            step="any"
            placeholder="Longitude"
            value={longitude ?? ""}
            onChange={(e) => onChange(latitude, e.target.value ? parseFloat(e.target.value) : undefined)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleCaptureLocation}
        disabled={isCapturing}
        className="w-full flex items-center justify-center gap-2 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black disabled:opacity-50 transition-colors"
      >
        {isCapturing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Crosshair className="w-4 h-4" />
        )}
        {isCapturing ? "Localisation en cours..." : "Capturer ma position actuelle"}
      </button>

      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
      
      {latitude !== undefined && longitude !== undefined && !isCapturing && (
        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
          ✓ Position capturée avec succès
        </p>
      )}
    </div>
  );
};
