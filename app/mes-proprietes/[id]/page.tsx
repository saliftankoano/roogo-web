"use client";

import { useUser } from "@clerk/nextjs";
import { useState, useEffect } from "react";
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
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import PhotoManager from "@/components/admin/PhotoManager";
import {
  fetchPropertyById,
  updateProperty,
  Property,
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

type PropertyFieldValue =
  | string
  | number
  | boolean
  | string[]
  | Record<string, unknown>
  | null
  | undefined;

// Property type mapping to French
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

export default function OwnerPropertyDetailPage() {
  const params = useParams();
  const id = (params?.id as string) || "";
  const router = useRouter();
  const [listing, setListing] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);

  // Candidatures state
  interface Applicant {
    id: string;
    status: string;
    created_at: string;
    users: { full_name: string | null; phone: string | null; avatar_url: string | null } | null;
  }
  interface LockTransaction {
    id: string;
    amount: number;
    currency: string;
    status: string;
    created_at: string;
    users: { full_name: string | null } | null;
  }
  const [applicants] = useState<Applicant[]>([]);
  const [lockTransactions] = useState<LockTransaction[]>([]);
  const [loadingApplicants] = useState(false);

  // Edit Management
  const { user: clerkUser } = useUser();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Property>>({});
  const [confirmEditModalOpen, setConfirmEditModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!id) return;

      try {
        const propertyData = await fetchPropertyById(id);
        
        // Verify ownership
        if (propertyData && propertyData.owner_id !== clerkUser?.id) {
          router.push("/proprietes");
          return;
        }

        setListing(propertyData);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    }
    
    if (clerkUser) {
      loadData();
    }
  }, [id, clerkUser, router]);

  const startEditing = () => {
    if (!listing) return;
    setEditForm({
      description: listing.description,
      price: listing.price,
      address: listing.address,
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

  const handleEditChange = (field: keyof Property, value: PropertyFieldValue) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const formatChangeValue = (value: PropertyFieldValue): string => {
    if (value === null || value === undefined || value === "") {
      return "(vide)";
    }

    if (Array.isArray(value)) {
      return value.length > 0 ? value.join(", ") : "(vide)";
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value);
  };

  const getChangedFields = () => {
    if (!listing) return [];
    const changes: { field: string; old: PropertyFieldValue; new: PropertyFieldValue; label: string }[] = [];
    
    const fields: { key: keyof Property; label: string }[] = [
      { key: "description", label: "Description" },
      { key: "price", label: "Prix" },
      { key: "address", label: "Adresse" },
      { key: "city", label: "Ville" },
      { key: "quartier", label: "Quartier" },
      { key: "bedrooms", label: "Chambres" },
      { key: "bathrooms", label: "Salles de bain" },
      { key: "area", label: "Superficie" },
      { key: "parking", label: "Parking" },
      { key: "propertyType", label: "Type de bien" },
      { key: "period", label: "Période" },
    ];

    fields.forEach(({ key, label }) => {
      if (editForm[key] !== undefined && editForm[key] !== listing[key]) {
        changes.push({ field: key, old: listing[key], new: editForm[key], label });
      }
    });

    // Check amenities separately
    if (editForm.amenities && JSON.stringify(editForm.amenities) !== JSON.stringify(listing.amenities)) {
      changes.push({ 
        field: "amenities", 
        old: listing.amenities.join(", "), 
        new: editForm.amenities.join(", "), 
        label: "Commodités" 
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

  const confirmSave = async () => {
    if (!listing) return;
    setIsSaving(true);
    const success = await updateProperty(listing.id, editForm);
    setIsSaving(false);
    if (success) {
      setListing({ ...listing, ...editForm } as Property);
      setIsEditing(false);
      setConfirmEditModalOpen(false);
      setEditForm({});
    } else {
      alert("Erreur lors de la mise à jour du bien");
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
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl relative z-10"
              >
                <h3 className="text-xl font-bold text-neutral-900 mb-4">
                  Confirmer les modifications
                </h3>
                <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
                  {getChangedFields().map((change, idx) => (
                    <div key={idx} className="text-sm bg-neutral-50 p-3 rounded-lg">
                      <p className="font-bold text-neutral-700">{change.label}</p>
                      <p className="text-neutral-500">
                        <span className="line-through">{formatChangeValue(change.old)}</span>
                        {" → "}
                        <span className="text-primary font-semibold">{formatChangeValue(change.new)}</span>
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
                    {isSaving ? "Enregistrement..." : "Confirmer"}
                  </Button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </Portal>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="group rounded-full w-10 h-10 flex items-center justify-center hover:bg-neutral-100 transition-all duration-200 active:scale-95"
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
                    getStatusColor(listing.status)
                  )}
                >
                  {getStatusLabel(listing.status)}
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
                    onChange={(e) => handleEditChange("quartier", e.target.value)}
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
                Enregistrer
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="text-primary hover:bg-orange-50 text-xs font-bold uppercase tracking-wider"
              onClick={startEditing}
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
              onPhotosUpdated={() => {
                // Owners can't change status, just refresh
              }}
            />
          </section>

          <section className="bg-white p-8 rounded-[32px] border border-neutral-100 shadow-sm space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Chambres", value: listing.bedrooms, icon: BedIcon, key: "bedrooms" },
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
                { label: "Parking", value: listing.parking, icon: CarIcon, key: "parking" },
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
                        onChange={(e) => handleEditChange(item.key as keyof Property, e.target.value)}
                        className="text-sm font-black text-neutral-900 bg-white border border-neutral-200 rounded px-1 w-full"
                      />
                    ) : (
                      <p className="text-sm font-black text-neutral-900">
                        {item.value || "-"}{item.suffix || ""}
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
                  onChange={(e) => handleEditChange("description", e.target.value)}
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
                Prix du loyer
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
                  FCFA / mois
                </span>
              </div>
            ) : (
              <p className="text-3xl font-black text-neutral-900 tracking-tight">
                {listing.price.toLocaleString()}{" "}
                <span className="text-sm text-neutral-400 font-bold uppercase tracking-wider ml-1">
                  FCFA / mois
                </span>
              </p>
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
                        {listing.agent.full_name?.charAt(0)?.toUpperCase() || "?"}
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
          <span className="text-xs font-bold text-neutral-400 bg-neutral-100 px-2 py-1 rounded-lg">{applicants.length}</span>
        </div>

        {lockTransactions.length > 0 && lockTransactions[0].status === "completed" && (
          <div className="bg-green-50 border border-green-200 rounded-[24px] p-6">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircleIcon size={20} weight="fill" className="text-green-600" />
              <p className="font-black text-green-700">Bien loue</p>
            </div>
            <p className="text-sm text-green-600 font-medium">{lockTransactions[0].users?.full_name || "Locataire inconnu"}</p>
            <p className="text-xs text-green-500 mt-1">
              {lockTransactions[0].amount.toLocaleString("fr-FR")} FCFA —{" "}
              {new Date(lockTransactions[0].created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
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
              <p className="text-sm font-bold text-neutral-400">Aucune candidature pour ce bien</p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-50">
              {applicants.map((applicant) => {
                const statusConfig = {
                  approved: { label: "Accepte", color: "bg-green-100 text-green-700", Icon: CheckCircleIcon },
                  rejected: { label: "Refuse", color: "bg-red-100 text-red-600", Icon: XCircleIcon },
                  pending: { label: "En attente", color: "bg-yellow-100 text-yellow-700", Icon: ClockIcon },
                }[applicant.status] || { label: "En attente", color: "bg-yellow-100 text-yellow-700", Icon: ClockIcon };
                return (
                  <div key={applicant.id} className="flex items-center gap-4 p-6">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-sm font-black text-primary shrink-0">
                      {applicant.users?.full_name?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-neutral-900 truncate">{applicant.users?.full_name || "Candidat inconnu"}</p>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        {new Date(applicant.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                    <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0", statusConfig.color)}>
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
