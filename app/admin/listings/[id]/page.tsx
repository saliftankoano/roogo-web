"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import {
  UsersIcon,
  CaretLeftIcon,
  MapPinIcon,
  CurrencyCircleDollarIcon,
  ReceiptIcon,
  CalendarBlankIcon,
  CaretDownIcon,
  WarningCircleIcon,
  EnvelopeIcon,
  PhoneIcon,
  BuildingsIcon,
  FacebookLogoIcon,
  InfoIcon,
  VideoCameraIcon,
  CameraIcon,
  LightningIcon,
  HandCoinsIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  BedIcon,
  BathtubIcon,
  SquaresFourIcon,
  CarIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import PhotoManager from "@/components/admin/PhotoManager";
import PropertyOpenHouseManager from "@/components/admin/PropertyOpenHouseManager";
import {
  fetchPropertyById,
  updatePropertyStatus,
  Property,
  Transaction,
} from "@/lib/data";
import { getSecureTransactions } from "./actions";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";

function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

const ADD_ON_ICONS: Record<string, React.ElementType> = {
  video: VideoCameraIcon,
  extra_slots: UsersIcon,
  "3d_env": InfoIcon,
  extra_photos: CameraIcon,
  boost: LightningIcon,
  open_house: CalendarBlankIcon,
};

const ADD_ON_LABELS: Record<string, string> = {
  video: "Vidéo",
  extra_slots: "Slots",
  "3d_env": "3D",
  extra_photos: "Photos",
  boost: "Boost",
  open_house: "Visite",
};

interface TransactionMetadata {
  tier?: {
    id: string;
    name: string;
    base_fee: number;
  };
  commission?: number;
  add_ons?: {
    id: string;
    name: string;
    price: number;
  }[];
  total?: number;
}

export default function ListingDetailPage() {
  const params = useParams();
  const id = (params?.id as string) || "";
  const router = useRouter();
  const [listing, setListing] = useState<Property | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Status Management
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadData() {
      if (!id) return;
      
      try {
        // Fetch property
        const propertyData = await fetchPropertyById(id);
        setListing(propertyData);

        // Fetch transactions SECURELY via Server Action
        const transactionsData = await getSecureTransactions(
          id,
          propertyData?.payment_id,
          propertyData?.transaction_id
        );
        setTransactions(transactionsData);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();

    // Click outside listener for dropdown
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsStatusDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [id]);

  const handleStatusChange = async (newStatus: string) => {
    if (!listing) return;
    const oldStatus = listing.status;

    // Optimistic update
    setListing({ ...listing, status: newStatus });

    const success = await updatePropertyStatus(listing.id, newStatus);

    if (!success) {
      // Revert if failed
      setListing({ ...listing, status: oldStatus });
      alert("Erreur lors de la mise à jour du statut");
    }
  };

  const initiateStatusChange = (newStatus: string) => {
    if (newStatus === listing?.status) return;
    setPendingStatus(newStatus);
    setIsStatusDropdownOpen(false);
    setStatusModalOpen(true);
  };

  const confirmStatusChange = async () => {
    if (pendingStatus) {
      await handleStatusChange(pendingStatus);
      setStatusModalOpen(false);
      setPendingStatus(null);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "en_attente":
        return "En attente (Photo Pro)";
      case "en_ligne":
        return "En ligne (Publiée)";
      case "expired":
        return "Expirée (Louée/Vendue)";
      default:
        return status;
    }
  };

  const getCleanStatusLabel = (status: string) => {
    switch (status) {
      case "en_attente":
        return "En attente";
      case "en_ligne":
        return "En ligne";
      case "expired":
        return "Expirée";
      default:
        return status;
    }
  };
  const getStatusColor = (status: string) => {
    switch (status) {
      case "en_ligne":
        return "bg-green-50 text-green-700 border-green-200";
      case "en_attente":
        return "bg-yellow-100 text-yellow-900 border-yellow-300";
      case "expired":
        return "bg-neutral-50 text-neutral-600 border-neutral-200";
      default:
        return "bg-neutral-50 text-neutral-600 border-neutral-200";
    }
  };

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

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-10 space-y-10 relative">
      {/* Status Confirmation Modal */}
      <Portal>
        <AnimatePresence>
          {statusModalOpen && (
            <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={() => setStatusModalOpen(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl relative z-10 overflow-hidden"
              >
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="w-12 h-12 bg-yellow-50 rounded-full flex items-center justify-center text-yellow-500 mb-2">
                    <WarningCircleIcon size={32} weight="fill" />
                  </div>
                  <h3 className="text-xl font-bold text-neutral-900">
                    Confirmer le changement de statut
                  </h3>
                  <p className="text-neutral-500 text-sm">
                    Êtes-vous sûr de vouloir changer le statut de <br />
                    <span className="font-bold text-neutral-900">
                      {getCleanStatusLabel(listing.status)}
                    </span>{" "}
                    à{" "}
                    <span className="font-bold text-[#C96A2E]">
                      {getCleanStatusLabel(pendingStatus || "")}
                    </span>{" "}
                    ?
                  </p>

                  <div className="flex gap-3 w-full mt-6">
                    <Button
                      variant="ghost"
                      onClick={() => setStatusModalOpen(false)}
                      className="flex-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700"
                    >
                      Annuler
                    </Button>
                    <Button
                      onClick={confirmStatusChange}
                      className="flex-1 bg-primary text-white hover:bg-primary/90"
                    >
                      Confirmer
                    </Button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </Portal>

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
        <div className="flex gap-3 items-center">
          <Button
            variant="ghost"
            className="text-red-600 hover:bg-red-50 text-xs font-bold uppercase tracking-wider"
          >
            Supprimer
          </Button>

          {/* Status Switcher on Right */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
              className={cn(
                "h-10 px-4 pl-3 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 transition-all shadow-sm border focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary/20",
                getStatusColor(listing.status)
              )}
            >
              {getStatusLabel(listing.status)}
              <CaretDownIcon size={12} weight="bold" className="opacity-50" />
            </button>

            {/* Dropdown Menu */}
            <AnimatePresence>
              {isStatusDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.95 }}
                  className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-neutral-100 py-2 z-50 overflow-hidden"
                >
                  <div className="px-3 py-2 border-b border-neutral-50 mb-1">
                    <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">
                      Changer le statut
                    </p>
                  </div>
                  <div className="px-1.5 space-y-0.5">
                    {["en_attente", "en_ligne", "expired"].map((status) => (
                      <button
                        key={status}
                        onClick={() => initiateStatusChange(status)}
                        className={cn(
                          "w-full text-left px-3 py-2.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-between group",
                          listing.status === status
                            ? "bg-primary/5 text-primary"
                            : "text-neutral-600 hover:bg-neutral-50"
                        )}
                      >
                        <span className="uppercase tracking-wider">
                          {getCleanStatusLabel(status)}
                        </span>
                        {listing.status === status && (
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Photos & General Info */}
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-white p-8 rounded-[32px] border border-neutral-100 shadow-sm">
            <PhotoManager
              propertyId={listing.id}
              initialPhotos={listing.images}
              isProfessional={listing.status === "en_ligne"}
              onPhotosUpdated={(isPro) => {
                if (isPro && listing.status !== "en_ligne") {
                  initiateStatusChange("en_ligne");
                }
              }}
            />
          </section>

          <section className="bg-white p-8 rounded-[32px] border border-neutral-100 shadow-sm space-y-8">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-neutral-900">Description & Caractéristiques</h3>
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Vues</span>
                  <span className="text-sm font-black text-neutral-900">{listing.views || 0}</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Favoris</span>
                  <span className="text-sm font-black text-neutral-900">{listing.favorites || 0}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Chambres", value: listing.bedrooms, icon: BedIcon },
                { label: "Salles de bain", value: listing.bathrooms, icon: BathtubIcon },
                { label: "Superficie", value: `${listing.area} m²`, icon: SquaresFourIcon },
                { label: "Parking", value: listing.parking, icon: CarIcon },
              ].map((item, idx) => (
                <div key={idx} className="bg-neutral-50 p-4 rounded-2xl flex flex-col gap-2">
                  <item.icon size={20} className="text-neutral-400" weight="bold" />
                  <div>
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">{item.label}</p>
                    <p className="text-sm font-black text-neutral-900">{item.value || "-"}</p>
                  </div>
                </div>
              ))}
            </div>

            {listing.slot_limit && (
              <div className="bg-primary/5 p-6 rounded-2xl border border-primary/10">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <UsersIcon size={20} weight="bold" className="text-primary" />
                    <span className="font-bold text-primary">Limite de Slots (Demandes)</span>
                  </div>
                  <span className="text-xs font-black text-primary uppercase">
                    {listing.slots_filled || 0} / {listing.slot_limit}
                  </span>
                </div>
                <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-500" 
                    style={{ width: `${Math.min(((listing.slots_filled || 0) / listing.slot_limit) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="space-y-4">
              <p className="text-sm text-neutral-600 leading-relaxed whitespace-pre-wrap">
                {listing.description}
              </p>
            </div>

            {listing.amenities && listing.amenities.length > 0 && (
              <div className="pt-6 border-t border-neutral-50">
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-4">Équipements</p>
                <div className="flex flex-wrap gap-2">
                  {listing.amenities.map((amenity, idx) => (
                    <span key={idx} className="px-3 py-1.5 bg-neutral-50 text-neutral-600 text-[11px] font-bold rounded-lg border border-neutral-100">
                      {amenity}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Stats & Owner */}
        <div className="space-y-8">
          <section className="bg-white p-8 rounded-[32px] border border-neutral-100 shadow-sm space-y-6">
            <h3 className="font-bold text-neutral-900 flex items-center gap-2 text-lg">
              <CurrencyCircleDollarIcon
                size={24}
                weight="bold"
                className="text-primary"
              />
              Prix du Bien
            </h3>
            <div className="space-y-1">
              <p className="text-3xl font-black text-neutral-900 tracking-tight">
                {parseInt(listing.price).toLocaleString()} F
              </p>
              <p className="text-sm text-neutral-500 font-medium">
                Par {listing.period || "Mois"}
              </p>
            </div>
          </section>

          {/* Owner Info */}
          <section className="bg-white p-8 rounded-[32px] border border-neutral-100 shadow-sm space-y-6">
            <h3 className="font-bold text-neutral-900 flex items-center gap-2 text-lg">
              <UsersIcon size={20} weight="bold" className="text-neutral-400" />
              {listing.agent?.user_type === "owner"
                ? "Propriétaire"
                : "Agent Responsable"}
            </h3>
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-neutral-100 overflow-hidden border border-neutral-200 relative">
                  {listing.agent?.avatar_url ? (
                    <Image
                      src={listing.agent.avatar_url}
                      alt={listing.agent.full_name}
                      fill
                      sizes="56px"
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
                  <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider mt-1">
                    {listing.agent?.user_type || "Particulier"}
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-neutral-50">
                {listing.agent?.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-lg bg-neutral-50 flex items-center justify-center text-neutral-400">
                      <PhoneIcon size={16} weight="bold" />
                    </div>
                    <span className="font-medium text-neutral-600">
                      {listing.agent.phone}
                    </span>
                  </div>
                )}
                {listing.agent?.email && (
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-lg bg-neutral-50 flex items-center justify-center text-neutral-400">
                      <EnvelopeIcon size={16} weight="bold" />
                    </div>
                    <span className="font-medium text-neutral-600 break-all">
                      {listing.agent.email}
                    </span>
                  </div>
                )}
                {listing.agent?.company_name && (
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-lg bg-neutral-50 flex items-center justify-center text-neutral-400">
                      <BuildingsIcon size={16} weight="bold" />
                    </div>
                    <span className="font-bold text-primary">
                      {listing.agent.company_name}
                    </span>
                  </div>
                )}
                {listing.agent?.facebook_url && (
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-lg bg-neutral-50 flex items-center justify-center text-blue-600">
                      <FacebookLogoIcon size={16} weight="fill" />
                    </div>
                    <a
                      href={listing.agent.facebook_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-blue-600 hover:underline"
                    >
                      Lien Facebook
                    </a>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      <section className="bg-white p-8 rounded-[32px] border border-neutral-100 shadow-sm">
        <h3 className="text-xl font-bold text-neutral-900 mb-8 flex items-center gap-3">
          <CalendarBlankIcon size={24} weight="bold" className="text-primary" />
          Planning des Visites
        </h3>
        <PropertyOpenHouseManager propertyId={listing.id} />
      </section>

      {/* Transactions History */}
      <section className="bg-white p-8 rounded-[32px] border border-neutral-100 shadow-sm space-y-8">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-neutral-900 flex items-center gap-3 text-xl">
            <ReceiptIcon size={24} weight="bold" className="text-primary" />
            Historique des Paiements
          </h3>
          <span className="text-[10px] font-bold text-neutral-400 bg-neutral-50 px-3 py-1 rounded-full uppercase tracking-widest border border-neutral-100">
            {transactions.length} Transaction{transactions.length > 1 ? "s" : ""}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {transactions.length > 0 ? (
            transactions.map((tx) => {
              const metadata = tx.metadata as TransactionMetadata;
              return (
                <div key={tx.id} className="bg-white rounded-[24px] p-6 border border-neutral-100 shadow-sm hover:shadow-md transition-all">
                  <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", tx.type === "listing_submission" ? "bg-orange-50 text-orange-600" : tx.type === "photography" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-600")}>
                          {tx.type === "listing_submission" ? <BuildingsIcon size={20} weight="fill" /> : tx.type === "photography" ? <CameraIcon size={20} weight="fill" /> : <LightningIcon size={20} weight="fill" />}
                        </div>
                        <div>
                          <p className="text-sm font-black text-neutral-900 leading-none capitalize">
                            {tx.type === "listing_submission" ? "Publication" : tx.type === "photography" ? "Photographie" : "Boost"}
                          </p>
                          <p className="text-[9px] text-neutral-400 font-bold mt-1 uppercase tracking-wider">ID: {tx.deposit_id.split("-")[0]}</p>
                        </div>
                      </div>
                      <div className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wide", tx.status === "completed" ? "bg-green-50 text-green-700 border border-green-100" : tx.status === "failed" ? "bg-red-50 text-red-700 border border-red-100" : "bg-orange-50 text-orange-700 border border-orange-100")}>
                        {tx.status === "completed" ? <CheckCircleIcon size={12} weight="fill" /> : tx.status === "failed" ? <XCircleIcon size={12} weight="fill" /> : <ClockIcon size={12} weight="fill" />}
                        {tx.status === "completed" ? "Réussi" : tx.status === "failed" ? "Échec" : "Attente"}
                      </div>
                    </div>

                    <div className="w-full space-y-2 py-4 border-y border-neutral-50">
                      {metadata?.tier && (
                        <div className="flex items-center justify-between text-[10px] font-bold">
                          <span className="text-neutral-400 uppercase tracking-widest">Publication ({metadata.tier.name})</span>
                          <span className="text-neutral-900">{metadata.tier.base_fee.toLocaleString()} F</span>
                        </div>
                      )}
                      {metadata?.add_ons?.map((a) => {
                        const Icon = ADD_ON_ICONS[a.id] || InfoIcon;
                        const label = ADD_ON_LABELS[a.id] || a.name;
                        return (
                          <div key={a.id} className="flex items-center justify-between text-[10px] font-bold">
                            <span className="text-neutral-400 uppercase tracking-widest">{label}</span>
                            <span className="text-neutral-900">{a.price.toLocaleString()} F</span>
                          </div>
                        );
                      })}
                      {metadata?.commission && (
                        <div className="flex items-center justify-between text-[10px] font-bold">
                          <span className="text-neutral-400 uppercase tracking-widest">Frais Service</span>
                          <span className="text-neutral-900">{metadata.commission.toLocaleString()} F</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-baseline justify-between pt-2">
                      <span className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">Total Payé</span>
                      <p className="text-2xl font-black text-neutral-900 tracking-tight">
                        {tx.amount.toLocaleString()} <span className="text-[10px] text-neutral-400 font-bold uppercase">FCFA</span>
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <span className="text-[9px] font-bold text-neutral-300 uppercase tracking-[0.1em]">{tx.provider} • {tx.payer_phone}</span>
                      <p className="text-[9px] text-neutral-300 font-bold">
                        {new Date(tx.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full py-16 text-center bg-neutral-50/50 rounded-[32px] border border-dashed border-neutral-200">
              <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                <ReceiptIcon size={32} className="text-neutral-300" />
              </div>
              <p className="text-sm text-neutral-400 font-bold">
                Aucun paiement enregistré pour ce bien.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
