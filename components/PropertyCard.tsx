"use client";

import Image from "next/image";
import { Heart, MapPin, Bed, Bathtub, Ruler, Eye } from "@phosphor-icons/react";
import { Button } from "./ui/Button";

interface PropertyCardProps {
  property: {
    id: number;
    title: string;
    location: string;
    price: string;
    bedrooms: number;
    bathrooms: number;
    area: string;
    category: "Residential" | "Business";
    image: string;
    views?: number;
    favorites?: number;
    period?: string;
  };
}

export function PropertyCard({ property }: PropertyCardProps) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-card hover:shadow-lg transition-shadow duration-300 group border border-neutral-100">
      {/* Image Container */}
      <div className="relative h-60 w-full overflow-hidden">
        <Image
          src={property.image}
          alt={property.title}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        
        {/* Category Badge */}
        <div className={`absolute top-4 left-4 px-3 py-1 rounded-full text-xs font-bold text-white uppercase tracking-wide ${
          property.category === "Residential" ? "bg-primary" : "bg-accent"
        }`}>
          {property.category === "Residential" ? "Résidentiel" : "Commercial"}
        </div>

        {/* Favorite Button */}
        <button className="absolute top-4 right-4 p-2 bg-white/90 backdrop-blur-sm rounded-full hover:bg-white transition-colors shadow-sm">
          <Heart size={20} weight="bold" className="text-neutral-900 hover:text-red-500 transition-colors" />
        </button>
      </div>

      {/* Content */}
      <div className="p-5">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h3 className="text-xl font-bold text-neutral-900 line-clamp-1">{property.title}</h3>
            <div className="flex items-center mt-1 text-neutral-500">
              <MapPin size={16} weight="fill" className="mr-1" />
              <span className="text-sm">{property.location}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-primary">
              {parseInt(property.price).toLocaleString()} CFA
            </p>
            {property.period && (
              <p className="text-sm text-neutral-500">/{property.period}</p>
            )}
          </div>
        </div>

        {/* Features */}
        <div className="flex flex-wrap gap-3 mt-4 mb-4">
          <div className="flex items-center bg-neutral-50 px-3 py-1.5 rounded-lg">
            <Bed size={16} weight="bold" className="text-neutral-700 mr-2" />
            <span className="text-sm font-medium text-neutral-700">{property.bedrooms} Ch.</span>
          </div>
          <div className="flex items-center bg-neutral-50 px-3 py-1.5 rounded-lg">
            <Bathtub size={16} weight="bold" className="text-neutral-700 mr-2" />
            <span className="text-sm font-medium text-neutral-700">{property.bathrooms} Douches</span>
          </div>
          <div className="flex items-center bg-neutral-50 px-3 py-1.5 rounded-lg">
            <Ruler size={16} weight="bold" className="text-neutral-700 mr-2" />
            <span className="text-sm font-medium text-neutral-700">{property.area} m²</span>
          </div>
        </div>

        {/* Footer / Actions */}
        <div className="pt-4 border-t border-neutral-100 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            {property.views !== undefined && (
              <div className="flex items-center text-neutral-500">
                <Eye size={16} weight="regular" className="mr-1" />
                <span className="text-xs">{property.views}</span>
              </div>
            )}
          </div>
          <Button variant="outline" size="sm" className="border-neutral-200">
            Détails
          </Button>
        </div>
      </div>
    </div>
  );
}
