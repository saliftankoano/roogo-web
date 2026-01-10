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
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  CalendarBlankIcon,
  CaretDownIcon,
  WarningCircleIcon,
  CheckIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import PhotoManager from "@/components/admin/PhotoManager";
import PropertyOpenHouseManager from "@/components/admin/PropertyOpenHouseManager";
import {
  fetchPropertyById,
  fetchTransactionsByPropertyId,
  updatePropertyStatus,
  Property,
  Transaction,
} from "@/lib/data";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";

function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
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
      // First fetch the property to get its payment_id
      const propertyData = await fetchPropertyById(id);
      setListing(propertyData);

      // Then fetch transactions, passing payment_id as fallback for legacy transactions
      const transactionsData = await fetchTransactionsByPropertyId(
        id,
        propertyData?.payment_id
      );
      setTransactions(transactionsData);
      setLoading(false);
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
                  className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-neutral-100 overflow-hidden z-30"
                >
                  <div className="p-1">
                    {[
                      {
                        value: "en_attente",
                        label: "En attente (Photo Pro)",
                      },
                      {
                        value: "en_ligne",
                        label: "En ligne (Publiée)",
                      },
                      {
                        value: "expired",
                        label: "Expirée (Louée/Vendue)",
                      },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => initiateStatusChange(option.value)}
                        className={cn(
                          "w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wide flex items-center justify-between hover:bg-neutral-50 transition-colors",
                          listing.status === option.value
                            ? "bg-neutral-50 text-neutral-900"
                            : "text-neutral-500"
                        )}
                      >
                        <span>{option.label}</span>
                        {listing.status === option.value && (
                          <CheckIcon
                            size={14}
                            weight="bold"
                            className="text-primary"
                          />
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
        {/* Left Column: Photos */}
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-white p-8 rounded-[32px] border border-neutral-100 shadow-sm">
            <PhotoManager
              propertyId={listing.id}
              initialPhotos={listing.images}
              isProfessional={listing.status === "en_ligne"}
              onPhotosUpdated={(isPro) => {
                // If photos are validated as professional, update status to en_ligne
                if (isPro && listing.status !== "en_ligne") {
                  initiateStatusChange("en_ligne");
                }
              }}
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
              {listing.agent?.user_type === "owner"
                ? "Propriétaire"
                : "Agent Responsable"}
            </h3>
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
                  {listing.agent?.user_type === "owner"
                    ? "Particulier (Propriétaire)"
                    : listing.agent?.full_name}
                </p>
                {listing.agent?.user_type !== "owner" && (
                  <p className="text-xs text-neutral-500 font-medium mt-1">
                    {listing.agent?.phone}
                  </p>
                )}
              </div>
            </div>
            {listing.agent?.user_type !== "owner" && (
              <Button
                variant="ghost"
                className="w-full justify-center text-neutral-600 hover:bg-neutral-50 h-12 rounded-xl text-xs font-bold uppercase tracking-wider border border-neutral-100 transition-all"
              >
                Contacter l&apos;agent
              </Button>
            )}
          </section>
        </div>
      </div>

      {/* Open House Management - Full Width */}
      <section className="bg-white p-8 rounded-[32px] border border-neutral-100 shadow-sm">
        <h3 className="text-xl font-bold text-neutral-900 mb-8 flex items-center gap-3">
          <CalendarBlankIcon size={24} weight="bold" className="text-primary" />
          Planning des Visites
        </h3>
        <PropertyOpenHouseManager propertyId={listing.id} />
      </section>

      {/* Transactions History - Full Width */}
      <section className="bg-white p-8 rounded-[32px] border border-neutral-100 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-neutral-900 flex items-center gap-2 text-xl">
            <ReceiptIcon size={24} weight="bold" className="text-primary" />
            Historique des Paiements
          </h3>
          <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
            {transactions.length} Transaction
            {transactions.length > 1 ? "s" : ""}
          </span>
        </div>

        {transactions.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-neutral-50">
            <table className="w-full text-left">
              <thead className="bg-neutral-50/50">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                    Date
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                    Type
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                    Montant
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                    Statut
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {transactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className="hover:bg-neutral-50/30 transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-medium text-neutral-600">
                      {new Date(tx.created_at).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-neutral-900">
                        {tx.type === "listing_submission"
                          ? "Publication"
                          : "Photographie"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-neutral-900">
                        {tx.amount.toLocaleString()} {tx.currency}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        {tx.status === "completed" ? (
                          <CheckCircleIcon
                            size={16}
                            weight="fill"
                            className="text-green-500"
                          />
                        ) : tx.status === "failed" ? (
                          <XCircleIcon
                            size={16}
                            weight="fill"
                            className="text-red-500"
                          />
                        ) : (
                          <ClockIcon
                            size={16}
                            weight="fill"
                            className="text-orange-400"
                          />
                        )}
                        <span
                          className={cn(
                            "text-[10px] font-bold uppercase tracking-wider",
                            tx.status === "completed"
                              ? "text-green-600"
                              : tx.status === "failed"
                              ? "text-red-600"
                              : "text-orange-600"
                          )}
                        >
                          {tx.status === "completed"
                            ? "Réussi"
                            : tx.status === "failed"
                            ? "Échoué"
                            : "En attente"}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center bg-neutral-50/50 rounded-2xl border border-dashed border-neutral-200">
            <p className="text-sm text-neutral-400 font-medium">
              Aucun paiement enregistré pour ce bien.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
