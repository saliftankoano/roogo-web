"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  CaretLeftIcon,
  CaretRightIcon,
  MapPinIcon,
  CurrencyCircleDollarIcon,
  EnvelopeIcon,
  PhoneIcon,
  BuildingsIcon,
  FacebookLogoIcon,
  BedIcon,
  BathtubIcon,
  SquaresFourIcon,
  CarIcon,
  UsersIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  LockKeyIcon,
  PencilSimpleIcon,
  HouseLineIcon,
  UserCircleIcon,
  CreditCardIcon,
  ArrowSquareOutIcon,
  SealCheckIcon,
} from "@phosphor-icons/react";
import { Property } from "@/lib/data";
import { KuulaEmbed } from "@/components/virtual-tour/KuulaEmbed";
import PropertyPaymentModal from "@/components/payment/PropertyPaymentModal";
import { cn } from "@/lib/utils";
import { VIEW_TRACKED_PROPERTIES_SESSION_KEY } from "@/lib/view-tracking";
import { getMoveInPaymentBreakdown } from "@/lib/move-in-payment";
import {
  formatXofAmount,
  getDailyConditionRows,
  getPricePeriodLabel,
  getPriceTitle,
  isDailyRental,
} from "@/lib/rental-period";

function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

const PROPERTY_TYPE_MAP: Record<string, string> = {
  villa: "Villa",
  appartement: "Appartement",
  maison: "Maison",
  terrain: "Terrain",
  commercial: "Commercial",
  studio: "Studio",
};

const getPropertyTypeLabel = (type?: string) => {
  if (!type) return "";
  return PROPERTY_TYPE_MAP[type.toLowerCase()] || type;
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "en_attente": return "En attente";
    case "en_ligne": return "Disponible";
    case "locked": return "Reserve";
    case "finalized": return "Loue";
    case "expired": return "Indisponible";
    default: return status;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "en_ligne": return "bg-green-50 text-green-700 border-green-200";
    case "locked": return "bg-primary/10 text-primary border-primary/20";
    case "finalized": return "bg-neutral-900 text-white border-neutral-800";
    default: return "bg-neutral-100 text-neutral-500 border-neutral-200";
  }
};

interface Applicant {
  id: string;
  status: string;
  created_at: string;
  user_id: string;
  users: { full_name: string | null; phone: string | null; avatar_url: string | null } | null;
}

interface LockTransaction {
  id: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  payer_phone: string;
  created_at: string;
  user_id: string;
  users: { full_name: string | null; phone: string | null; avatar_url: string | null } | null;
}

export function PropertyDetailClient({
  initialListing,
  propertyId,
}: {
  initialListing: Property;
  propertyId: string;
}) {
  const id = propertyId;
  const router = useRouter();
  const { getToken, isSignedIn } = useAuth();
  const { user, isLoaded } = useUser();

  const [listing, setListing] = useState<Property>(initialListing);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);

  const [hasApplied, setHasApplied] = useState(false);
  const [applicationStatus, setApplicationStatus] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState("");

  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [lockTransactions, setLockTransactions] = useState<LockTransaction[]>([]);
  const [loadingApplicants, setLoadingApplicants] = useState(false);
  const trackedViewIdsRef = useRef<Set<string>>(new Set());

  const userType = (user?.publicMetadata?.userType || user?.publicMetadata?.user_type) as string | undefined;
  const isRenter = Boolean(
    isSignedIn && (userType === "renter" || (!userType && isLoaded)),
  );
  const isOwnerOrAgent = userType === "owner" || userType === "agent";
  const isStaffOrFounder = userType === "staff" || userType === "founder" || userType === "admin";
  const isPropertyOwner = isOwnerOrAgent && listing?.owner_id === user?.id;

  useEffect(() => {
    if (isLoaded && isStaffOrFounder && id) {
      router.replace(`/admin/annonces/${id}`);
    }
  }, [isLoaded, isStaffOrFounder, id, router]);

  useEffect(() => {
    if (!isLoaded || !user || !listing) return;
    async function loadAppStatus() {
      try {
        const token = await getToken();
        const res = await fetch("/api/applications/me", { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (data.applications) {
          const mine = data.applications.find((a: { property_id: string; status: string }) => a.property_id === id);
          if (mine) { setHasApplied(true); setApplicationStatus(mine.status); }
        }
      } catch { /* ignore */ }
    }
    loadAppStatus();
  }, [isLoaded, user, listing, id, getToken]);

  useEffect(() => {
    if (!isPropertyOwner || !listing) return;
    async function loadApplicants() {
      setLoadingApplicants(true);
      try {
        const res = await fetch(`/api/properties/${id}/applications`);
        const data = await res.json();
        if (data.success) { setApplicants(data.applications || []); setLockTransactions(data.lockTransactions || []); }
      } catch { /* ignore */ } finally { setLoadingApplicants(false); }
    }
    loadApplicants();
  }, [isPropertyOwner, listing, id]);

  useEffect(() => {
    if (!listing?.id || typeof window === "undefined") {
      return;
    }

    const propertyId = listing.id;
    const trackedIds = readTrackedPropertyIds();
    if (
      trackedViewIdsRef.current.has(propertyId) ||
      trackedIds.has(propertyId)
    ) {
      trackedViewIdsRef.current.add(propertyId);
      return;
    }

    trackedViewIdsRef.current.add(propertyId);

    async function recordView() {
      try {
        const res = await fetch(`/api/properties/${propertyId}/views`, {
          method: "POST",
        });
        const data = await res.json();

        if (!res.ok) {
          return;
        }

        trackedIds.add(propertyId);
        writeTrackedPropertyIds(trackedIds);

        if (typeof data.viewsCount === "number") {
          setListing((current) =>
            current ? { ...current, views: data.viewsCount } : current,
          );
        }
      } catch {
        trackedViewIdsRef.current.delete(propertyId);
      }
    }

    recordView();
  }, [listing?.id]);

  const handleApply = async () => {
    if (!user) return;
    setIsApplying(true);
    setApplyError("");
    try {
      const token = await getToken();
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ propertyId: id }),
      });
      const data = await res.json();
      if (res.ok) { setHasApplied(true); setApplicationStatus("pending"); }
      else { setApplyError(data.error || "Une erreur est survenue"); }
    } catch { setApplyError("Une erreur est survenue"); }
    finally { setIsApplying(false); }
  };

  const handlePaymentSuccess = async () => {
    setShowPaymentModal(false);
    if (listing) setListing({ ...listing, status: "locked" });
    try {
      const token = await getToken();
      if (!token || !listing) return;
      await fetch("/api/rental-agreements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          propertyId: id,
          monthlyRent: Number(listing.price),
          startDate: new Date().toISOString().split("T")[0],
        }),
      });
    } catch {
      // Payment is already complete; agreement creation can be retried from the app if needed.
    }
  };

  const images = listing ? (listing.images?.length > 0 ? listing.images : [listing.image]) : [];

  const getAppStatusConfig = (status: string | null) => {
    switch (status) {
      case "approved": return { label: "Candidature acceptee", color: "bg-green-50 border-green-200 text-green-700", Icon: CheckCircleIcon };
      case "rejected": return { label: "Candidature refusee", color: "bg-red-50 border-red-200 text-red-600", Icon: XCircleIcon };
      default: return { label: "Candidature en attente", color: "bg-yellow-50 border-yellow-200 text-yellow-700", Icon: ClockIcon };
    }
  };

  const getApplicantStatusBadge = (s: string) => {
    switch (s) {
      case "approved": return "bg-green-100 text-green-700";
      case "rejected": return "bg-red-100 text-red-600";
      default: return "bg-yellow-100 text-yellow-700";
    }
  };

  const getApplicantStatusLabel = (s: string) => {
    switch (s) { case "approved": return "Accepte"; case "rejected": return "Refuse"; default: return "En attente"; }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

  const rentAmount = Number(listing.price);
  const isDailyListing = isDailyRental(listing);
  const dailyConditionRows = getDailyConditionRows(listing);
  const depositMonths = Number(listing.deposit ?? 0);
  const advanceRentMonths = Number(listing.loyerAvanceMois ?? 1);
  const moveInBreakdown = getMoveInPaymentBreakdown({
    monthlyRent: rentAmount,
    cautionMois: depositMonths,
    loyerAvanceMois: advanceRentMonths,
  });
  const canApply =
    !isDailyListing && isRenter && listing.status === "en_ligne" && !hasApplied;
  const canPay =
    !isDailyListing && isRenter && listing.status === "en_ligne" && rentAmount > 0;

  return (
    <>
      {!isDailyListing && (
        <PropertyPaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={handlePaymentSuccess}
          propertyId={id}
          propertyLabel={`Propriété au ${listing.location}`}
          rentAmount={rentAmount}
          depositMonths={depositMonths}
          advanceRentMonths={advanceRentMonths}
        />
      )}

      <Portal>
        <AnimatePresence>
          {!isDailyListing && showLockConfirm && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowLockConfirm(false)} />
              <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="relative bg-white rounded-[32px] shadow-xl w-full max-w-md z-10 overflow-hidden">
                <div className="p-8">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <LockKeyIcon size={24} weight="fill" className="text-primary" />
                    </div>
                    <div>
                      <h3 className="font-black text-neutral-900">Louer de suite</h3>
                      <p className="text-xs text-neutral-400">Recapitulatif du paiement</p>
                    </div>
                  </div>
                  <div className="bg-neutral-50 rounded-2xl p-4 mb-6 border border-neutral-100 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-500">Caution ({depositMonths} mois)</span>
                      <span className="font-bold">{moveInBreakdown.cautionAmount.toLocaleString("fr-FR")} FCFA</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-500">Loyer d&apos;avance ({moveInBreakdown.loyerAvanceMois} mois)</span>
                      <span className="font-bold">{moveInBreakdown.advanceRentAmount.toLocaleString("fr-FR")} FCFA</span>
                    </div>
                    <div className="border-t border-neutral-200 pt-2 flex justify-between">
                      <span className="text-sm font-black">Total</span>
                      <span className="text-sm font-black text-primary">{moveInBreakdown.totalAmount.toLocaleString("fr-FR")} FCFA</span>
                    </div>
                  </div>
                  <p className="text-xs text-neutral-400 text-center mb-6">
                    En confirmant, vous initiez le paiement securise via mobile money.
                  </p>
                  <div className="flex gap-3">
                    <button onClick={() => setShowLockConfirm(false)}
                      className="flex-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 font-bold py-4 rounded-2xl transition-all text-sm">
                      Annuler
                    </button>
                    <button onClick={() => { setShowLockConfirm(false); setShowPaymentModal(true); }}
                      className="flex-1 bg-primary hover:bg-primary/90 text-white font-black py-4 rounded-2xl transition-all text-sm">
                      Continuer
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </Portal>

      <Portal>
        <AnimatePresence>
          {isFullscreen && (
            <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center">
              <button onClick={() => setIsFullscreen(false)}
                className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors z-10">
                <XCircleIcon size={28} weight="bold" className="text-white" />
              </button>
              <div className="absolute top-6 left-6 px-4 py-2 bg-white/10 rounded-full text-white font-bold z-10 text-sm">
                {fullscreenIndex + 1} / {images.length}
              </div>
              {images.length > 1 && (
                <>
                  <button onClick={() => setFullscreenIndex((p) => (p - 1 + images.length) % images.length)}
                    className="absolute left-6 p-4 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
                    <CaretLeftIcon size={28} weight="bold" className="text-white" />
                  </button>
                  <button onClick={() => setFullscreenIndex((p) => (p + 1) % images.length)}
                    className="absolute right-6 p-4 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
                    <CaretRightIcon size={28} weight="bold" className="text-white" />
                  </button>
                </>
              )}
              <div className="relative w-[90%] h-[90%]">
                <Image src={images[fullscreenIndex]} alt={`Propriété à ${listing.location}`} fill className="object-contain" />
              </div>
            </div>
          )}
        </AnimatePresence>
      </Portal>

      <div className="min-h-screen bg-neutral-50/30">
        <main className="max-w-7xl mx-auto px-6 pt-40 pb-20 space-y-10">

          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              <button onClick={() => router.back()}
                className="group rounded-full w-10 h-10 flex items-center justify-center hover:bg-neutral-100 transition-all active:scale-95 mt-1 shrink-0">
                <CaretLeftIcon size={24} weight="bold" className="text-neutral-700 group-hover:text-neutral-900 group-hover:-translate-x-0.5 transition-all" />
              </button>
              <div>
                {listing.isSponsored && (
                  <span className="inline-block text-[10px] font-bold text-primary bg-primary/5 px-2 py-0.5 rounded-full border border-primary/20 uppercase tracking-widest mb-1">
                    Premium
                  </span>
                )}
                <h1 className="text-2xl font-bold text-neutral-900">{listing.location}</h1>
                <div className="flex items-center gap-2 text-xs text-neutral-500 mt-1 font-medium flex-wrap">
                  <MapPinIcon size={14} weight="bold" />
                  <span>{listing.location}</span>
                  {listing.propertyType && (
                    <>
                      <span className="text-neutral-300">|</span>
                      <span className="text-primary font-bold">{getPropertyTypeLabel(listing.propertyType)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={cn("px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border", getStatusColor(listing.status))}>
                {getStatusLabel(listing.status)}
              </span>
              {isPropertyOwner && (
                <Link href={"/mes-proprietes/" + id}
                  className="flex items-center gap-2 bg-white border border-neutral-200 hover:border-primary hover:text-primary text-neutral-700 font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-all">
                  <PencilSimpleIcon size={14} weight="bold" />
                  Modifier
                </Link>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            <div className="lg:col-span-2 space-y-10">

              <section className="bg-white p-6 rounded-[32px] border border-neutral-100 shadow-sm">
                {images.length > 0 ? (
                  <div className="space-y-3">
                    <div className="relative aspect-video rounded-2xl overflow-hidden cursor-pointer group"
                      onClick={() => { setFullscreenIndex(currentImageIndex); setIsFullscreen(true); }}>
                      <Image src={images[currentImageIndex]} alt={`Propriété à ${listing.location}`} fill
                        className="object-cover group-hover:scale-[1.02] transition-transform duration-300"
                        sizes="(max-width: 768px) 100vw, 66vw" priority />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                      <div className="absolute top-4 right-4 px-3 py-1 bg-black/50 rounded-full text-white text-xs font-bold">
                        {currentImageIndex + 1} / {images.length}
                      </div>
                    </div>
                    {images.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {images.map((img, idx) => (
                          <button key={idx} onClick={() => setCurrentImageIndex(idx)}
                            className={cn("relative shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all",
                              idx === currentImageIndex ? "border-primary" : "border-transparent opacity-70 hover:opacity-100")}>
                            <Image src={img} alt="" fill className="object-cover" sizes="64px" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="aspect-video rounded-2xl bg-neutral-100 flex items-center justify-center">
                    <HouseLineIcon size={48} className="text-neutral-300" />
                  </div>
                )}
              </section>

              {listing.virtualTourUrl && (
                <section className="bg-white p-6 md:p-8 rounded-[32px] border border-neutral-100 shadow-sm space-y-4">
                  <div>
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2">
                      Visite virtuelle
                    </p>
                    <h2 className="text-xl font-black text-neutral-900">
                      Explorez le bien en 3D
                    </h2>
                    <p className="mt-2 text-sm font-medium text-neutral-500">
                      Visitez la propriété à distance grâce à l&apos;expérience
                      immersive Kuula intégrée.
                    </p>
                  </div>
                  <KuulaEmbed
                    virtualTourUrl={listing.virtualTourUrl}
                    title={`Visite virtuelle de ${listing.location}`}
                  />
                </section>
              )}

              <section className="bg-white p-8 rounded-[32px] border border-neutral-100 shadow-sm space-y-8">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Chambres", value: listing.bedrooms, Icon: BedIcon },
                    { label: "Salles de bain", value: listing.bathrooms, Icon: BathtubIcon },
                    { label: "Superficie", value: listing.area ? listing.area + " m2" : "-", Icon: SquaresFourIcon },
                    { label: "Parking", value: listing.parking, Icon: CarIcon },
                  ].map((item, idx) => (
                    <div key={idx} className="bg-neutral-50 p-4 rounded-2xl flex flex-col gap-2">
                      <item.Icon size={20} className="text-neutral-400" weight="bold" />
                      <div>
                        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">{item.label}</p>
                        <p className="text-sm font-black text-neutral-900">{item.value || "-"}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {listing.description && (
                  <div>
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-3">Description</p>
                    <p className="text-neutral-600 leading-relaxed whitespace-pre-wrap text-sm">{listing.description}</p>
                  </div>
                )}
                {listing.amenities && listing.amenities.length > 0 && (
                  <div className="pt-6 border-t border-neutral-50">
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-4">Equipements</p>
                    <div className="flex flex-wrap gap-2">
                      {listing.amenities.map((amenity, idx) => (
                        <span key={idx} className="px-4 py-2 bg-neutral-50 text-neutral-700 rounded-xl text-xs font-bold border border-neutral-100">{amenity}</span>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </div>

            <div className="space-y-6">
              <section className="bg-white p-8 rounded-[32px] border border-neutral-100 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary">
                    <CurrencyCircleDollarIcon size={24} weight="bold" />
                  </div>
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                    {getPriceTitle(listing)}
                  </p>
                </div>
                <p className="text-3xl font-black text-neutral-900 tracking-tight">
                  {formatXofAmount(listing.price)}{" "}
                  <span className="text-sm text-neutral-400 font-bold uppercase tracking-wider ml-1">
                    {getPricePeriodLabel(listing)}
                  </span>
                </p>
                {isDailyListing ? (
                  <div className="mt-5 space-y-2 border-t border-neutral-100 pt-4 text-xs font-bold text-neutral-500">
                    {dailyConditionRows.map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between"
                      >
                        <span>{row.label}</span>
                        <span className="text-neutral-900">{row.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    {listing.deposit && (
                      <p className="text-xs text-neutral-400 mt-2 font-medium">
                        Caution: {listing.deposit} mois (
                        {moveInBreakdown.cautionAmount.toLocaleString("fr-FR")}{" "}
                        FCFA)
                      </p>
                    )}
                    <p className="text-xs text-neutral-400 mt-1 font-medium">
                      Loyer d&apos;avance: {moveInBreakdown.loyerAvanceMois} mois (
                      {moveInBreakdown.advanceRentAmount.toLocaleString("fr-FR")}{" "}
                      FCFA)
                    </p>
                  </>
                )}
              </section>

              {isRenter && listing.status === "en_ligne" && !isDailyListing && (
                <section className="bg-white p-6 rounded-[32px] border border-neutral-100 shadow-sm space-y-3">
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Actions</p>
                  {hasApplied && applicationStatus && (() => {
                    const cfg = getAppStatusConfig(applicationStatus);
                    return (
                      <div className={cn("flex items-center gap-3 p-3 rounded-xl border text-sm font-semibold", cfg.color)}>
                        <cfg.Icon size={18} weight="fill" />
                        {cfg.label}
                      </div>
                    );
                  })()}
                  {canApply && (
                    <div>
                      <button onClick={handleApply} disabled={isApplying}
                        className="w-full bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white font-black py-4 rounded-2xl transition-all text-sm flex items-center justify-center gap-2">
                        <UsersIcon size={16} weight="bold" />
                        {isApplying ? "Envoi en cours..." : "Postuler"}
                      </button>
                      {applyError && <p className="text-xs text-red-500 mt-2 text-center">{applyError}</p>}
                    </div>
                  )}
                  {canPay && (
                    <button onClick={() => setShowLockConfirm(true)}
                      className="w-full bg-primary hover:bg-primary/90 text-white font-black py-4 rounded-2xl transition-all text-sm flex items-center justify-center gap-2">
                      <CreditCardIcon size={16} weight="bold" />
                      Louer de suite !
                    </button>
                  )}
                  {listing.slots_filled !== undefined && listing.slot_limit !== undefined && listing.slot_limit > 0 && (
                    <p className="text-[10px] text-neutral-400 text-center font-medium">
                      {listing.slots_filled}/{listing.slot_limit} candidatures
                    </p>
                  )}
                </section>
              )}

              {isRenter && listing.status === "locked" && (
                <section className="bg-primary/5 border border-primary/20 p-6 rounded-[32px] space-y-2">
                  <div className="flex items-center gap-2">
                    <LockKeyIcon size={16} weight="fill" className="text-primary" />
                    <p className="text-sm font-black text-primary">Bien reserve</p>
                  </div>
                  <p className="text-xs text-neutral-500">Ce bien a ete reserve. Il n&apos;est plus disponible.</p>
                </section>
              )}

              {listing.agent && (
                <section className="bg-white overflow-hidden rounded-[32px] border border-neutral-100 shadow-sm">
                  <div className="p-8 space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-primary/10 overflow-hidden relative border-2 border-primary shrink-0">
                        {listing.agent.avatar_url ? (
                          <Image src={listing.agent.avatar_url} alt={listing.agent.full_name} fill sizes="56px" className="object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xl font-bold text-primary">
                            {listing.agent.full_name?.charAt(0)?.toUpperCase() || "?"}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-neutral-900 leading-tight">{listing.agent.full_name}</p>
                        <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider mt-1">
                          {listing.agent.user_type || "Particulier"}
                        </p>
                        {listing.agent.identity_verified && (
                          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-green-700">
                            <SealCheckIcon size={12} weight="fill" />
                            {listing.agent.user_type === "agent"
                              ? "Agent vérifié"
                              : "Propriétaire vérifié"}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-3 pt-2 border-t border-neutral-50">
                      {listing.agent.phone && (
                        <div className="flex items-center gap-3 text-sm">
                          <div className="w-8 h-8 rounded-lg bg-neutral-50 flex items-center justify-center text-neutral-400">
                            <PhoneIcon size={16} weight="bold" />
                          </div>
                          <span className="font-medium text-neutral-600">{listing.agent.phone}</span>
                        </div>
                      )}
                      {listing.agent.email && (
                        <div className="flex items-center gap-3 text-sm">
                          <div className="w-8 h-8 rounded-lg bg-neutral-50 flex items-center justify-center text-neutral-400">
                            <EnvelopeIcon size={16} weight="bold" />
                          </div>
                          <span className="font-medium text-neutral-600 break-all">{listing.agent.email}</span>
                        </div>
                      )}
                      {listing.agent.company_name && (
                        <div className="flex items-center gap-3 text-sm">
                          <div className="w-8 h-8 rounded-lg bg-neutral-50 flex items-center justify-center text-neutral-400">
                            <BuildingsIcon size={16} weight="bold" />
                          </div>
                          <span className="font-bold text-primary">{listing.agent.company_name}</span>
                        </div>
                      )}
                      {listing.agent.facebook_url && (
                        <div className="flex items-center gap-3 text-sm">
                          <div className="w-8 h-8 rounded-lg bg-neutral-50 flex items-center justify-center text-blue-600">
                            <FacebookLogoIcon size={16} weight="fill" />
                          </div>
                          <a href={listing.agent.facebook_url} target="_blank" rel="noopener noreferrer"
                            className="font-medium text-blue-600 hover:underline">
                            Voir la page Facebook
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {isPropertyOwner && (
                <section className="bg-white rounded-[32px] border border-neutral-100 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-neutral-50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                        <UsersIcon size={16} weight="bold" className="text-primary" />
                      </div>
                      <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Candidatures</p>
                    </div>
                    <span className="text-xs font-black text-neutral-500">{applicants.length}</span>
                  </div>
                  {lockTransactions.length > 0 && lockTransactions[0].status === "completed" && (
                    <div className="mx-4 mt-4 bg-green-50 border border-green-200 rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircleIcon size={14} weight="fill" className="text-green-600" />
                        <p className="text-xs font-black text-green-700">Bien loue</p>
                      </div>
                      <p className="text-xs text-green-600 font-medium">{lockTransactions[0].users?.full_name || "Locataire inconnu"}</p>
                      <p className="text-xs text-green-500 mt-0.5">
                        {lockTransactions[0].amount.toLocaleString("fr-FR")} FCFA - {formatDate(lockTransactions[0].created_at)}
                      </p>
                    </div>
                  )}
                  <div className="p-4">
                    {loadingApplicants ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      </div>
                    ) : applicants.length === 0 ? (
                      <div className="flex flex-col items-center py-8 gap-2 text-center">
                        <UserCircleIcon size={32} className="text-neutral-200" />
                        <p className="text-xs text-neutral-400 font-medium">Aucune candidature</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {applicants.map((applicant) => (
                          <div key={applicant.id} className="flex items-center gap-3 p-3 bg-neutral-50 rounded-xl">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-black text-primary shrink-0">
                              {applicant.users?.full_name?.charAt(0)?.toUpperCase() || "?"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-neutral-900 truncate">{applicant.users?.full_name || "Inconnu"}</p>
                              <p className="text-[10px] text-neutral-400">{formatDate(applicant.created_at)}</p>
                            </div>
                            <span className={cn("text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider shrink-0",
                              getApplicantStatusBadge(applicant.status))}>
                              {getApplicantStatusLabel(applicant.status)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="px-4 pb-4">
                    <Link href={"/mes-proprietes/" + id}
                      className="w-full flex items-center justify-center gap-2 bg-neutral-50 hover:bg-neutral-100 border border-neutral-100 text-neutral-700 font-bold py-3 rounded-xl transition-all text-xs">
                      <ArrowSquareOutIcon size={14} weight="bold" />
                      Gerer ce bien
                    </Link>
                  </div>
                </section>
              )}

            </div>
          </div>
        </main>
      </div>
    </>
  );
}

function readTrackedPropertyIds() {
  try {
    const raw = window.sessionStorage.getItem(
      VIEW_TRACKED_PROPERTIES_SESSION_KEY,
    );
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set<string>();
  }
}

function writeTrackedPropertyIds(ids: Set<string>) {
  window.sessionStorage.setItem(
    VIEW_TRACKED_PROPERTIES_SESSION_KEY,
    JSON.stringify([...ids]),
  );
}
