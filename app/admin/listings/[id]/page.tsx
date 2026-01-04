"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  UsersIcon,
  CaretLeftIcon,
  MapPinIcon,
  CurrencyCircleDollarIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import PhotoManager from "@/components/admin/PhotoManager";
import OpenHouseSlotManager from "@/components/admin/OpenHouseSlotManager";
import { fetchPropertyById, Property } from "@/lib/data";
import Image from "next/image";

export default function ListingDetailPage() {
  const params = useParams();
  const id = (params?.id as string) || "";
  const router = useRouter();
  const [listing, setListing] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadListing() {
      if (!id) return;
      const data = await fetchPropertyById(id);
      setListing(data);
      setLoading(false);
    }
    loadListing();
  }, [id]);

  if (loading)
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="text-neutral-400 font-medium">Chargement du bien...</p>
      </div>
    );

  if (!listing)
    return (
      <div className="text-center py-32">
        <h2 className="text-2xl font-bold text-neutral-900">Bien non trouvé</h2>
        <Button onClick={() => router.back()} className="mt-4">
          Retour
        </Button>
      </div>
    );

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
                  listing.status === "en_ligne"
                    ? "bg-green-50 text-green-700 border-green-200"
                    : "bg-yellow-50 text-yellow-700 border-yellow-200"
                }`}
              >
                {getStatusLabel(listing.status)}
              </span>
              {listing.isSponsored && (
                <span className="text-[10px] font-bold text-primary bg-primary/5 px-2 py-0.5 rounded-full border border-primary/20 uppercase tracking-widest">
                  Premium
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-neutral-900">
              {listing.title}
            </h1>
            <div className="flex items-center gap-1.5 text-xs text-neutral-500 mt-1 font-medium">
              <MapPinIcon size={14} weight="bold" />
              {listing.location}
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
          <section className="bg-white p-8 rounded-[32px] border border-neutral-100 shadow-sm">
            <PhotoManager
              propertyId={listing.id}
              initialPhotos={listing.images}
              isProfessional={listing.status === "en_ligne"}
              onPhotosUpdated={() => {}}
            />
          </section>

          {/* Open House Management */}
          <section className="bg-white p-8 rounded-[32px] border border-neutral-100 shadow-sm">
            <OpenHouseSlotManager
              propertyId={listing.id}
              limit={2}
              existingSlots={[]}
            />
          </section>
        </div>

        {/* Right Column: Stats & Owner */}
        <div className="space-y-8">
          {/* Price Card */}
          <section className="bg-white p-8 rounded-[32px] border border-neutral-100 shadow-sm space-y-6">
            <h3 className="font-bold text-neutral-900 flex items-center gap-2">
              <CurrencyCircleDollarIcon
                size={24}
                weight="bold"
                className="text-primary"
              />
              Détails Financiers
            </h3>
            <div className="space-y-1">
              <p className="text-3xl font-bold text-neutral-900">
                {parseInt(listing.price).toLocaleString()} F
              </p>
              <p className="text-sm text-neutral-500 font-medium">
                Par {listing.period || "Mois"}
              </p>
            </div>
            <div className="pt-4 border-t border-neutral-50 grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                  Type
                </p>
                <p className="text-sm font-bold text-neutral-900">
                  {listing.propertyType}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                  Surface
                </p>
                <p className="text-sm font-bold text-neutral-900">
                  {listing.area} m²
                </p>
              </div>
            </div>
          </section>

          {/* Owner/Agent Info */}
          <section className="bg-white p-8 rounded-[32px] border border-neutral-100 shadow-sm space-y-6">
            <h3 className="font-bold text-neutral-900 flex items-center gap-2">
              <UsersIcon size={20} weight="bold" className="text-neutral-400" />
              Agent Responsable
            </h3>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-neutral-100 overflow-hidden border border-neutral-200 relative">
                {listing.agent?.avatar_url ? (
                  <Image
                    src={listing.agent.avatar_url}
                    alt={listing.agent.full_name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xl font-bold text-neutral-400">
                    {listing.agent?.full_name.charAt(0)}
                  </div>
                )}
              </div>
              <div>
                <p className="font-bold text-neutral-900 leading-tight">
                  {listing.agent?.full_name}
                </p>
                <p className="text-xs text-neutral-500 font-medium mt-1">
                  {listing.agent?.phone}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              className="w-full justify-center text-neutral-600 hover:bg-neutral-50 h-12 rounded-xl text-xs font-bold uppercase tracking-wider border border-neutral-100 transition-all"
            >
              Contacter l&apos;agent
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
}
