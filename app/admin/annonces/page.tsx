"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { PropertyGridSkeleton } from "@/components/admin/skeletons";
import {
  DotsThreeVerticalIcon,
  CaretDownIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Property, fetchProperties } from "@/lib/data";
import { PropertyCard } from "@/components/PropertyCard";
import { motion, AnimatePresence } from "framer-motion";
import {
  ExpandableScreen,
  ExpandableScreenContent,
  ExpandableScreenTrigger,
} from "@/components/ui/expandable-screen";
import { useAuth, useUser } from "@clerk/nextjs";
import { PropertyFormModal } from "@/components/property-form/PropertyFormModal";
import {
  getPendingPhotos,
  type PendingPhoto,
  removePendingPhotos,
} from "@/lib/clientPendingPhotos";
import { uploadCompressedPropertyPhotos } from "@/lib/clientPropertyPhotoUpload";

export default function AdminListingsPage() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const searchParams = useSearchParams();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isFiltersVisible, setIsFiltersVisible] = useState(true);
  const finalizeOnceRef = useRef(false);

  useEffect(() => {
    const paymentSuccess = searchParams.get("payment_success");
    const queryDepositId = searchParams.get("depositId");
    const storedDepositId =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem("pendingPaymentDepositId")
        : null;
    const depositId = queryDepositId || storedDepositId;
    const finalizedKey = depositId ? `listingFinalized:${depositId}` : null;
    const finalizingKey = depositId ? `listingFinalizing:${depositId}` : null;

    if (!depositId || finalizeOnceRef.current) {
      return;
    }

    if (finalizedKey && window.sessionStorage.getItem(finalizedKey) === "1") {
      return;
    }

    if (finalizingKey && window.sessionStorage.getItem(finalizingKey) === "1") {
      return;
    }

    const pendingRaw = typeof window !== "undefined" ? window.sessionStorage.getItem("pendingAdminListing") : null;
    if (!pendingRaw) return;

    const finalizeFromAdminReturn = async () => {
      finalizeOnceRef.current = true;
      if (finalizingKey) window.sessionStorage.setItem(finalizingKey, "1");
      try {
        const token = await getToken();
        if (!token) throw new Error("No token for admin return finalization");

        if (paymentSuccess !== "true") {
          const statusResponse = await fetch("/api/payments/status", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ depositId }),
          });
          const statusPayload = await statusResponse.json();
          const paymentCompleted = statusPayload?.status === "COMPLETED";

          if (!statusResponse.ok || !paymentCompleted) {
            return;
          }
        }

        const pending = JSON.parse(pendingRaw) as {
          formData: Record<string, unknown>;
          selectedTier: string;
          selectedAddOns: string[];
          listingPaymentMode?: string;
          pendingPhotos?: PendingPhoto[];
          pendingPhotosOverflow?: boolean;
          pendingPhotosCount?: number;
          pendingPhotosStoredInDb?: boolean;
          onBehalfOfClient?: boolean;
          selectedOwnerId?: string | null;
          isTestListing?: boolean;
        };
        const frequence =
          pending.formData.frequence === "journalier"
            ? "journalier"
            : "mensuel";

        const response = await fetch("/api/properties", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            listingData: {
              ...pending.formData,
              prixMensuel: Number(pending.formData.prixMensuel),
              chambres: Number(pending.formData.chambres),
              sdb: Number(pending.formData.sdb),
              superficie:
                pending.formData.superficie === undefined ||
                pending.formData.superficie === null ||
                pending.formData.superficie === ""
                  ? undefined
                  : Number(pending.formData.superficie),
              vehicules: Number(pending.formData.vehicules),
              cautionMois: Number(pending.formData.cautionMois),
              loyerAvanceMois: Number(pending.formData.loyerAvanceMois ?? 1),
              frequence,
              cautionType:
                frequence === "journalier"
                  ? (pending.formData.cautionType ?? "aucune")
                  : undefined,
              cautionValeur:
                frequence === "journalier" &&
                pending.formData.cautionValeur !== undefined &&
                pending.formData.cautionValeur !== ""
                  ? Number(pending.formData.cautionValeur)
                  : undefined,
              sejour_minimum:
                frequence === "journalier"
                  ? Number(pending.formData.sejour_minimum ?? 1)
                  : undefined,
              capacite_max:
                frequence === "journalier"
                  ? Number(pending.formData.capacite_max ?? 2)
                  : undefined,
              dosAndDonts: Array.isArray(pending.formData.dosAndDonts)
                ? pending.formData.dosAndDonts
                    .filter((rule): rule is string => typeof rule === "string")
                    .map((rule) => rule.trim())
                    .filter(Boolean)
                    .slice(0, 20)
                : [],
              tier_id: pending.selectedTier,
              listing_payment_mode: "upfront_package",
              add_ons: pending.selectedAddOns,
              payment_id: depositId,
              on_behalf_of_client: !!pending.onBehalfOfClient,
              owner_id:
                pending.onBehalfOfClient && pending.selectedOwnerId
                  ? pending.selectedOwnerId
                  : undefined,
              is_test: pending.isTestListing === true,
            },
          }),
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result?.message || "Finalization from admin return failed");
        }

        const propertyId = typeof result?.propertyId === "string" ? result.propertyId : null;
        let pendingPhotos = Array.isArray(pending.pendingPhotos) ? pending.pendingPhotos : [];
        if (pendingPhotos.length === 0 && pending.pendingPhotosStoredInDb) {
          pendingPhotos = await getPendingPhotos(depositId);
        }

        window.sessionStorage.removeItem("pendingAdminListing");
        window.sessionStorage.removeItem("pendingPaymentDepositId");
        if (finalizedKey) window.sessionStorage.setItem(finalizedKey, "1");

        if (propertyId && pendingPhotos.length > 0) {
          try {
            await uploadCompressedPropertyPhotos({
              propertyId,
              token,
              photos: pendingPhotos,
            });
          } catch (photoUploadError) {
            console.error("Error uploading pending listing photos:", photoUploadError);
          } finally {
            await removePendingPhotos(depositId);
          }

        } else if (pending.pendingPhotosOverflow) {
        }

        const { properties: data } = await fetchProperties();
        setProperties(data);
      } catch {
      } finally {
        if (finalizingKey) window.sessionStorage.removeItem(finalizingKey);
      }
    };

    finalizeFromAdminReturn();
  }, [searchParams, getToken]);

  useEffect(() => {
    async function loadProperties() {
      const { properties: data } = await fetchProperties();
      setProperties(data);
      setLoading(false);
    }
    loadProperties();
  }, []);

  const filteredListings = useMemo(() => {
    return properties.filter((listing) => {
      const matchesSearch =
        (listing.location || listing.address || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        listing.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesLocation =
        locationFilter === "all" ||
        listing.city?.toLowerCase() === locationFilter.toLowerCase() ||
        listing.quartier?.toLowerCase() === locationFilter.toLowerCase();
      const matchesType =
        typeFilter === "all" ||
        listing.propertyType.toLowerCase() === typeFilter.toLowerCase();
      const matchesCategory =
        categoryFilter === "all" || listing.category === categoryFilter;

      return matchesSearch && matchesLocation && matchesType && matchesCategory;
    });
  }, [properties, searchQuery, locationFilter, typeFilter, categoryFilter]);

  const locations = useMemo(
    () =>
      Array.from(
        new Set(
          properties
            .map((p) => p.city)
            .filter((city): city is string => !!city),
        ),
      ),
    [properties],
  );
  const propertyTypes = useMemo(
    () =>
      Array.from(
        new Set(
          properties
            .map((p) => p.propertyType)
            .filter((type): type is string => !!type),
        ),
      ),
    [properties],
  );

  const userType =
    ((user?.publicMetadata?.userType ||
      user?.publicMetadata?.user_type) as string) || "staff";

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="bg-white p-8 sm:p-10 rounded-[40px] border border-neutral-100 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">
              Filtres des propriétés
            </h2>
            <button 
              onClick={() => setIsFiltersVisible(!isFiltersVisible)}
              className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest hover:text-primary transition-colors flex items-center gap-1.5"
            >
              {isFiltersVisible ? "Masquer" : "Afficher"}
              <motion.div
                animate={{ rotate: isFiltersVisible ? 0 : 180 }}
                transition={{ duration: 0.3 }}
              >
                <CaretDownIcon size={14} weight="bold" />
              </motion.div>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <ExpandableScreen
              layoutId="add-property-staff"
              contentRadius="32px"
            >
              <ExpandableScreenTrigger>
                <div className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-full font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95 cursor-pointer">
                  <PlusIcon size={20} weight="bold" />
                  <span>Nouveau Bien</span>
                </div>
              </ExpandableScreenTrigger>

              <ExpandableScreenContent
                className="bg-neutral-50"
                closeButtonClassName="text-neutral-400 hover:bg-neutral-200"
              >
                <PropertyFormModal userType={userType} />
              </ExpandableScreenContent>
            </ExpandableScreen>

            <button className="p-2.5 hover:bg-neutral-50 rounded-full transition-colors border border-neutral-100 shadow-sm">
              <DotsThreeVerticalIcon
                size={24}
                weight="bold"
                className="text-neutral-400"
              />
            </button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {isFiltersVisible && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 pt-2">
                <div className="space-y-3">
                  <label className="text-[13px] font-bold text-neutral-900 ml-4 uppercase tracking-wider opacity-60">
                    Mot-clé
                  </label>
                  <div className="relative group">
                    <input
                      type="text"
                      placeholder="Entrez un mot-clé..."
                      className="w-full pl-12 pr-6 py-4 bg-neutral-50/50 rounded-full border border-neutral-100 focus:bg-white focus:ring-4 focus:ring-primary/5 focus:border-primary/20 transition-all text-[15px] placeholder:text-neutral-300 font-medium"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-300 group-focus-within:text-primary transition-colors">
                      <MagnifyingGlassIcon size={20} weight="bold" />
                    </div>
                  </div>
                </div>

                <FilterSelect
                  label="Localisation"
                  value={locationFilter}
                  onChange={setLocationFilter}
                  options={locations}
                  placeholder="Toutes les zones"
                />

                <FilterSelect
                  label="Type de bien"
                  value={typeFilter}
                  onChange={setTypeFilter}
                  options={propertyTypes}
                  placeholder="Tous les types"
                />

                <FilterSelect
                  label="Catégorie"
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  options={["Residential", "Business"]}
                  placeholder="Toutes catégories"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {loading ? (
        <PropertyGridSkeleton />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredListings.map((listing) => (
            <Link
              href={`/admin/annonces/${listing.id}`}
              key={listing.id}
              className="block relative group"
            >
              <div className="absolute top-7 right-7 z-10">
                <span
                  className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm border backdrop-blur-sm ${
                    listing.status === "en_ligne"
                      ? "bg-green-100/90 text-green-800 border-green-200"
                      : listing.status === "locked"
                        ? "bg-primary/90 text-white border-primary/20"
                        : listing.status === "finalized"
                          ? "bg-neutral-900 text-white border-neutral-800"
                          : listing.status === "en_attente"
                            ? "bg-yellow-100 text-yellow-900 border-yellow-300"
                            : "bg-neutral-100/90 text-neutral-600 border-neutral-200"
                  }`}
                >
                  {listing.status === "en_ligne"
                    ? "En ligne"
                    : listing.status === "locked"
                      ? "Réservé"
                      : listing.status === "finalized"
                        ? "Loué"
                        : listing.status === "en_attente"
                          ? "En attente"
                          : listing.status === "expired"
                            ? "Expiré"
                            : listing.status}
                </span>
              </div>
              <PropertyCard property={listing} />
            </Link>
          ))}
        </div>
      )}

      {!loading && filteredListings.length === 0 && (
        <div className="flex flex-col items-center justify-center py-32 text-center bg-white rounded-[40px] border border-neutral-100 shadow-sm">
          <div className="w-20 h-20 bg-neutral-50 rounded-full flex items-center justify-center mb-6">
            <MagnifyingGlassIcon size={40} className="text-neutral-300" />
          </div>
          <h3 className="text-xl font-bold text-neutral-900 mb-2">
            Aucun résultat trouvé
          </h3>
          <p className="text-neutral-500 max-sm mx-auto font-medium">
            Nous n&apos;avons trouvé aucune propriété correspondant à vos
            critères.
          </p>
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedLabel = value === "all" ? placeholder : value;

  return (
    <div className="space-y-3" ref={dropdownRef}>
      <label className="text-[13px] font-bold text-neutral-900 ml-4 uppercase tracking-wider opacity-60">
        {label}
      </label>
      <div className="relative group">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between pl-6 pr-5 py-4 bg-neutral-50/50 rounded-full border transition-all text-[15px] font-bold text-left ${
            isOpen
              ? "bg-white ring-4 ring-primary/5 border-primary/20 text-primary"
              : "border-neutral-100 text-neutral-900 hover:border-neutral-200"
          }`}
        >
          <span className="truncate">{selectedLabel}</span>
          <div
            className={`transition-transform duration-300 ${
              isOpen ? "rotate-180 text-primary" : "text-neutral-300"
            }`}
          >
            <CaretDownIcon size={20} weight="bold" />
          </div>
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute top-full left-0 right-0 mt-3 bg-white rounded-[24px] p-2 shadow-2xl border border-neutral-100 z-50 max-h-[300px] overflow-y-auto"
            >
              <button
                onClick={() => {
                  onChange("all");
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                  value === "all"
                    ? "bg-primary/10 text-primary"
                    : "text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                {placeholder}
                {value === "all" && <CheckIcon size={16} weight="bold" />}
              </button>
              <div className="h-px bg-neutral-50 my-1 mx-2" />
              {options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => {
                    onChange(opt);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    value === opt
                      ? "bg-primary/10 text-primary"
                      : "text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  {opt}
                  {value === opt && <CheckIcon size={16} weight="bold" />}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
