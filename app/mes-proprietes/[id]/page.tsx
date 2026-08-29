"use client";

import { useUser } from "@clerk/nextjs";
import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import {
  CaretLeftIcon,
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
  UserCircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { roogoMotion } from "@/lib/motion";
import { Button } from "@/components/ui/Button";
import PhotoManager from "@/components/admin/PhotoManager";
import { fetchPropertyById, Property } from "@/lib/data";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
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

type PropertyFieldValue =
  | string
  | number
  | boolean
  | string[]
  | Record<string, unknown>
  | null
  | undefined;

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
    case "en_attente":
      return "En attente";
    case "en_ligne":
      return "En ligne";
    case "expired":
      return "Expirée";
    case "locked":
      return "Réservé";
    case "finalized":
      return "Loué";
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
    case "locked":
      return "bg-primary/90 text-white border-primary/20";
    case "finalized":
      return "bg-neutral-900 text-white border-neutral-800";
    case "expired":
      return "bg-neutral-50 text-neutral-600 border-neutral-200";
    default:
      return "bg-neutral-50 text-neutral-600 border-neutral-200";
  }
};

type PendingEdit = {
  id: string;
  payload: Record<string, unknown>;
  status: string;
  review_note: string | null;
  created_at: string;
};

async function fetchPendingEdit(
  propertyId: string,
): Promise<PendingEdit | null> {
  const res = await fetch(`/api/properties/${propertyId}/pending-edits`);
  if (!res.ok) return null;
  const json = (await res.json()) as { pendingEdit: PendingEdit | null };
  return json.pendingEdit ?? null;
}

async function submitPendingEdit(
  propertyId: string,
  payload: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`/api/properties/${propertyId}/pending-edits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok)
    return { success: false, error: json.error ?? "Erreur inconnue" };
  return { success: true };
}

async function cancelPendingEdit(propertyId: string): Promise<boolean> {
  const res = await fetch(`/api/properties/${propertyId}/pending-edits`, {
    method: "DELETE",
  });
  return res.ok;
}

// Field labels for the diff view
const FIELD_LABELS: Record<string, string> = {
  price: "Prix",
  caution_mois: "Caution (mois)",
  loyer_avance_mois: "Loyer d'avance (mois)",
  caution_type: "Type de caution",
  caution_valeur: "Valeur caution",
  city: "Ville",
  quartier: "Quartier",
  latitude: "Latitude",
  longitude: "Longitude",
  property_type: "Type de bien",
  bedrooms: "Chambres",
  bathrooms: "Salles de bain",
  area: "Superficie",
  parking_spaces: "Parking",
  sejour_minimum: "Séjour minimum",
  capacite_max: "Capacité max",
  description: "Description",
  dos_and_donts: "Règles",
  interdictions: "Interdictions",
  amenities: "Équipements",
};

export default function OwnerPropertyDetailPage() {
  const params = useParams();
  const id = (params?.id as string) || "";
  const router = useRouter();
  const [listing, setListing] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);

  const [applicants] = useState<
    {
      id: string;
      status: string;
      created_at: string;
      users: {
        full_name: string | null;
        phone: string | null;
        avatar_url: string | null;
      } | null;
    }[]
  >([]);
  const [lockTransactions] = useState<
    {
      id: string;
      amount: number;
      currency: string;
      status: string;
      created_at: string;
      users: { full_name: string | null } | null;
    }[]
  >([]);
  const [loadingApplicants] = useState(false);

  // Edit state
  const { user: clerkUser } = useUser();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Property>>({});
  const [confirmEditModalOpen, setConfirmEditModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Pending edit state
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
  const [loadingPendingEdit, setLoadingPendingEdit] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const loadPendingEdit = useCallback(async (propertyId: string) => {
    setLoadingPendingEdit(true);
    const data = await fetchPendingEdit(propertyId);
    setPendingEdit(data);
    setLoadingPendingEdit(false);
  }, []);

  useEffect(() => {
    async function loadData() {
      if (!id) return;
      try {
        const propertyData = await fetchPropertyById(id);
        if (propertyData && propertyData.owner_id !== clerkUser?.id) {
          router.push("/proprietes");
          return;
        }
        setListing(propertyData);
        if (propertyData) await loadPendingEdit(propertyData.id);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    }
    if (clerkUser) loadData();
  }, [id, clerkUser, router, loadPendingEdit]);

  const startEditing = () => {
    if (!listing) return;
    setEditForm({
      description: listing.description,
      price: listing.price,
      city: listing.city,
      quartier: listing.quartier,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      area: listing.area,
      parking: listing.parking,
      propertyType: listing.propertyType,
      amenities: [...listing.amenities],
      period: listing.period,
    });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditForm({});
  };

  const handleEditChange = (
    field: keyof Property,
    value: PropertyFieldValue,
  ) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const formatChangeValue = (value: PropertyFieldValue): string => {
    if (value === null || value === undefined || value === "") return "(vide)";
    if (Array.isArray(value))
      return value.length > 0 ? value.join(", ") : "(vide)";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  const getChangedFields = () => {
    if (!listing) return [];
    const changes: {
      field: string;
      old: PropertyFieldValue;
      new: PropertyFieldValue;
      label: string;
    }[] = [];

    const fields: { key: keyof Property; label: string }[] = [
      { key: "description", label: "Description" },
      { key: "price", label: "Prix" },
      { key: "city", label: "Ville" },
      { key: "quartier", label: "Quartier" },
      { key: "bedrooms", label: "Chambres" },
      { key: "bathrooms", label: "Salles de bain" },
      { key: "area", label: "Superficie" },
      { key: "parking", label: "Parking" },
      { key: "propertyType", label: "Type de bien" },
    ];

    fields.forEach(({ key, label }) => {
      if (editForm[key] !== undefined && editForm[key] !== listing[key]) {
        changes.push({
          field: key,
          old: listing[key],
          new: editForm[key],
          label,
        });
      }
    });

    if (
      editForm.amenities &&
      JSON.stringify(editForm.amenities) !== JSON.stringify(listing.amenities)
    ) {
      changes.push({
        field: "amenities",
        old: listing.amenities.join(", "),
        new: editForm.amenities.join(", "),
        label: "Équipements",
      });
    }

    return changes;
  };

  const handleSaveClick = () => {
    if (getChangedFields().length === 0) {
      setIsEditing(false);
      return;
    }
    setConfirmEditModalOpen(true);
  };

  // Map the UI editForm fields to pending-edit API payload keys (snake_case DB columns)
  const buildApiPayload = () => {
    const payload: Record<string, unknown> = {};
    if (editForm.price !== undefined) payload.price = editForm.price;
    if (editForm.city !== undefined) payload.city = editForm.city;
    if (editForm.quartier !== undefined) payload.quartier = editForm.quartier;
    if (editForm.bedrooms !== undefined) payload.bedrooms = editForm.bedrooms;
    if (editForm.bathrooms !== undefined)
      payload.bathrooms = editForm.bathrooms;
    if (editForm.area !== undefined) payload.area = editForm.area;
    if (editForm.parking !== undefined)
      payload.parking_spaces = editForm.parking;
    if (editForm.propertyType !== undefined)
      payload.property_type = editForm.propertyType;
    if (editForm.description !== undefined)
      payload.description = editForm.description;
    if (editForm.amenities !== undefined)
      payload.amenities = editForm.amenities;
    return payload;
  };

  const confirmSave = async () => {
    if (!listing) return;
    setIsSaving(true);
    const result = await submitPendingEdit(listing.id, buildApiPayload());
    setIsSaving(false);
    if (result.success) {
      setIsEditing(false);
      setConfirmEditModalOpen(false);
      setEditForm({});
      // Refresh the pending edit banner
      await loadPendingEdit(listing.id);
    } else {
      alert(result.error ?? "Erreur lors de la soumission des modifications.");
    }
  };

  const handleCancelPendingEdit = async () => {
    if (!listing || !pendingEdit) return;
    setIsCancelling(true);
    const ok = await cancelPendingEdit(listing.id);
    setIsCancelling(false);
    if (ok) {
      setPendingEdit(null);
    } else {
      alert("Impossible d'annuler les modifications.");
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

  const isDailyListing = isDailyRental(listing);
  const isSaleListing = listing.listingType === "vendre";
  const dailyConditionRows = getDailyConditionRows(listing);

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-10 space-y-10 relative">
      {/* Edit Confirmation Modal */}
      <Portal>
        <AnimatePresence>
          {confirmEditModalOpen && (
            <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={() => setConfirmEditModalOpen(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.985, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.985, y: 8 }}
                transition={roogoMotion.standard}
                className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl relative z-10"
              >
                <h3 className="text-xl font-bold text-neutral-900 mb-2">
                  Soumettre pour validation
                </h3>
                <p className="text-sm text-neutral-500 mb-4">
                  Ces modifications seront examinées par notre équipe avant
                  d&apos;être appliquées. Votre annonce reste visible sans
                  changement en attendant.
                </p>
                <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
                  {getChangedFields().map((change, idx) => (
                    <div
                      key={idx}
                      className="text-sm bg-neutral-50 p-3 rounded-lg"
                    >
                      <p className="font-bold text-neutral-700">
                        {change.label}
                      </p>
                      <p className="text-neutral-500">
                        <span className="line-through">
                          {formatChangeValue(change.old)}
                        </span>
                        {" → "}
                        <span className="text-primary font-semibold">
                          {formatChangeValue(change.new)}
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmEditModalOpen(false)}
                    className="flex-1"
                    disabled={isSaving}
                  >
                    Annuler
                  </Button>
                  <Button
                    onClick={confirmSave}
                    className="flex-1 bg-primary text-white"
                    disabled={isSaving}
                  >
                    {isSaving ? "Soumission..." : "Soumettre"}
                  </Button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </Portal>

      {/* Pending edit banner */}
      {!loadingPendingEdit && pendingEdit && (
        <div className="bg-amber-50 border border-amber-200 rounded-[24px] p-5 flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex items-start gap-3 flex-1">
            <ClockIcon
              size={20}
              weight="fill"
              className="text-amber-500 mt-0.5 shrink-0"
            />
            <div className="min-w-0">
              <p className="font-black text-amber-800 text-sm">
                Modifications en attente de validation
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Ces champs sont en cours de révision :{" "}
                <span className="font-semibold">
                  {Object.keys(pendingEdit.payload)
                    .map((k) => FIELD_LABELS[k] ?? k)
                    .join(", ")}
                </span>
              </p>
              <p className="text-xs text-amber-500 mt-1">
                Soumis le{" "}
                {new Date(pendingEdit.created_at).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="text-xs font-bold text-amber-700 hover:bg-amber-100 shrink-0 self-start"
            onClick={handleCancelPendingEdit}
            disabled={isCancelling}
          >
            {isCancelling ? "Annulation..." : "Retirer"}
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="group rounded-full w-10 h-10 flex items-center justify-center hover:bg-neutral-100 transition-all duration-200 active:scale-[0.985]"
          >
            <CaretLeftIcon
              size={24}
              className="text-neutral-700 group-hover:text-neutral-900 group-hover:-translate-x-0.5 transition-all duration-200"
              weight="bold"
            />
          </button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              {listing.isSponsored && (
                <span className="text-[10px] font-bold text-primary bg-primary/5 px-2 py-0.5 rounded-full border border-primary/20 uppercase tracking-widest">
                  Premium
                </span>
              )}
              {listing.status && (
                <span
                  className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                    getStatusColor(listing.status),
                  )}
                >
                  {getStatusLabel(listing.status)}
                </span>
              )}
              {pendingEdit && (
                <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-1">
                  <WarningCircleIcon size={10} weight="fill" />
                  Modifications en attente
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-neutral-900">
              {listing.location}
            </h1>
            <div className="flex items-center gap-2 text-xs text-neutral-500 mt-1 font-medium">
              <MapPinIcon size={14} weight="bold" />
              {isEditing ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editForm.quartier}
                    onChange={(e) =>
                      handleEditChange("quartier", e.target.value)
                    }
                    placeholder="Quartier"
                    className="bg-neutral-50 border border-neutral-200 rounded px-1"
                  />
                  <input
                    type="text"
                    value={editForm.city}
                    onChange={(e) => handleEditChange("city", e.target.value)}
                    placeholder="Ville"
                    className="bg-neutral-50 border border-neutral-200 rounded px-1"
                  />
                </div>
              ) : (
                <span>{listing.location}</span>
              )}
              {listing.propertyType && (
                <>
                  <span className="text-neutral-300">•</span>
                  <span className="text-primary font-bold">
                    {getPropertyTypeLabel(listing.propertyType)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 items-center">
          {isEditing ? (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="text-neutral-500 hover:bg-neutral-50 text-xs font-bold uppercase tracking-wider"
                onClick={cancelEditing}
              >
                Annuler
              </Button>
              <Button
                className="bg-primary text-white text-xs font-bold uppercase tracking-wider"
                onClick={handleSaveClick}
              >
                Soumettre
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="text-primary hover:bg-orange-50 text-xs font-bold uppercase tracking-wider"
              onClick={startEditing}
              disabled={!!pendingEdit}
              title={
                pendingEdit
                  ? "Des modifications sont déjà en attente de validation"
                  : undefined
              }
            >
              Modifier
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-10">
          {/* Photo Manager Section */}
          <section className="bg-white p-8 rounded-[32px] border border-neutral-100 shadow-sm">
            <PhotoManager
              propertyId={listing.id}
              initialPhotos={listing.images}
              primaryImageUrl={listing.image}
              isProfessional={listing.status === "en_ligne"}
              onPhotosUpdated={() => {}}
            />
          </section>

          <section className="bg-white p-8 rounded-[32px] border border-neutral-100 shadow-sm space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {
                  label: "Chambres",
                  value: listing.bedrooms,
                  icon: BedIcon,
                  key: "bedrooms",
                },
                {
                  label: "Salles de bain",
                  value: listing.bathrooms,
                  icon: BathtubIcon,
                  key: "bathrooms",
                },
                {
                  label: "Superficie",
                  value: listing.area,
                  icon: SquaresFourIcon,
                  key: "area",
                  suffix: " m²",
                },
                {
                  label: "Parking",
                  value: listing.parking,
                  icon: CarIcon,
                  key: "parking",
                },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="bg-neutral-50 p-4 rounded-2xl flex flex-col gap-2"
                >
                  <item.icon
                    size={20}
                    className="text-neutral-400"
                    weight="bold"
                  />
                  <div>
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                      {item.label}
                    </p>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editForm[item.key as keyof Property] as string}
                        onChange={(e) =>
                          handleEditChange(
                            item.key as keyof Property,
                            e.target.value,
                          )
                        }
                        className="text-sm font-black text-neutral-900 bg-white border border-neutral-200 rounded px-1 w-full"
                      />
                    ) : (
                      <p className="text-sm font-black text-neutral-900">
                        {item.value || "-"}
                        {item.suffix || ""}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="prose prose-neutral max-w-none">
              {isEditing ? (
                <textarea
                  value={editForm.description}
                  onChange={(e) =>
                    handleEditChange("description", e.target.value)
                  }
                  className="w-full h-40 p-4 text-neutral-600 leading-relaxed bg-neutral-50 border border-neutral-200 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                />
              ) : (
                <p className="text-neutral-600 leading-relaxed whitespace-pre-wrap">
                  {listing.description}
                </p>
              )}
            </div>

            {listing.amenities && listing.amenities.length > 0 && (
              <div className="pt-6 border-t border-neutral-50">
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-4">
                  Équipements
                </p>
                <div className="flex flex-wrap gap-2">
                  {listing.amenities.map((amenity, idx) => (
                    <span
                      key={idx}
                      className="px-4 py-2 bg-neutral-50 text-neutral-700 rounded-xl text-xs font-bold border border-neutral-100"
                    >
                      {amenity}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-8">
          {/* Price Card */}
          <section className="bg-white p-8 rounded-[32px] border border-neutral-100 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary">
                <CurrencyCircleDollarIcon size={24} weight="bold" />
              </div>
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                {getPriceTitle(listing)}
              </p>
            </div>
            {isEditing ? (
              <div className="flex items-baseline gap-2">
                <input
                  type="number"
                  value={editForm.price}
                  onChange={(e) => handleEditChange("price", e.target.value)}
                  className="text-3xl font-black text-neutral-900 tracking-tight bg-neutral-50 border border-neutral-200 rounded-lg px-2 py-1 w-40"
                />
                <span className="text-sm text-neutral-400 font-bold uppercase tracking-wider">
                  {getPricePeriodLabel(listing)}
                </span>
              </div>
            ) : (
              <p className="text-3xl font-black text-neutral-900 tracking-tight">
                {formatXofAmount(listing.price)}{" "}
                <span className="text-sm text-neutral-400 font-bold uppercase tracking-wider ml-1">
                  {getPricePeriodLabel(listing)}
                </span>
              </p>
            )}
            {!isSaleListing && (
              <div className="mt-5 space-y-2 border-t border-neutral-100 pt-4 text-xs font-bold text-neutral-500">
                {isDailyListing ? (
                  dailyConditionRows.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between"
                    >
                      <span>{row.label}</span>
                      <span className="text-neutral-900">{row.value}</span>
                    </div>
                  ))
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span>Caution remboursable</span>
                      <span className="text-neutral-900">
                        {listing.deposit ?? 0} mois
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Loyer d&apos;avance</span>
                      <span className="text-neutral-900">
                        {listing.loyerAvanceMois ?? 1} mois
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </section>

          {/* Agent Card */}
          {listing.agent && (
            <section className="bg-white overflow-hidden rounded-[32px] border border-neutral-100 shadow-sm">
              <div className="p-8 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 overflow-hidden relative border-2 border-primary">
                    {listing.agent.avatar_url ? (
                      <Image
                        src={listing.agent.avatar_url}
                        alt={listing.agent.full_name}
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xl font-bold text-primary">
                        {listing.agent.full_name?.charAt(0)?.toUpperCase() ||
                          "?"}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-neutral-900 leading-tight">
                      {listing.agent.full_name}
                    </p>
                    <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider mt-1">
                      {listing.agent.user_type || "Particulier"}
                    </p>
                    {listing.agent.identity_verified && (
                      <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-green-700">
                        <CheckCircleIcon size={12} weight="fill" />
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
                      <span className="font-medium text-neutral-600">
                        {listing.agent.phone}
                      </span>
                    </div>
                  )}
                  {listing.agent.email && (
                    <div className="flex items-center gap-3 text-sm">
                      <div className="w-8 h-8 rounded-lg bg-neutral-50 flex items-center justify-center text-neutral-400">
                        <EnvelopeIcon size={16} weight="bold" />
                      </div>
                      <span className="font-medium text-neutral-600 break-all">
                        {listing.agent.email}
                      </span>
                    </div>
                  )}
                  {listing.agent.company_name && (
                    <div className="flex items-center gap-3 text-sm">
                      <div className="w-8 h-8 rounded-lg bg-neutral-50 flex items-center justify-center text-neutral-400">
                        <BuildingsIcon size={16} weight="bold" />
                      </div>
                      <span className="font-bold text-primary">
                        {listing.agent.company_name}
                      </span>
                    </div>
                  )}
                  {listing.agent.facebook_url && (
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
                        Voir la page Facebook
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Candidatures Section */}
      <div className="mt-10 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <UsersIcon size={16} weight="bold" className="text-primary" />
          </div>
          <h2 className="text-lg font-black text-neutral-900">Candidatures</h2>
          <span className="text-xs font-bold text-neutral-400 bg-neutral-100 px-2 py-1 rounded-lg">
            {applicants.length}
          </span>
        </div>

        {lockTransactions.length > 0 &&
          lockTransactions[0].status === "completed" && (
            <div className="bg-green-50 border border-green-200 rounded-[24px] p-6">
              <div className="flex items-center gap-3 mb-2">
                <CheckCircleIcon
                  size={20}
                  weight="fill"
                  className="text-green-600"
                />
                <p className="font-black text-green-700">Bien loué</p>
              </div>
              <p className="text-sm text-green-600 font-medium">
                {lockTransactions[0].users?.full_name || "Locataire inconnu"}
              </p>
              <p className="text-xs text-green-500 mt-1">
                {lockTransactions[0].amount.toLocaleString("fr-FR")} FCFA —{" "}
                {new Date(lockTransactions[0].created_at).toLocaleDateString(
                  "fr-FR",
                  {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  },
                )}
              </p>
            </div>
          )}

        <section className="bg-white rounded-[32px] border border-neutral-100 shadow-sm overflow-hidden">
          {loadingApplicants ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : applicants.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3 text-center">
              <UserCircleIcon size={40} className="text-neutral-200" />
              <p className="text-sm font-bold text-neutral-400">
                Aucune candidature pour ce bien
              </p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-50">
              {applicants.map((applicant) => {
                const statusConfig = {
                  approved: {
                    label: "Accepté",
                    color: "bg-green-100 text-green-700",
                    Icon: CheckCircleIcon,
                  },
                  rejected: {
                    label: "Refusé",
                    color: "bg-red-100 text-red-600",
                    Icon: XCircleIcon,
                  },
                  pending: {
                    label: "En attente",
                    color: "bg-yellow-100 text-yellow-700",
                    Icon: ClockIcon,
                  },
                }[applicant.status] || {
                  label: "En attente",
                  color: "bg-yellow-100 text-yellow-700",
                  Icon: ClockIcon,
                };
                return (
                  <div
                    key={applicant.id}
                    className="flex items-center gap-4 p-6"
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-sm font-black text-primary shrink-0">
                      {applicant.users?.full_name?.charAt(0)?.toUpperCase() ||
                        "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-neutral-900 truncate">
                        {applicant.users?.full_name || "Candidat inconnu"}
                      </p>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        {new Date(applicant.created_at).toLocaleDateString(
                          "fr-FR",
                          {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          },
                        )}
                      </p>
                    </div>
                    <div
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0",
                        statusConfig.color,
                      )}
                    >
                      <statusConfig.Icon size={12} weight="fill" />
                      {statusConfig.label}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
