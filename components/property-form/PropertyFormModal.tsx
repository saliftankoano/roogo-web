"use client";

import React, { useState, useEffect } from "react";
import {
  UploadSimpleIcon,
  HouseIcon,
  MapPinIcon,
  InfoIcon,
} from "@phosphor-icons/react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { TIERS_CONFIG } from "@/lib/constants";
import { listingSchema, PROPERTY_TYPES } from "@/lib/validations";
import { LocationPicker } from "./LocationPicker";
import { EquipementsSelector } from "./EquipementsSelector";
import { InterdictionsSelector } from "./InterdictionsSelector";
import { PhotoUploader } from "./PhotoUploader";
import { useExpandableScreen } from "@/components/ui/expandable-screen";
import { savePendingPhotos } from "@/lib/clientPendingPhotos";
import {
  getMockPropertyData,
  getMockPropertyPhotos,
  isDevelopment,
} from "@/lib/mockData";

interface PropertyFormModalProps {
  userType: string;
  onSuccess?: () => void;
}

interface PricingAddon {
  id: string;
  name: string;
  price: number;
}

export const PropertyFormModal: React.FC<PropertyFormModalProps> = ({
  userType,
  onSuccess,
}) => {
  const { getToken } = useAuth();
  const searchParams = useSearchParams();
  const { collapse } = useExpandableScreen();
  const normalizedUserType = userType?.trim().toLowerCase();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [paymentChoice, setPaymentChoice] = useState<"free" | "pay">(
    ["staff", "founder"].includes(normalizedUserType || "") ? "free" : "pay",
  );
  const [addonsList, setAddonsList] = useState<PricingAddon[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<{
    titre: string;
    type: "villa" | "appartement" | "maison" | "terrain" | "commercial";
    prixMensuel: string;
    quartier: string;
    ville: "ouaga" | "bobo";
    latitude: number | undefined;
    longitude: number | undefined;
    description: string;
    chambres: string;
    sdb: string;
    superficie: string;
    vehicules: string;
    cautionMois: string;
    equipements: string[];
    interdictions: string[];
  }>({
    titre: "",
    type: "villa",
    prixMensuel: "",
    quartier: "",
    ville: "ouaga",
    latitude: undefined as number | undefined,
    longitude: undefined as number | undefined,
    description: "",
    chambres: "",
    sdb: "",
    superficie: "",
    vehicules: "",
    cautionMois: "3",
    equipements: [] as string[],
    interdictions: [] as string[],
  });

  const [photos, setPhotos] = useState<File[]>([]);

  const rentAmount = parseInt(formData.prixMensuel, 10) || 0;
  const commissionAmount = rentAmount * 0.05;
  const selectedTierConfig = selectedTier
    ? TIERS_CONFIG[selectedTier as keyof typeof TIERS_CONFIG]
    : null;
  const baseFeeAmount =
    paymentChoice === "free" ? 0 : (selectedTierConfig?.base_fee ?? 0);
  const addOnsAmount =
    paymentChoice === "free"
      ? 0
      : selectedAddOns.reduce((sum, id) => {
          const addon = addonsList.find((item) => item.id === id);
          return sum + (addon?.price || 0);
        }, 0);
  const subtotalAmount =
    baseFeeAmount + (paymentChoice === "free" ? 0 : commissionAmount);
  const totalAmount = subtotalAmount + addOnsAmount;

  useEffect(() => {
    fetch("/api/pricing")
      .then((res) => res.json())
      .then((data) => {
        if (data.addons) setAddonsList(data.addons);
      })
      .catch((err) => console.error("Failed to load addons", err));
  }, []);

  const handleAutoFill = async () => {
    const mockData = getMockPropertyData();
    setFormData(mockData);

    const mockPhotos = await getMockPropertyPhotos();
    setPhotos(mockPhotos);

    setSelectedTier("standard");
    setSelectedAddOns([]);
  };

  const validate = () => {
    const result = listingSchema.safeParse({
      ...formData,
      prixMensuel: Number(formData.prixMensuel),
      chambres: Number(formData.chambres),
      sdb: Number(formData.sdb),
      superficie: Number(formData.superficie),
      vehicules: Number(formData.vehicules),
      cautionMois: Number(formData.cautionMois),
      photos: photos,
    });

    if (!result.success) {
      const newErrors: Record<string, string> = {};
      result.error.issues.forEach((issue: { path: PropertyKey[]; message: string }) => {
        newErrors[issue.path[0] as string] = issue.message;
      });
      setErrors(newErrors);
      return false;
    }

    setErrors({});
    return true;
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      const firstError = Object.values(errors)[0];
      if (firstError) alert(firstError);
      return;
    }

    if (!selectedTier) {
      alert("Veuillez sélectionner un pack");
      return;
    }

    setIsSubmitting(true);

    try {
      const token = await getToken();
      if (!token) throw new Error("No token found");

      if (paymentChoice === "pay") {
        const tier = TIERS_CONFIG[selectedTier as keyof typeof TIERS_CONFIG];
        const rent = parseInt(formData.prixMensuel) || 0;
        const commission = rent * 0.05;
        const addonsTotal = selectedAddOns.reduce((sum, id) => {
          const addon = addonsList.find((a) => a.id === id);
          return sum + (addon?.price || 0);
        }, 0);
        const paymentDescription = `Pack ${selectedTier}${selectedAddOns.length > 0 ? " avec Options" : ""}`;

        const totalAmount = tier.base_fee + commission + addonsTotal;

        const paymentRes = await fetch("/api/payments/paymentpage", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            amount: totalAmount,
            description: paymentDescription,
            transactionType: "listing_submission",
            tier_id: selectedTier,
            add_ons: selectedAddOns,
            metadata: {
              tier_id: selectedTier,
              add_ons: selectedAddOns,
              commission,
            },
          }),
        });

        const paymentData = await paymentRes.json();
        if (!paymentRes.ok) {
          throw new Error(paymentData.error || "Payment init failed");
        }

        if (typeof paymentData?.depositId === "string" && paymentData.depositId.length > 0) {
          sessionStorage.setItem("pendingPaymentDepositId", paymentData.depositId);

          let pendingPhotosStoredInDb = false;
          let pendingPhotosOverflow = false;
          const pendingPhotosCount = photos.length;

          if (photos.length > 0) {
            try {
              const pendingPhotos = await Promise.all(
                photos.map(async (file) => {
                  const data = await fileToBase64(file);
                  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
                  return { data, ext };
                }),
              );
              pendingPhotosStoredInDb = await savePendingPhotos(
                paymentData.depositId,
                pendingPhotos,
              );
              pendingPhotosOverflow = !pendingPhotosStoredInDb;
            } catch {
              pendingPhotosOverflow = true;
            }
          }

          sessionStorage.setItem(
            "pendingAdminListing",
            JSON.stringify({
              formData,
              selectedTier,
              selectedAddOns,
              pendingPhotosOverflow,
              pendingPhotosCount,
              pendingPhotosStoredInDb,
            }),
          );

        }

        if (paymentData.redirectUrl) {
          window.location.href = paymentData.redirectUrl;
          return;
        }
      }

      const depositId = searchParams.get("depositId");

      const response = await fetch("/api/properties", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          listingData: {
            ...formData,
            prixMensuel: Number(formData.prixMensuel),
            chambres: Number(formData.chambres),
            sdb: Number(formData.sdb),
            superficie: Number(formData.superficie),
            vehicules: Number(formData.vehicules),
            cautionMois: Number(formData.cautionMois),
            tier_id: selectedTier,
            add_ons: selectedAddOns,
            payment_id: depositId || undefined,
          },
        }),
      });

      const result = await response.json();
      if (!result.success)
        throw new Error(result.message || "Failed to create property");

      const propertyId = result.propertyId;

      if (photos.length > 0) {
        const base64Images = await Promise.all(
          photos.map(async (file) => {
            const base64 = await fileToBase64(file);
            const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
            return { data: base64, ext };
          }),
        );

        await fetch(`/api/properties/${propertyId}/upload-images`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ images: base64Images }),
        });
      }

      alert("Propriété ajoutée avec succès !");
      if (onSuccess) onSuccess();
      else window.location.reload();
      collapse();
    } catch (error) {
      console.error("Error creating property:", error);
      alert(
        error instanceof Error ? error.message : "Erreur lors de la création.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-12 px-6">
      <div className="mb-10 text-center">
        <div className="flex items-center justify-center gap-4 mb-4">
          <h2 className="text-4xl font-bold text-neutral-900">
            Ajouter une propriété
          </h2>
          {isDevelopment() && normalizedUserType === "founder" && (
            <button
              type="button"
              onClick={handleAutoFill}
              className="px-4 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg font-medium hover:bg-purple-200 transition-colors flex items-center gap-2"
            >
              <span>✨</span>
              Remplir auto (Dev)
            </button>
          )}
        </div>
        <p className="text-neutral-500 text-lg max-w-2xl mx-auto">
          Remplissez les informations ci-dessous pour mettre votre bien en
          ligne.
        </p>
        <p className="text-sm text-neutral-500 mt-3">
          <span className="text-red-500 font-semibold">*</span> Champs
          obligatoires
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-8 bg-white p-10 rounded-[40px] border border-neutral-100 shadow-xl"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="space-y-8">
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                <HouseIcon size={20} className="text-primary" />
                Informations de base
              </h3>

              <div className="space-y-2">
                <label className="text-sm font-bold text-neutral-700 ml-1">
                  Titre de l&apos;annonce{" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  placeholder="Ex: Villa moderne avec piscine"
                  className={`w-full px-6 py-4 bg-neutral-50 rounded-2xl border ${errors.titre ? "border-red-500" : "border-neutral-100"} focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none`}
                  value={formData.titre}
                  onChange={(e) =>
                    setFormData({ ...formData, titre: e.target.value })
                  }
                />
                {errors.titre && (
                  <p className="text-xs text-red-500 ml-1">{errors.titre}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-neutral-700 ml-1">
                    Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="w-full px-6 py-4 bg-neutral-50 rounded-2xl border border-neutral-100 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none appearance-none"
                    value={formData.type}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        type: e.target.value as
                          | "villa"
                          | "appartement"
                          | "maison"
                          | "terrain"
                          | "commercial",
                      })
                    }
                  >
                    {PROPERTY_TYPES.map((propertyType) => (
                      <option key={propertyType.id} value={propertyType.id}>
                        {propertyType.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-neutral-700 ml-1">
                    Prix (CFA/mois) <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    type="number"
                    placeholder="500000"
                    className={`w-full px-6 py-4 bg-neutral-50 rounded-2xl border ${errors.prixMensuel ? "border-red-500" : "border-neutral-100"} focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none`}
                    value={formData.prixMensuel}
                    onChange={(e) =>
                      setFormData({ ...formData, prixMensuel: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                <MapPinIcon size={20} className="text-primary" />
                Localisation
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-neutral-700 ml-1">
                    Ville <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="w-full px-6 py-4 bg-neutral-50 rounded-2xl border border-neutral-100 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none appearance-none"
                    value={formData.ville}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        ville: e.target.value as "ouaga" | "bobo",
                      })
                    }
                  >
                    <option value="ouaga">Ouagadougou</option>
                    <option value="bobo">Bobo-Dioulasso</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-neutral-700 ml-1">
                    Quartier <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    placeholder="Ex: Ouaga 2000"
                    className={`w-full px-6 py-4 bg-neutral-50 rounded-2xl border ${errors.quartier ? "border-red-500" : "border-neutral-100"} focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none`}
                    value={formData.quartier}
                    onChange={(e) =>
                      setFormData({ ...formData, quartier: e.target.value })
                    }
                  />
                </div>
              </div>
              <LocationPicker
                latitude={formData.latitude}
                longitude={formData.longitude}
                onChange={(lat, lng) =>
                  setFormData({ ...formData, latitude: lat, longitude: lng })
                }
              />
            </div>

            <div className="space-y-6">
              <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                <InfoIcon size={20} className="text-primary" />
                Détails du bien
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider ml-1">
                    Chambres <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    min="1"
                    type="number"
                    className="w-full px-6 py-4 bg-neutral-50 rounded-2xl border border-neutral-100 outline-none"
                    value={formData.chambres}
                    onChange={(e) =>
                      setFormData({ ...formData, chambres: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider ml-1">
                    SDB <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    min="1"
                    type="number"
                    className="w-full px-6 py-4 bg-neutral-50 rounded-2xl border border-neutral-100 outline-none"
                    value={formData.sdb}
                    onChange={(e) =>
                      setFormData({ ...formData, sdb: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider ml-1">
                    m² <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    min="1"
                    type="number"
                    className="w-full px-6 py-4 bg-neutral-50 rounded-2xl border border-neutral-100 outline-none"
                    value={formData.superficie}
                    onChange={(e) =>
                      setFormData({ ...formData, superficie: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider ml-1">
                    Parkings <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    min="0"
                    type="number"
                    className="w-full px-6 py-4 bg-neutral-50 rounded-2xl border border-neutral-100 outline-none"
                    value={formData.vehicules}
                    onChange={(e) =>
                      setFormData({ ...formData, vehicules: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-neutral-700 ml-1">
                  Caution (mois)
                </label>
                <input
                  type="number"
                  className="w-full px-6 py-4 bg-neutral-50 rounded-2xl border border-neutral-100 outline-none"
                  value={formData.cautionMois}
                  onChange={(e) =>
                    setFormData({ ...formData, cautionMois: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-neutral-700 ml-1 flex justify-between">
                  <span>
                    Description <span className="text-red-500">*</span>
                  </span>
                  <span className="text-xs font-normal text-neutral-400">
                    {formData.description.length}/1200
                  </span>
                </label>
                <textarea
                  required
                  minLength={10}
                  maxLength={1200}
                  rows={4}
                  placeholder="Décrivez le bien..."
                  className={`w-full px-6 py-4 bg-neutral-50 rounded-3xl border ${errors.description ? "border-red-500" : "border-neutral-100"} outline-none resize-none`}
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <PhotoUploader files={photos} onChange={setPhotos} />
            <EquipementsSelector
              selected={formData.equipements}
              onChange={(val) => setFormData({ ...formData, equipements: val })}
            />
            <InterdictionsSelector
              selected={formData.interdictions}
              onChange={(val) =>
                setFormData({ ...formData, interdictions: val })
              }
            />
          </div>
        </div>

        <div className="space-y-6 pt-8 border-t border-neutral-100">
          <h3 className="text-2xl font-bold text-neutral-900">
            Offre & Paiement <span className="text-red-500">*</span>
          </h3>
          {["staff", "founder"].includes(normalizedUserType || "") && (
            <div className="flex bg-neutral-100 p-1 rounded-xl max-w-md">
              <button
                type="button"
                onClick={() => setPaymentChoice("free")}
                className={`flex-1 py-3 rounded-lg font-bold transition-all ${paymentChoice === "free" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
              >
                Gratuit (Staff)
              </button>
              <button
                type="button"
                onClick={() => setPaymentChoice("pay")}
                className={`flex-1 py-3 rounded-lg font-bold transition-all ${paymentChoice === "pay" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
              >
                Payer pour client
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(TIERS_CONFIG).map(
              ([key, tier]: [
                string,
                (typeof TIERS_CONFIG)[keyof typeof TIERS_CONFIG],
              ]) => (
                <div
                  key={key}
                  onClick={() => setSelectedTier(key)}
                  className={`border-2 rounded-2xl p-5 cursor-pointer transition-all ${selectedTier === key ? "border-primary bg-primary/5" : "border-neutral-100"}`}
                >
                  <h4 className="font-bold text-lg capitalize mb-2">{key}</h4>
                  <div className="text-2xl font-bold mb-4">
                    {paymentChoice === "free"
                      ? "0 F"
                      : `${tier.base_fee.toLocaleString()} F`}
                  </div>
                  <ul className="space-y-2 text-sm text-neutral-600">
                    <li>• {tier.photo_limit} photos</li>
                    <li>• {tier.slot_limit} candidats</li>
                    {tier.video_included && <li>• Vidéo incluse</li>}
                  </ul>
                </div>
              ),
            )}
          </div>

          {addonsList.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-bold text-lg">Options supplémentaires</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {addonsList.map((addon) => (
                  <label
                    key={addon.id}
                    className={`flex items-center p-4 border rounded-xl cursor-pointer transition-all ${selectedAddOns.includes(addon.id) ? "border-primary bg-primary/5" : "border-neutral-100"}`}
                  >
                    <input
                      type="checkbox"
                      className="w-5 h-5 rounded border-neutral-300 text-primary"
                      checked={selectedAddOns.includes(addon.id)}
                      onChange={(e) => {
                        if (e.target.checked)
                          setSelectedAddOns([...selectedAddOns, addon.id]);
                        else
                          setSelectedAddOns(
                            selectedAddOns.filter((id) => id !== addon.id),
                          );
                      }}
                    />
                    <div className="ml-3 flex-1">
                      <div className="font-bold">{addon.name}</div>
                      <div className="text-sm text-neutral-500">
                        {paymentChoice === "free"
                          ? "Gratuit"
                          : `+${addon.price.toLocaleString()} F`}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5 space-y-3">
            <h4 className="font-bold text-lg text-neutral-900">
              Récapitulatif du paiement
            </h4>
            <div className="flex items-center justify-between text-sm text-neutral-600">
              <span>Sous-total (pack + commission)</span>
              <span className="font-semibold text-neutral-800">
                {subtotalAmount.toLocaleString()} F
              </span>
            </div>
            <div className="flex items-center justify-between text-sm text-neutral-600">
              <span>Options supplémentaires</span>
              <span className="font-semibold text-neutral-800">
                {addOnsAmount.toLocaleString()} F
              </span>
            </div>
            <div className="pt-3 border-t border-neutral-200 flex items-center justify-between text-base">
              <span className="font-bold text-neutral-900">Total à payer</span>
              <span className="font-extrabold text-primary text-xl">
                {totalAmount.toLocaleString()} F
              </span>
            </div>
          </div>
        </div>

        <div className="pt-12 border-t border-neutral-100 flex flex-col sm:flex-row gap-4">
          <button
            type="button"
            onClick={collapse}
            className="flex-1 py-5 bg-neutral-100 text-neutral-600 rounded-full font-bold text-xl"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-2 py-5 bg-primary text-white rounded-full font-bold text-xl shadow-xl flex items-center justify-center gap-3 disabled:opacity-70"
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin" size={28} />
            ) : (
              <>
                <UploadSimpleIcon size={28} weight="bold" />
                <span>Publier</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
