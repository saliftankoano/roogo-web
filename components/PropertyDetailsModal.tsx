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
  FacebookLogoIcon,
  LightningIcon,
  WifiHighIcon,
  ShieldCheckIcon,
  SwimmingPoolIcon,
  TreeIcon,
  SunIcon,
  CaretLeftIcon,
  CaretRightIcon,
} from "@phosphor-icons/react";
import Image from "next/image";
import { Property } from "@/lib/data";
import { useState, useEffect, useRef } from "react";
import { usePropertyEngagement } from "@/hooks/usePropertyEngagement";
import { KuulaEmbed } from "@/components/virtual-tour/KuulaEmbed";

interface PropertyDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  property: Property | null;
  viewerType: string;
}

export default function PropertyDetailsModal({
  isOpen,
  onClose,
  property,
  viewerType,
}: PropertyDetailsModalProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenImageIndex, setFullscreenImageIndex] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { trackImageView, trackContactClick, trackScrollDepth } =
    usePropertyEngagement({
      isOpen,
      property: property
        ? {
            id: property.id,
            propertyType: property.propertyType,
            price: property.price,
            city: property.city,
            quartier: property.quartier,
          }
        : null,
      viewerType,
    });

  // if (!property) return null;

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

  const images = property ? (property.images && property.images.length > 0 ? property.images : [property.image]) : [];

  const openFullscreen = (index: number) => {
    trackImageView();
    setFullscreenImageIndex(index);
    setIsFullscreen(true);
  };

  const closeFullscreen = () => {
    setIsFullscreen(false);
  };

  const nextImage = () => {
    trackImageView();
    setFullscreenImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    trackImageView();
    setFullscreenImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  // Handle keyboard navigation in fullscreen
  useEffect(() => {
    if (!isFullscreen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeFullscreen();
      if (e.key === "ArrowRight") nextImage();
      if (e.key === "ArrowLeft") prevImage();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!property) return null;
  return (
    <>
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
              <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto"
                onScroll={(event) => {
                  const element = event.currentTarget;
                  trackScrollDepth(
                    element.scrollTop + element.clientHeight,
                    element.scrollHeight,
                  );
                }}
              >
                <div className="p-8 space-y-6">
                  {/* Image Gallery */}
                  <div className="relative">
                    <div 
                      className="relative aspect-video w-full overflow-hidden rounded-3xl cursor-pointer group"
                      onClick={() => openFullscreen(currentImageIndex)}
                    >
                      <Image
                        src={images[currentImageIndex]}
                        alt={`Propriété à ${property.location}`}
                        fill
                        className="object-cover transition-transform group-hover:scale-105"
                      />
                      {/* Hover overlay to indicate clickability */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <div className="bg-white/90 px-4 py-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-sm font-bold text-neutral-900">Cliquer pour agrandir</span>
                        </div>
                      </div>
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
                            onClick={() => {
                              setCurrentImageIndex(idx);
                              openFullscreen(idx);
                            }}
                            className={`relative flex-shrink-0 w-24 h-24 rounded-2xl overflow-hidden border-2 transition-all hover:scale-105 cursor-pointer ${
                              idx === currentImageIndex
                                ? "border-primary ring-2 ring-primary/20"
                                : "border-neutral-200 hover:border-neutral-300"
                            }`}
                          >
                            <Image
                              src={img}
                              alt={`Propriété ${idx + 1}`}
                              fill
                              className="object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {property.virtualTourUrl && (
                    <div className="bg-white border border-neutral-100 rounded-3xl p-6">
                      <h4 className="text-lg font-bold text-neutral-900 mb-2">
                        Visite virtuelle
                      </h4>
                      <p className="text-sm font-medium text-neutral-500 mb-4">
                        Explorez la propriété à distance avec la visite Kuula.
                      </p>
                      <KuulaEmbed
                        virtualTourUrl={property.virtualTourUrl}
                        title={`Visite virtuelle de ${property.location}`}
                      />
                    </div>
                  )}

                  {/* Title and Price */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="text-3xl font-bold text-neutral-900 mb-2">
                        {property.location}
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
                          {property.agent.identity_verified && (
                            <div className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-green-700 mb-2">
                              <CheckCircleIcon size={12} weight="fill" />
                              {property.agent.user_type === "agent"
                                ? "Agent vérifié"
                                : "Propriétaire vérifié"}
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
                                onClick={trackContactClick}
                                className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-neutral-200 hover:border-primary hover:bg-primary/5 transition-all text-sm font-semibold text-neutral-700"
                              >
                                <PhoneIcon size={16} weight="bold" />
                                {property.agent.phone}
                              </a>
                            )}
                            {property.agent.email && (
                              <a
                                href={`mailto:${property.agent.email}`}
                                onClick={trackContactClick}
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
                                onClick={trackContactClick}
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
                      onClick={trackContactClick}
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

      {/* Fullscreen Image Viewer */}
      <AnimatePresence>
        {isFullscreen && (
          <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative w-full h-full flex items-center justify-center"
            >
              {/* Close Button */}
              <button
                onClick={closeFullscreen}
                className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors z-10 backdrop-blur-sm"
              >
                <XIcon size={32} weight="bold" className="text-white" />
              </button>

              {/* Image Counter */}
              <div className="absolute top-6 left-6 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-white font-bold z-10">
                {fullscreenImageIndex + 1} / {images.length}
              </div>

              {/* Previous Button */}
              {images.length > 1 && (
                <button
                  onClick={prevImage}
                  className="absolute left-6 p-4 bg-white/10 hover:bg-white/20 rounded-full transition-colors backdrop-blur-sm"
                >
                  <CaretLeftIcon size={32} weight="bold" className="text-white" />
                </button>
              )}

              {/* Image */}
              <motion.div
                key={fullscreenImageIndex}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className="relative w-[90%] h-[90%]"
              >
                <Image
                  src={images[fullscreenImageIndex]}
                  alt={`Propriété à ${property.location} — ${fullscreenImageIndex + 1}`}
                  fill
                  className="object-contain"
                />
              </motion.div>

              {/* Next Button */}
              {images.length > 1 && (
                <button
                  onClick={nextImage}
                  className="absolute right-6 p-4 bg-white/10 hover:bg-white/20 rounded-full transition-colors backdrop-blur-sm"
                >
                  <CaretRightIcon size={32} weight="bold" className="text-white" />
                </button>
              )}

              {/* Keyboard Hints */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4 text-white/60 text-sm font-medium">
                <span>ESC pour fermer</span>
                {images.length > 1 && (
                  <>
                    <span>•</span>
                    <span>← → pour naviguer</span>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
