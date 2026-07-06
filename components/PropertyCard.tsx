"use client";

import Image from "next/image";
import { BedIcon, BathtubIcon, RulerIcon, LightningIcon, SealCheckIcon } from "@phosphor-icons/react";
import { Property } from "@/lib/data";
import { formatXofAmount, getPricePeriodLabel } from "@/lib/rental-period";
import { cn } from "@/lib/utils";

interface PropertyCardProps {
  property: Property;
  onClick?: () => void;
  showStatus?: boolean;
  className?: string;
}

export function PropertyCard({ property, onClick, showStatus = false, className }: PropertyCardProps) {
  
  const formatTimeAgo = (dateString?: string) => {
    if (!dateString) return "";
    const now = new Date();
    const past = new Date(dateString);
    const diffInMs = now.getTime() - past.getTime();
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInHours < 1) return "À l'instant";
    if (diffInHours < 24) return `Il y a ${diffInHours}h`;
    return `Il y a ${diffInDays} jours`;
  };

  const timePosted = formatTimeAgo(property.created_at);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "en_ligne":
        return "bg-green-100/90 text-green-800 border-green-200";
      case "locked":
        return "bg-primary/90 text-white border-primary/20";
      case "finalized":
        return "bg-neutral-900 text-white border-neutral-800";
      case "en_attente":
        return "bg-yellow-100 text-yellow-900 border-yellow-300";
      case "expired":
        return "bg-neutral-100/90 text-neutral-600 border-neutral-200";
      default:
        return "bg-neutral-100/90 text-neutral-600 border-neutral-200";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "en_ligne":
        return "En ligne";
      case "locked":
        return "Réservé";
      case "finalized":
        return "Loué";
      case "en_attente":
        return "En attente";
      case "expired":
        return "Expiré";
      default:
        return status;
    }
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white rounded-[32px] overflow-hidden border transition-all duration-300 group flex flex-col h-full",
        onClick && "cursor-pointer",
        property.isSponsored
          ? "ring-2 ring-primary/20 border-primary/50 shadow-[0_0_25px_-5px_rgba(201,106,46,0.2)]"
          : "border-neutral-100 shadow-sm hover:shadow-xl",
        className
      )}
    >
      {/* Image Container */}
      <div className="relative aspect-4/3 w-full p-4">
        <div className="relative h-full w-full overflow-hidden rounded-[24px]">
          <Image
            src={property.image}
            alt={`Propriété à ${property.location}`}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-110"
          />
          {/* Sponsored Badge */}
          {property.isSponsored && (
            <div className="absolute top-4 left-4 flex items-center bg-white px-3 py-1.5 rounded-full shadow-md border border-primary/30 z-10">
              <LightningIcon
                size={14}
                weight="fill"
                className="text-primary"
              />
              <span className="text-primary text-[10px] font-black tracking-tighter uppercase ml-1">
                À LA UNE
              </span>
            </div>
          )}

          {property.listingType === "vendre" ? (
            property.ownershipVerified && (
              <div className="absolute bottom-4 left-4 flex items-center bg-white/95 px-3 py-1.5 rounded-full shadow-md border border-green-200 z-10">
                <SealCheckIcon size={14} weight="fill" className="text-green-600" />
                <span className="text-green-700 text-[10px] font-black tracking-tighter uppercase ml-1">
                  Documents vérifiés
                </span>
              </div>
            )
          ) : (
            property.agent?.identity_verified && (
              <div className="absolute bottom-4 left-4 flex items-center bg-white/95 px-3 py-1.5 rounded-full shadow-md border border-green-200 z-10">
                <SealCheckIcon size={14} weight="fill" className="text-green-600" />
                <span className="text-green-700 text-[10px] font-black tracking-tighter uppercase ml-1">
                  Identité vérifiée
                </span>
              </div>
            )
          )}

          {/* Status Badge */}
          {showStatus && property.status && (
            <div className="absolute top-4 right-4 z-10">
              <span
                className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm border backdrop-blur-sm",
                  getStatusColor(property.status)
                )}
              >
                {getStatusLabel(property.status)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 pb-6 pt-2 flex flex-col grow">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl font-bold text-neutral-900">
            {formatXofAmount(property.price)}
          </span>
          <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
            {property.listingType === "vendre"
              ? "À vendre"
              : getPricePeriodLabel(property)}
          </span>
          <span className="text-xs text-neutral-400 font-medium">
            • {timePosted}
          </span>
        </div>

        <h3 className="text-lg font-bold text-neutral-900 mb-2 line-clamp-1">
          {property.location}
        </h3>

        <p className="text-sm text-neutral-500 line-clamp-2 mb-4 grow">
          {property.description}
        </p>

        {/* Features Icons */}
        <div className="flex items-center justify-between pt-4 border-t border-neutral-50">
          <div className="flex items-center gap-1.5">
            <BedIcon size={20} weight="regular" className="text-neutral-400" />
            <span className="text-xs font-semibold text-neutral-500">
              {property.bedrooms} ch
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <BathtubIcon
              size={20}
              weight="regular"
              className="text-neutral-400"
            />
            <span className="text-xs font-semibold text-neutral-500">
              {property.bathrooms} sdb
            </span>
          </div>
          {property.area && (
            <div className="flex items-center gap-1.5">
              <RulerIcon
                size={20}
                weight="regular"
                className="text-neutral-400"
              />
              <span className="text-xs font-semibold text-neutral-500">
                {property.area} m²
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
