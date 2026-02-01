"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  XIcon,
  BedIcon,
  BathtubIcon,
  RulerIcon,
  CarIcon,
  MapPinIcon,
  PhoneIcon,
  EnvelopeIcon,
  BuildingsIcon,
  CheckCircleIcon,
  CoinsIcon,
  WarningCircleIcon,
  FacebookLogoIcon,
  LightningIcon,
  WifiHighIcon,
  ShieldCheckIcon,
  SwimmingPoolIcon,
  TreeIcon,
  SunIcon,
} from "@phosphor-icons/react";
import Image from "next/image";
import { Property } from "@/lib/data";
import { useState } from "react";

interface PropertyDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  property: Property | null;
}

export default function PropertyDetailsModal({
  isOpen,
  onClose,
  property,
}: PropertyDetailsModalProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  if (!property) return null;

  const formatPrice = (price: string) => {
    return parseInt(price).toLocaleString("fr-FR");
  };

  const getAmenityIcon = (amenity: string) => {
    const lower = amenity.toLowerCase();
    if (lower.includes("wifi") || lower.includes("internet")) return WifiHighIcon;
    if (lower.includes("piscine")) return SwimmingPoolIcon;
    if (lower.includes("solaire") || lower.includes("panneau")) return SunIcon;
    if (lower.includes("sécurité") || lower.includes("gardien"))
      return ShieldCheckIcon;
    if (lower.includes("jardin") || lower.includes("parc")) return TreeIcon;
    return CheckCircleIcon;
  };

  const images = property.images && property.images.length > 0 ? property.images : [property.image];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white w-full max-w-5xl max-h-[90vh] rounded-[40px] shadow-2xl border border-neutral-200 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-8 py-6 border-b border-neutral-100 bg-neutral-50/30">
              <h2 className="text-2xl font-bold text-neutral-900">
                Détails du bien
              </h2>
              <button
                onClick={onClose}
                className="p-3 hover:bg-neutral-100 rounded-full transition-colors"
              >
                <XIcon size={24} weight="bold" className="text-neutral-900" />
              </button>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-8 space-y-6">
                {/* Image Gallery */}
                <div className="relative">
                  <div className="relative aspect-video w-full overflow-hidden rounded-3xl">
                    <Image
                      src={images[currentImageIndex]}
                      alt={property.title}
                      fill
                      className="object-cover"
                    />
                    {property.isSponsored && (
                      <div className="absolute top-6 left-6 flex items-center bg-white px-4 py-2 rounded-full shadow-lg border border-primary/30 z-10">
                        <LightningIcon
                          size={16}
                          weight="fill"
                          className="text-primary"
                        />
                        <span className="text-primary text-xs font-black tracking-tight uppercase ml-2">
                          À LA UNE
                        </span>
                      </div>
                    )}
                  </div>
                  {images.length > 1 && (
                    <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
                      {images.map((img, idx) => (
                        <button
                          key={idx}
                          onClick={() => setCurrentImageIndex(idx)}
                          className={`relative flex-shrink-0 w-24 h-24 rounded-2xl overflow-hidden border-2 transition-all ${
                            idx === currentImageIndex
                              ? "border-primary ring-2 ring-primary/20"
                              : "border-neutral-200 hover:border-neutral-300"
                          }`}
                        >
                          <Image
                            src={img}
                            alt={`${property.title} ${idx + 1}`}
                            fill
                            className="object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Title and Price */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-3xl font-bold text-neutral-900 mb-2">
                      {property.title}
                    </h3>
                    <div className="flex items-center text-neutral-600">
                      <MapPinIcon size={18} weight="bold" className="mr-2" />
                      <span className="font-medium">{property.location}</span>
                    </div>
                    {property.address && (
                      <p className="text-sm text-neutral-500 mt-1 ml-7">
                        {property.address}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-primary">
                      {formatPrice(property.price)} F
                    </div>
                    {property.period && (
                      <div className="text-sm text-neutral-500 font-medium mt-1">
                        par {property.period}
                      </div>
                    )}
                  </div>
                </div>

                {/* Property Features */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-neutral-50 rounded-2xl p-4 text-center">
                    <BedIcon
                      size={28}
                      weight="duotone"
                      className="text-neutral-400 mx-auto mb-2"
                    />
                    <div className="text-xl font-bold text-neutral-900">
                      {property.bedrooms}
                    </div>
                    <div className="text-xs text-neutral-500 font-semibold uppercase tracking-wider mt-1">
                      Chambres
                    </div>
                  </div>
                  <div className="bg-neutral-50 rounded-2xl p-4 text-center">
                    <BathtubIcon
                      size={28}
                      weight="duotone"
                      className="text-neutral-400 mx-auto mb-2"
                    />
                    <div className="text-xl font-bold text-neutral-900">
                      {property.bathrooms}
                    </div>
                    <div className="text-xs text-neutral-500 font-semibold uppercase tracking-wider mt-1">
                      Salles de bain
                    </div>
                  </div>
                  <div className="bg-neutral-50 rounded-2xl p-4 text-center">
                    <RulerIcon
                      size={28}
                      weight="duotone"
                      className="text-neutral-400 mx-auto mb-2"
                    />
                    <div className="text-xl font-bold text-neutral-900">
                      {property.area}
                    </div>
                    <div className="text-xs text-neutral-500 font-semibold uppercase tracking-wider mt-1">
                      m²
                    </div>
                  </div>
                  <div className="bg-neutral-50 rounded-2xl p-4 text-center">
                    <CarIcon
                      size={28}
                      weight="duotone"
                      className="text-neutral-400 mx-auto mb-2"
                    />
                    <div className="text-xl font-bold text-neutral-900">
                      {property.parking}
                    </div>
                    <div className="text-xs text-neutral-500 font-semibold uppercase tracking-wider mt-1">
                      Parking
                    </div>
                  </div>
                </div>

                {/* Description */}
                {property.description && (
                  <div className="bg-white border border-neutral-100 rounded-3xl p-6">
                    <h4 className="text-lg font-bold text-neutral-900 mb-3">
                      Description
                    </h4>
                    <p className="text-neutral-600 leading-relaxed">
                      {property.description}
                    </p>
                  </div>
                )}

                {/* Amenities */}
                {property.amenities && property.amenities.length > 0 && (
                  <div className="bg-white border border-neutral-100 rounded-3xl p-6">
                    <h4 className="text-lg font-bold text-neutral-900 mb-4">
                      Équipements
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {property.amenities.map((amenity, idx) => {
                        const Icon = getAmenityIcon(amenity);
                        return (
                          <div
                            key={idx}
                            className="flex items-center gap-3 bg-neutral-50 px-4 py-3 rounded-2xl"
                          >
                            <Icon
                              size={20}
                              weight="duotone"
                              className="text-neutral-400"
                            />
                            <span className="text-sm font-semibold text-neutral-700">
                              {amenity}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Agent/Owner Info */}
                {property.agent && (
                  <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-3xl p-6">
                    <h4 className="text-lg font-bold text-neutral-900 mb-4">
                      Informations du contact
                    </h4>
                    <div className="flex items-start gap-4">
                      <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-white shadow-lg flex-shrink-0">
                        {property.agent.avatar_url ? (
                          <Image
                            src={property.agent.avatar_url}
                            alt={property.agent.full_name}
                            width={64}
                            height={64}
                            className="object-cover w-full h-full"
                          />
                        ) : (
                          <div className="w-full h-full bg-primary flex items-center justify-center text-white text-xl font-bold">
                            {property.agent.full_name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="text-lg font-bold text-neutral-900">
                          {property.agent.full_name}
                        </div>
                        {property.agent.user_type === "agent" && (
                          <div className="text-sm text-primary font-semibold mb-2">
                            Agent Immobilier
                          </div>
                        )}
                        {property.agent.company_name && (
                          <div className="flex items-center text-neutral-600 text-sm mb-2">
                            <BuildingsIcon size={16} className="mr-2" />
                            {property.agent.company_name}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-3 mt-3">
                          {property.agent.phone && (
                            <a
                              href={`tel:${property.agent.phone}`}
                              className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-neutral-200 hover:border-primary hover:bg-primary/5 transition-all text-sm font-semibold text-neutral-700"
                            >
                              <PhoneIcon size={16} weight="bold" />
                              {property.agent.phone}
                            </a>
                          )}
                          {property.agent.email && (
                            <a
                              href={`mailto:${property.agent.email}`}
                              className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-neutral-200 hover:border-primary hover:bg-primary/5 transition-all text-sm font-semibold text-neutral-700"
                            >
                              <EnvelopeIcon size={16} weight="bold" />
                              Email
                            </a>
                          )}
                          {property.agent.facebook_url && (
                            <a
                              href={property.agent.facebook_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-neutral-200 hover:border-primary hover:bg-primary/5 transition-all text-sm font-semibold text-neutral-700"
                            >
                              <FacebookLogoIcon size={16} weight="fill" />
                              Facebook
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Property Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-neutral-50 rounded-2xl p-4 text-center border border-neutral-100">
                    <div className="text-xl font-bold text-neutral-900">
                      {property.views || 0}
                    </div>
                    <div className="text-xs text-neutral-500 font-semibold uppercase tracking-wider mt-1">
                      Vues
                    </div>
                  </div>
                  <div className="bg-neutral-50 rounded-2xl p-4 text-center border border-neutral-100">
                    <div className="text-xl font-bold text-neutral-900">
                      {property.favorites || 0}
                    </div>
                    <div className="text-xs text-neutral-500 font-semibold uppercase tracking-wider mt-1">
                      Favoris
                    </div>
                  </div>
                  <div className="bg-neutral-50 rounded-2xl p-4 text-center border border-neutral-100">
                    <div className="text-xl font-bold text-neutral-900">
                      {property.slots_filled || 0}/{property.slot_limit || 0}
                    </div>
                    <div className="text-xs text-neutral-500 font-semibold uppercase tracking-wider mt-1">
                      Candidatures
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer with CTA */}
            <div className="px-8 py-6 border-t border-neutral-100 bg-neutral-50/30">
              <div className="flex gap-4">
                <button
                  onClick={onClose}
                  className="flex-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 font-bold py-4 px-6 rounded-full transition-all"
                >
                  Fermer
                </button>
                {property.agent?.phone && (
                  <a
                    href={`https://wa.me/${property.agent.phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold py-4 px-6 rounded-full transition-all text-center"
                  >
                    Contacter via WhatsApp
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
