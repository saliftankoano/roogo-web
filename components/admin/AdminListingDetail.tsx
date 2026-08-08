"use client";
import { useAuth, useUser } from "@clerk/nextjs";

import { useState, useEffect, useRef } from "react";
import { PropertyDetailSkeleton } from "@/components/admin/skeletons";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  BedIcon,
  BathtubIcon,
  SquaresFourIcon,
  CarIcon,
  WhatsappLogoIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import PhotoManager from "@/components/admin/PhotoManager";
import PropertyOpenHouseManager from "@/components/admin/PropertyOpenHouseManager";
import ImportExistingLeaseWizard from "@/components/admin/ImportExistingLeaseWizard";
import {
  updatePropertyStatus,
  updateProperty,
  deleteProperty,
  Property,
  Transaction,
} from "@/lib/data";
import { getSecureTransactions } from "@/app/admin/annonces/[id]/actions";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { normalizeKuulaVirtualTourUrl } from "@/lib/virtual-tour";
import { isStaffLikeMetadata } from "@/lib/user-types";
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

type PropertyFieldValue =
  | string
  | number
  | boolean
  | string[]
  | Record<string, unknown>
  | null
  | undefined;

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
  monthlyRent?: number;
  cautionMois?: number;
  loyerAvanceMois?: number;
  cautionAmount?: number;
  advanceRentAmount?: number;
  totalMoveInAmount?: number;
}

type SaleIntake = {
  id: string;
  owner_first_name: string;
  owner_last_name: string;
  owner_phone: string;
  phone_has_whatsapp: boolean;
  status: "unlinked" | "linked" | "cancelled";
  linked_user_id: string | null;
  linked_at: string | null;
  created_at: string;
};

type OwnerSearchResult = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  user_type: string;
};

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

// Staff/founder listing management view. Served at the PUBLIC slug URL
// (/proprietes/[slug]) when the viewer is staff-like, so the address bar
// always holds the shareable public link. Security lives in the API routes;
// this render is gated server-side in the page and client-side below.
export default function AdminListingDetail({
  propertyId,
}: {
  propertyId: string;
}) {
  const id = propertyId;
  const router = useRouter();
  const [listing, setListing] = useState<Property | null>(null);
  const [saleIntake, setSaleIntake] = useState<SaleIntake | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [importLeaseOpen, setImportLeaseOpen] = useState(false);

  // Status Management
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  // Edit Management
  const { user: clerkUser } = useUser();
  const { getToken } = useAuth();
  const [ownerSearch, setOwnerSearch] = useState("");
  const [ownerResults, setOwnerResults] = useState<OwnerSearchResult[]>([]);
  const [isSearchingOwners, setIsSearchingOwners] = useState(false);
  const [isLinkingOwner, setIsLinkingOwner] = useState(false);
  const [ownerLinkError, setOwnerLinkError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Property>>({});
  const [confirmEditModalOpen, setConfirmEditModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const isStaffOrFounder = isStaffLikeMetadata(clerkUser?.publicMetadata);

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
      virtualTourUrl: listing.virtualTourUrl,
    });
    setEditError(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditForm({});
    setEditError(null);
  };

  const handleEditChange = (
    field: keyof Property,
    value: PropertyFieldValue,
  ) => {
    if (field === "virtualTourUrl") {
      setEditError(null);
    }
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

  const getChangedFields = (candidate: Partial<Property> = editForm) => {
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
      { key: "address", label: "Adresse" },
      { key: "city", label: "Ville" },
      { key: "quartier", label: "Quartier" },
      { key: "bedrooms", label: "Chambres" },
      { key: "bathrooms", label: "Salles de bain" },
      { key: "area", label: "Superficie" },
      { key: "parking", label: "Parking" },
      { key: "propertyType", label: "Type de bien" },
      { key: "period", label: "Période" },
      { key: "virtualTourUrl", label: "Visite virtuelle Kuula" },
    ];

    fields.forEach(({ key, label }) => {
      if (candidate[key] !== undefined && candidate[key] !== listing[key]) {
        changes.push({
          field: key,
          old: listing[key],
          new: candidate[key],
          label,
        });
      }
    });

    // Check amenities separately
    if (
      candidate.amenities &&
      JSON.stringify(candidate.amenities) !== JSON.stringify(listing.amenities)
    ) {
      changes.push({
        field: "amenities",
        old: listing.amenities.join(", "),
        new: candidate.amenities.join(", "),
        label: "Commodités",
      });
    }

    return changes;
  };

  const handleSaveClick = () => {
    let nextEditForm = editForm;
    if (typeof editForm.virtualTourUrl === "string") {
      try {
        const normalizedVirtualTourUrl = normalizeKuulaVirtualTourUrl(
          editForm.virtualTourUrl,
        );
        nextEditForm = {
          ...editForm,
          virtualTourUrl: normalizedVirtualTourUrl ?? undefined,
        };
        setEditForm(nextEditForm);
      } catch (error) {
        setEditError(
          error instanceof Error
            ? error.message
            : "Lien de visite virtuelle invalide",
        );
        return;
      }
    }

    if (getChangedFields(nextEditForm).length === 0) {
      setIsEditing(false);
      return;
    }
    setConfirmEditModalOpen(true);
  };

  const confirmSave = async () => {
    if (!listing) return;
    setIsSaving(true);
    const result = await updateProperty(listing.id, editForm);
    setIsSaving(false);
    if (result.success) {
      setListing({
        ...listing,
        ...editForm,
        virtualTourUrl:
          result.property?.virtualTourUrl ?? editForm.virtualTourUrl,
      } as Property);
      setIsEditing(false);
      setConfirmEditModalOpen(false);
      setEditForm({});
    } else {
      alert(result.error || "Erreur lors de la mise à jour du bien");
    }
  };
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusError, setStatusError] = useState<{
    message: string;
    code?: string;
  } | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Pending edit state (admin banner)
  type AdminPendingEdit = {
    id: string;
    payload: Record<string, unknown>;
    created_at: string;
  };
  const [adminPendingEdit, setAdminPendingEdit] =
    useState<AdminPendingEdit | null>(null);

  useEffect(() => {
    async function loadData() {
      if (!id) return;

      try {
        // Fetch property
        const propertyResponse = await fetch(`/api/admin/properties/${id}`);
        const propertyPayload = await propertyResponse.json();
        if (!propertyResponse.ok || !propertyPayload.property) {
          throw new Error(propertyPayload.error || "Property not found");
        }
        const propertyData = {
          ...propertyPayload.property,
          price: String(propertyPayload.property.price ?? 0),
          area: String(propertyPayload.property.area ?? ""),
        } as Property;
        setListing(propertyData);
        setSaleIntake(propertyPayload.property.saleIntake ?? null);

        // Fetch pending edit for banner
        const pendingRes = await fetch(`/api/properties/${id}/pending-edits`);
        if (pendingRes.ok) {
          const pendingJson = (await pendingRes.json()) as {
            pendingEdit: AdminPendingEdit | null;
          };
          setAdminPendingEdit(pendingJson.pendingEdit ?? null);
        }

        // Fetch transactions SECURELY via Server Action
        const transactionsData = await getSecureTransactions(
          id,
          propertyData?.payment_id,
          propertyData?.transaction_id,
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

  useEffect(() => {
    if (!saleIntake || saleIntake.status !== "unlinked" || !ownerSearch.trim()) {
      setOwnerResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setIsSearchingOwners(true);
      setOwnerLinkError(null);
      try {
        const token = await getToken();
        const response = await fetch(
          `/api/users/owners-agents?q=${encodeURIComponent(ownerSearch.trim())}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Recherche impossible");
        setOwnerResults(Array.isArray(payload.users) ? payload.users : []);
      } catch (error) {
        setOwnerLinkError(
          error instanceof Error ? error.message : "Recherche impossible",
        );
      } finally {
        setIsSearchingOwners(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [getToken, ownerSearch, saleIntake]);

  const linkOwner = async (owner: OwnerSearchResult) => {
    if (!saleIntake || isLinkingOwner) return;
    if (
      !window.confirm(
        `Rattacher définitivement cette annonce à ${owner.full_name || owner.email} ?`,
      )
    ) {
      return;
    }
    setIsLinkingOwner(true);
    setOwnerLinkError(null);
    try {
      const response = await fetch(`/api/admin/properties/${id}/owner`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: owner.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Rattachement impossible");
      window.location.reload();
    } catch (error) {
      setOwnerLinkError(
        error instanceof Error ? error.message : "Rattachement impossible",
      );
    } finally {
      setIsLinkingOwner(false);
    }
  };

  const handleDelete = async () => {
    if (!listing) return;
    setIsDeleting(true);
    const success = await deleteProperty(listing.id);
    setIsDeleting(false);
    if (success) {
      router.push("/admin/annonces");
    } else {
      alert("Erreur lors de la suppression du bien");
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!listing) return false;

    setIsUpdatingStatus(true);
    setStatusError(null);
    try {
      const result = await updatePropertyStatus(listing.id, newStatus);
      if (!result.success) {
        setStatusError({ message: result.error, code: result.code });
        return false;
      }

      setListing((current) =>
        current ? { ...current, status: newStatus } : current,
      );
      return true;
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const initiateStatusChange = (newStatus: string) => {
    if (newStatus === listing?.status) return;
    setPendingStatus(newStatus);
    setStatusError(null);
    setIsStatusDropdownOpen(false);
    setStatusModalOpen(true);
  };

  const closeStatusModal = () => {
    if (isUpdatingStatus) return;
    setStatusModalOpen(false);
    setPendingStatus(null);
    setStatusError(null);
  };

  const confirmStatusChange = async () => {
    if (pendingStatus && !isUpdatingStatus) {
      const success = await handleStatusChange(pendingStatus);
      if (!success) return;
      setStatusModalOpen(false);
      setPendingStatus(null);
      setStatusError(null);
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
      <div className="pt-40 pb-12">
        <PropertyDetailSkeleton />
      </div>
    );

  if (!listing)
    return (
      <div className="text-center pt-40 pb-32">
        <h2 className="text-2xl font-bold text-neutral-900">Bien non trouvé</h2>
        <Button onClick={() => router.back()} className="mt-4">
          Retour
        </Button>
      </div>
    );

  const isDailyListing = isDailyRental(listing);
  const dailyConditionRows = getDailyConditionRows(listing);

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 pt-40 pb-12 space-y-10 relative">
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
                onClick={closeStatusModal}
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

                  {statusError && (
                    <div
                      role="alert"
                      className="w-full rounded-xl border border-red-200 bg-red-50 p-3 text-left text-sm text-red-700"
                    >
                      <p>{statusError.message}</p>
                      {statusError.code === "sale_mandate_required" && (
                        <Link
                          href="/admin/sale-chat"
                          className="mt-2 inline-flex font-semibold text-[#A84F1C] underline underline-offset-2"
                        >
                          Ouvrir les conversations ventes
                        </Link>
                      )}
                    </div>
                  )}

                  <div className="flex gap-3 w-full mt-6">
                    <Button
                      variant="ghost"
                      onClick={closeStatusModal}
                      disabled={isUpdatingStatus}
                      className="flex-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Annuler
                    </Button>
                    <Button
                      onClick={confirmStatusChange}
                      disabled={isUpdatingStatus}
                      aria-busy={isUpdatingStatus}
                      className="flex-1 bg-primary text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isUpdatingStatus ? "Mise à jour…" : "Confirmer"}
                    </Button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </Portal>

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
                className="bg-white rounded-2xl p-8 w-full max-w-2xl shadow-xl relative z-10 overflow-hidden max-h-[90vh] flex flex-col"
              >
                <div className="flex flex-col space-y-6 overflow-hidden">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-500">
                      <InfoIcon size={32} weight="fill" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-neutral-900">
                        Confirmer les modifications
                      </h3>
                      <p className="text-neutral-500 text-sm">
                        Veuillez vérifier les changements avant de valider.
                      </p>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                    <div className="grid grid-cols-1 gap-3">
                      {getChangedFields().map((change) => (
                        <div
                          key={change.field}
                          className="bg-neutral-50 rounded-xl p-4 border border-neutral-100"
                        >
                          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2">
                            {change.label}
                          </p>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 text-sm text-neutral-500 line-through truncate">
                              {formatChangeValue(change.old)}
                            </div>
                            <div className="text-neutral-300">→</div>
                            <div className="flex-1 text-sm font-bold text-primary truncate">
                              {formatChangeValue(change.new)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-3 w-full pt-4 border-t border-neutral-100 mt-auto">
                    <Button
                      variant="ghost"
                      onClick={() => setConfirmEditModalOpen(false)}
                      className="flex-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700"
                      disabled={isSaving}
                    >
                      Annuler
                    </Button>
                    <Button
                      onClick={confirmSave}
                      className="flex-1 bg-primary text-white hover:bg-primary/90"
                      disabled={isSaving}
                    >
                      {isSaving ? "Enregistrement..." : "Confirmer"}
                    </Button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </Portal>

      <Portal>
        <AnimatePresence>
          {deleteModalOpen && (
            <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={() => setDeleteModalOpen(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl relative z-10 overflow-hidden"
              >
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-500 mb-2">
                    <WarningCircleIcon size={32} weight="fill" />
                  </div>
                  <h3 className="text-xl font-bold text-neutral-900">
                    Supprimer le bien
                  </h3>
                  <p className="text-neutral-500 text-sm">
                    Êtes-vous sûr de vouloir supprimer définitivement <br />
                    <span className="font-bold text-neutral-900">
                      {listing.location}
                    </span>{" "}
                    ? Cette action est irréversible.
                  </p>

                  <div className="flex gap-3 w-full mt-6">
                    <Button
                      variant="ghost"
                      onClick={() => setDeleteModalOpen(false)}
                      className="flex-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700"
                      disabled={isDeleting}
                    >
                      Annuler
                    </Button>
                    <Button
                      onClick={handleDelete}
                      className="flex-1 bg-red-600 text-white hover:bg-red-700"
                      disabled={isDeleting}
                    >
                      {isDeleting ? "Suppression..." : "Supprimer"}
                    </Button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </Portal>
      {/* Pending edit banner (staff view) */}
      {adminPendingEdit && (
        <div className="bg-amber-50 border border-amber-200 rounded-[24px] p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-start gap-3 flex-1">
            <ClockIcon
              size={20}
              weight="fill"
              className="text-amber-500 mt-0.5 shrink-0"
            />
            <div>
              <p className="font-black text-amber-800 text-sm">
                Des modifications sont en attente de validation
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Champs modifiés :{" "}
                <span className="font-semibold">
                  {Object.keys(adminPendingEdit.payload)
                    .map(
                      (k) =>
                        ({
                          price: "Prix",
                          caution_mois: "Caution",
                          loyer_avance_mois: "Loyer avance",
                          city: "Ville",
                          quartier: "Quartier",
                          property_type: "Type",
                          bedrooms: "Chambres",
                          bathrooms: "SDB",
                          area: "Superficie",
                          parking_spaces: "Parking",
                          description: "Description",
                          amenities: "Équipements",
                          dos_and_donts: "Règles",
                          interdictions: "Interdictions",
                        })[k] ?? k,
                    )
                    .join(", ")}
                </span>
              </p>
            </div>
          </div>
          <a
            href="/admin/modifications"
            className="shrink-0 text-xs font-black text-amber-700 bg-amber-100 hover:bg-amber-200 px-4 py-2 rounded-xl transition-colors"
          >
            Voir dans Modifications
          </a>
        </div>
      )}

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
          {isStaffOrFounder && (
            <>
              {listing.listingType === "louer" && !isDailyRental(listing) && (
                <Button
                  variant="ghost"
                  className="text-primary hover:bg-orange-50 text-xs font-bold uppercase tracking-wider"
                  onClick={() => setImportLeaseOpen(true)}
                >
                  Importer un bail
                </Button>
              )}
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
            </>
          )}
          <Button
            variant="ghost"
            className="text-red-600 hover:bg-red-50 text-xs font-bold uppercase tracking-wider"
            onClick={() => setDeleteModalOpen(true)}
          >
            Supprimer
          </Button>
          <div className="relative" ref={dropdownRef}>
            <Button
              onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
              className={cn(
                "min-w-[180px] justify-between gap-2 border shadow-sm h-11 px-6 rounded-xl font-bold text-xs uppercase tracking-wider transition-all",
                getStatusColor(listing.status),
              )}
            >
              {getStatusLabel(listing.status)}
              <CaretDownIcon
                size={16}
                className={cn(
                  "transition-transform",
                  isStatusDropdownOpen && "rotate-180",
                )}
              />
            </Button>

            <AnimatePresence>
              {isStatusDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-neutral-100 py-2 z-50 overflow-hidden"
                >
                  {[
                    {
                      id: "en_attente",
                      label: "En attente (Photo Pro)",
                      color: "text-yellow-600",
                    },
                    {
                      id: "en_ligne",
                      label: "En ligne (Publiée)",
                      color: "text-green-600",
                    },
                    {
                      id: "expired",
                      label: "Expirée (Louée/Vendue)",
                      color: "text-neutral-500",
                    },
                  ].map((status) => (
                    <button
                      key={status.id}
                      onClick={() => initiateStatusChange(status.id)}
                      className={cn(
                        "w-full px-4 py-3 text-left text-xs font-bold uppercase tracking-wider hover:bg-neutral-50 transition-colors flex items-center justify-between",
                        status.color,
                        listing.status === status.id && "bg-neutral-50",
                      )}
                    >
                      {status.label}
                      {listing.status === status.id && (
                        <CheckCircleIcon size={16} weight="fill" />
                      )}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
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
              onPhotosUpdated={(isPro) => {
                if (isPro && listing.status !== "en_ligne") {
                  initiateStatusChange("en_ligne");
                }
              }}
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

            <div className="space-y-3 rounded-3xl border border-neutral-200 bg-neutral-50 p-5">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                Visite virtuelle
              </p>
              {isEditing ? (
                <div className="space-y-3">
                  <input
                    type="url"
                    value={String(editForm.virtualTourUrl ?? "")}
                    onChange={(e) =>
                      handleEditChange("virtualTourUrl", e.target.value)
                    }
                    placeholder="https://kuula.co/share/..."
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <div className="flex justify-between gap-3 text-xs">
                    <p className="font-medium text-neutral-500">
                      Collez le lien de partage Kuula, pas le script
                      d&apos;intégration.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleEditChange("virtualTourUrl", "")}
                      className="shrink-0 font-bold text-neutral-500 hover:text-neutral-900"
                    >
                      Effacer
                    </button>
                  </div>
                  {editError && (
                    <p className="text-sm font-semibold text-red-600">
                      {editError}
                    </p>
                  )}
                </div>
              ) : listing.virtualTourUrl ? (
                <a
                  href={listing.virtualTourUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-sm font-semibold text-primary hover:underline"
                >
                  {listing.virtualTourUrl}
                </a>
              ) : (
                <p className="text-sm font-medium text-neutral-500">
                  Aucune visite virtuelle ajoutée.
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
          </section>

          {saleIntake?.status === "unlinked" && (
            <section className="rounded-[32px] border border-amber-200 bg-amber-50 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="inline-flex rounded-full bg-amber-200 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-900">
                    Propriétaire à rattacher
                  </span>
                  <h3 className="mt-3 text-lg font-black text-neutral-950">
                    {saleIntake.owner_first_name} {saleIntake.owner_last_name}
                  </h3>
                  <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-neutral-700">
                    <PhoneIcon size={16} weight="bold" />
                    {saleIntake.owner_phone}
                    {saleIntake.phone_has_whatsapp && (
                      <WhatsappLogoIcon
                        size={18}
                        weight="fill"
                        className="text-green-600"
                      />
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <label className="text-xs font-black uppercase tracking-wider text-neutral-600">
                  Rattacher un propriétaire ou agent
                </label>
                <div className="mt-2 flex items-center gap-2 rounded-2xl border border-amber-200 bg-white px-4 py-3">
                  <MagnifyingGlassIcon size={18} className="text-neutral-400" />
                  <input
                    value={ownerSearch}
                    onChange={(event) => setOwnerSearch(event.target.value)}
                    placeholder="Nom, email, téléphone ou WhatsApp"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />
                  {isSearchingOwners && (
                    <span className="text-xs font-bold text-neutral-400">
                      Recherche…
                    </span>
                  )}
                </div>
                {ownerResults.length > 0 && (
                  <div className="mt-2 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                    {ownerResults.map((owner) => (
                      <button
                        key={owner.id}
                        type="button"
                        disabled={isLinkingOwner}
                        onClick={() => linkOwner(owner)}
                        className="flex w-full items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3 text-left last:border-0 hover:bg-neutral-50 disabled:opacity-50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-neutral-900">
                            {owner.full_name || owner.email}
                          </p>
                          <p className="truncate text-xs font-semibold text-neutral-500">
                            {[owner.email, owner.phone || owner.whatsapp]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <span className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-black uppercase text-neutral-600">
                          {owner.user_type}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {ownerLinkError && (
                  <p className="mt-2 text-xs font-bold text-red-600">
                    {ownerLinkError}
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Agent Card */}
          {saleIntake?.status !== "unlinked" && (
          <section className="bg-white overflow-hidden rounded-[32px] border border-neutral-100 shadow-sm">
            <div className="p-8 space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 overflow-hidden relative border-2 border-primary">
                  {listing.agent?.avatar_url ? (
                    <Image
                      src={listing.agent.avatar_url}
                      alt={listing.agent.full_name}
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xl font-bold text-primary">
                      {listing.agent?.full_name?.charAt(0)?.toUpperCase() ||
                        "?"}
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
          )}
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
            {transactions.length} Transaction
            {transactions.length > 1 ? "s" : ""}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {transactions.length > 0 ? (
            transactions.map((tx) => {
              const metadata = tx.metadata as TransactionMetadata;
              return (
                <div
                  key={tx.id}
                  className="bg-white rounded-[24px] p-6 border border-neutral-100 shadow-sm hover:shadow-md transition-all"
                >
                  <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                            tx.type === "listing_submission"
                              ? "bg-orange-50 text-orange-600"
                              : tx.type === "photography"
                                ? "bg-amber-50 text-amber-700"
                                : tx.type === "property_lock"
                                  ? "bg-green-50 text-green-700"
                                  : "bg-blue-50 text-blue-600",
                          )}
                        >
                          {tx.type === "listing_submission" ? (
                            <BuildingsIcon size={20} weight="fill" />
                          ) : tx.type === "photography" ? (
                            <CameraIcon size={20} weight="fill" />
                          ) : tx.type === "property_lock" ? (
                            <ReceiptIcon size={20} weight="fill" />
                          ) : (
                            <LightningIcon size={20} weight="fill" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-black text-neutral-900 leading-none capitalize">
                            {tx.type === "listing_submission"
                              ? "Publication"
                              : tx.type === "photography"
                                ? "Photographie"
                                : tx.type === "property_lock"
                                  ? "Paiement d'entrée"
                                  : "Boost"}
                          </p>
                          <p className="text-[9px] text-neutral-400 font-bold mt-1 uppercase tracking-wider">
                            ID: {tx.deposit_id.split("-")[0]}
                          </p>
                        </div>
                      </div>
                      <div
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wide",
                          tx.status === "completed"
                            ? "bg-green-50 text-green-700 border border-green-100"
                            : tx.status === "failed"
                              ? "bg-red-50 text-red-700 border border-red-100"
                              : "bg-orange-50 text-orange-700 border border-orange-100",
                        )}
                      >
                        {tx.status === "completed" ? (
                          <CheckCircleIcon size={12} weight="fill" />
                        ) : tx.status === "failed" ? (
                          <XCircleIcon size={12} weight="fill" />
                        ) : (
                          <ClockIcon size={12} weight="fill" />
                        )}
                        {tx.status === "completed"
                          ? "Réussi"
                          : tx.status === "failed"
                            ? "Échec"
                            : "Attente"}
                      </div>
                    </div>

                    <div className="w-full space-y-2 py-4 border-y border-neutral-50">
                      {metadata?.tier && (
                        <div className="flex items-center justify-between text-[10px] font-bold">
                          <span className="text-neutral-400 uppercase tracking-widest">
                            Publication ({metadata.tier.name})
                          </span>
                          <span className="text-neutral-900">
                            {metadata.tier.base_fee.toLocaleString()} F
                          </span>
                        </div>
                      )}
                      {metadata?.add_ons?.map((a, index) => {
                        const Icon = ADD_ON_ICONS[a.id] || InfoIcon;
                        const label = ADD_ON_LABELS[a.id] || a.name;
                        const addOnPrice =
                          typeof a.price === "number"
                            ? a.price
                            : Number(a.price ?? 0);
                        return (
                          <div
                            key={`${a.id}-${index}`}
                            className="flex items-center justify-between text-[10px] font-bold"
                          >
                            <div className="flex items-center gap-1.5 text-neutral-400 uppercase tracking-widest">
                              <Icon size={12} />
                              <span>{label}</span>
                            </div>
                            <span className="text-neutral-900">
                              {(Number.isFinite(addOnPrice)
                                ? addOnPrice
                                : 0
                              ).toLocaleString()}{" "}
                              F
                            </span>
                          </div>
                        );
                      })}
                      {/* === TESTING MODE: No commission === */}
                      {metadata?.commission && (
                        <div className="flex items-center justify-between text-[10px] font-bold">
                          <span className="text-neutral-400 uppercase tracking-widest">
                            Frais Service
                          </span>
                          <span className="text-neutral-900">
                            {metadata.commission.toLocaleString()} F
                          </span>
                        </div>
                      )}
                      {tx.type === "property_lock" && (
                        <>
                          <div className="flex items-center justify-between text-[10px] font-bold">
                            <span className="text-neutral-400 uppercase tracking-widest">
                              Caution ({metadata?.cautionMois ?? 0} mois)
                            </span>
                            <span className="text-neutral-900">
                              {Number(
                                metadata?.cautionAmount ?? 0,
                              ).toLocaleString()}{" "}
                              F
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] font-bold">
                            <span className="text-neutral-400 uppercase tracking-widest">
                              Loyer d&apos;avance (
                              {metadata?.loyerAvanceMois ?? 1} mois)
                            </span>
                            <span className="text-neutral-900">
                              {Number(
                                metadata?.advanceRentAmount ?? 0,
                              ).toLocaleString()}{" "}
                              F
                            </span>
                          </div>
                        </>
                      )}
                      {/* === PRODUCTION MODE: Include 5% commission === */}
                      {/* Uncomment below and comment the block above for official release */}
                      {/* 
                      {metadata?.commission && (
                        <div className="flex items-center justify-between text-[10px] font-bold">
                          <span className="text-neutral-400 uppercase tracking-widest">Frais Service</span>
                          <span className="text-neutral-900">{metadata.commission.toLocaleString()} F</span>
                        </div>
                      )}
                      */}
                    </div>

                    <div className="flex items-baseline justify-between pt-2">
                      <span className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">
                        Total Payé
                      </span>
                      <p className="text-2xl font-black text-neutral-900 tracking-tight">
                        {tx.amount.toLocaleString()}{" "}
                        <span className="text-[10px] text-neutral-400 font-bold uppercase">
                          FCFA
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <span className="text-[9px] font-bold text-neutral-300 uppercase tracking-widest">
                        {tx.provider} • {tx.payer_phone}
                      </span>
                      <p className="text-[9px] text-neutral-300 font-bold">
                        {new Date(tx.created_at).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
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
      <ImportExistingLeaseWizard
        open={importLeaseOpen}
        onClose={() => setImportLeaseOpen(false)}
        preselectedProperty={{ id }}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
