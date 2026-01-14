"use client";

import Image from "next/image";
import { BedIcon, BathtubIcon, RulerIcon, LightningIcon } from "@phosphor-icons/react";
import { Property } from "@/lib/data";
import { cn } from "@/lib/utils";

interface PropertyCardProps {
  property: Property;
}

export function PropertyCard({ property }: PropertyCardProps) {
  const formatTimeAgo = (dateString?: string) => {
    if (!dateString) return "";
    const now = new Date();
    const past = new Date(dateString);
    const diffInMs = now.getTime() - past.getTime();
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInHours < 1) return "À l'instant";
    if (diffInHours < 24) return `${diffInHours}h ago`;
    return `${diffInDays} days ago`;
  };

  const timePosted = formatTimeAgo(property.created_at);

  return (
    <div
      className={cn(
        "bg-white rounded-[32px] overflow-hidden border transition-all duration-300 group flex flex-col h-full",
        property.isSponsored
          ? "ring-2 ring-primary/20 border-primary/50 shadow-[0_0_25px_-5px_rgba(201,106,46,0.2)]"
          : "border-neutral-100 shadow-sm hover:shadow-xl"
      )}
    >
      {/* Image Container */}
      <div className="relative aspect-4/3 w-full p-4">
        <div className="relative h-full w-full overflow-hidden rounded-[24px]">
          <Image
            src={property.image}
            alt={property.title}
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
        </div>
      </div>

      {/* Content */}
      <div className="px-6 pb-6 pt-2 flex flex-col grow">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl font-bold text-neutral-900">
            {parseInt(property.price).toLocaleString()} F
          </span>
          <span className="text-xs text-neutral-400 font-medium">
            • {timePosted}
          </span>
        </div>

        <h3 className="text-lg font-bold text-neutral-900 mb-2 line-clamp-1">
          {property.title}
        </h3>

        <p className="text-sm text-neutral-500 line-clamp-2 mb-4 grow">
          {property.description}
        </p>

        {/* Features Icons */}
        <div className="flex items-center justify-between pt-4 border-t border-neutral-50">
          <div className="flex items-center gap-1.5">
            <BedIcon size={20} weight="regular" className="text-neutral-400" />
            <span className="text-xs font-semibold text-neutral-500">
              {property.bedrooms} bd
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <BathtubIcon
              size={20}
              weight="regular"
              className="text-neutral-400"
            />
            <span className="text-xs font-semibold text-neutral-500">
              {property.bathrooms} bt
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <RulerIcon
              size={20}
              weight="regular"
              className="text-neutral-400"
            />
            <span className="text-xs font-semibold text-neutral-500">
              {property.area} sq ft
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
