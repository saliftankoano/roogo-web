"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  UsersIcon,
  CaretLeftIcon,
  TrendUpIcon,
  MapPinIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import PhotoManager from "@/components/admin/PhotoManager";
import OpenHouseSlotManager from "@/components/admin/OpenHouseSlotManager";

interface ListingDetail {
  id: string;
  titre: string;
  type: string;
  prixMensuel: number;
  quartier: string;
  ville: string;
  status: string;
  tier_id: string;
  slot_limit: number;
  slots_filled: number;
  open_house_limit: number;
  photos_are_professional: boolean;
  owner: {
    name: string;
    email: string;
    phone: string;
  };
  photos: string[];
}

export default function ListingDetailPage() {
  const params = useParams();
  const id = (params?.id as string) || "";
  const router = useRouter();
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock fetch
    setTimeout(() => {
      setLoading(false);
    }, 500);
  }, [id]);

  if (loading)
    return <div className="p-10 text-center animate-pulse">Chargement...</div>;

  // Fallback mock
  const mockListing: ListingDetail = {
    id,
    titre: "Villa Moderne Zone A",
    type: "Villa",
    prixMensuel: 450000,
    quartier: "Ouaga 2000",
    ville: "Ouagadougou",
    status: "en_attente",
    tier_id: "standard",
    slot_limit: 50,
    slots_filled: 12,
    open_house_limit: 2,
    photos_are_professional: false,
    owner: {
      name: "Jean Ouedraogo",
      email: "jean.o@example.com",
      phone: "+226 70 11 22 33",
    },
    photos: ["/hero-bg.jpg", "/hero-bg.jpg"],
  };

  const currentListing: ListingDetail = listing || mockListing;

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "en_attente":
        return "Photo Pro Requise";
      case "en_ligne":
        return "Publiée";
      case "closing":
        return "Fermeture Bientôt";
      case "expired":
        return "Expirée";
      default:
        return status;
    }
  };

  const handlePhotosUpdated = (isPro: boolean) => {
    setListing({
      ...currentListing,
      photos_are_professional: isPro,
      status: isPro ? "en_ligne" : "en_attente",
    });
  };

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-10 space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="rounded-full w-10 h-10 p-0 hover:bg-neutral-100"
          >
            <CaretLeftIcon size={24} />
          </Button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                  currentListing.status === "en_ligne"
                    ? "bg-green-50 text-green-700 border-green-200"
                    : "bg-yellow-50 text-yellow-700 border-yellow-200"
                }`}
              >
                {getStatusLabel(currentListing.status)}
              </span>
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                Pack {currentListing.tier_id}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-neutral-900">
              {currentListing.titre}
            </h1>
            <div className="flex items-center gap-1.5 text-xs text-neutral-500 mt-1">
              <MapPinIcon size={14} />
              {currentListing.quartier}, {currentListing.ville}
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            variant="ghost"
            className="text-red-600 hover:bg-red-50 text-xs font-bold uppercase tracking-wider"
          >
            Supprimer
          </Button>
          <Button className="bg-neutral-900 text-white text-xs font-bold uppercase tracking-wider px-6">
            Éditer
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Management */}
        <div className="lg:col-span-2 space-y-8">
          {/* Photo Management */}
          <section className="bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm">
            <PhotoManager
              propertyId={currentListing.id}
              initialPhotos={currentListing.photos}
              isProfessional={currentListing.photos_are_professional}
              onPhotosUpdated={handlePhotosUpdated}
            />
          </section>

          {/* Open House Management */}
          <section className="bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm">
            <OpenHouseSlotManager
              propertyId={currentListing.id}
              limit={currentListing.open_house_limit}
              existingSlots={[]}
            />
          </section>
        </div>

        {/* Right Column: Stats & Owner */}
        <div className="space-y-8">
          {/* Urgency/Slots Card */}
          <section className="bg-neutral-900 text-white p-8 rounded-3xl shadow-xl shadow-neutral-900/20 space-y-6">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <TrendUpIcon
                size={24}
                weight="duotone"
                className="text-primary"
              />
              Statut des Applications
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <span className="text-4xl font-bold">
                  {currentListing.slots_filled}
                </span>
                <span className="text-neutral-400 text-sm font-medium">
                  sur {currentListing.slot_limit} slots
                </span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-1000 ${
                    currentListing.status === "closing"
                      ? "bg-orange-500"
                      : "bg-primary"
                  }`}
                  style={{
                    width: `${
                      (currentListing.slots_filled /
                        currentListing.slot_limit) *
                      100
                    }%`,
                  }}
                />
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed italic">
                L&apos;annonce sera automatiquement fermée dans 3 jours une fois
                que tous les slots seront remplis.
              </p>
            </div>
          </section>

          {/* Owner Info */}
          <section className="bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm space-y-6">
            <h3 className="font-bold text-neutral-900 flex items-center gap-2">
              <UsersIcon size={20} weight="bold" className="text-neutral-400" />
              Propriétaire
            </h3>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-neutral-100 flex items-center justify-center text-xl font-bold text-neutral-500 border border-neutral-200">
                {currentListing.owner.name.charAt(0)}
              </div>
              <div>
                <p className="font-bold text-neutral-900">
                  {currentListing.owner.name}
                </p>
                <p className="text-xs text-neutral-500">
                  {currentListing.owner.phone}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start text-neutral-600 hover:bg-neutral-50 h-12 rounded-xl text-xs font-bold uppercase tracking-wider border border-neutral-100"
            >
              Voir ses annonces
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
}
