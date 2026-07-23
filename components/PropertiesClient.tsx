"use client";

import { useEffect, useState, useMemo, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { PropertyCard } from "./PropertyCard";
import { Footer } from "./Footer";
import { Property } from "../lib/data";
import { getPropertyPath } from "../lib/property-url";
import { motion, AnimatePresence } from "framer-motion";
import posthog from "posthog-js";
import {
  DotsThreeVerticalIcon,
  CaretDownIcon,
  MagnifyingGlassIcon,
  CheckIcon,
  PlusIcon,
  BuildingsIcon,
} from "@phosphor-icons/react";
import UserTypeSelectionModal from "./UserTypeSelectionModal";
import { PropertyFormModal } from "./property-form/PropertyFormModal";
import {
  ExpandableScreen,
  ExpandableScreenContent,
  ExpandableScreenTrigger,
} from "./ui/expandable-screen";
import { MarketingImage } from "./marketing/MarketingPrimitives";
import { marketingAssets } from "./marketing/assets";
import { cn } from "../lib/utils";

const CATEGORY_FILTER_OPTIONS = [
  { value: "all", label: "Tout" },
  { value: "Furnished", label: "Meublé" },
  { value: "Unfurnished", label: "Non meublé" },
  { value: "Business", label: "Commercial" },
];

const CATEGORY_FILTER_VALUES = CATEGORY_FILTER_OPTIONS.map(
  (option) => option.value,
);

const normalizeAmenity = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const isPropertyFurnished = (amenities: string[] = []) =>
  amenities.some((amenity) =>
    ["meuble", "furnished"].includes(normalizeAmenity(amenity)),
  );

function PropertiesPageContent({
  initialProperties,
}: {
  initialProperties: Property[];
}) {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user } = useUser();
  const searchParams = useSearchParams();
  const [properties, setProperties] = useState<Property[]>(initialProperties);
  const loading = false;
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("Pertinence");
  const [isSortOpen, setIsSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  // User type selection modal
  const [showUserTypeModal, setShowUserTypeModal] = useState(false);

  // Property details modal
  // Options menu state
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(event.target as Node)) {
        setIsSortOpen(false);
      }
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const sortOptions = [
    "Pertinence",
    "Prix (Croissant)",
    "Prix (Décroissant)",
    "Le plus récent",
  ];

  const [locationFilter, setLocationFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  // Primary intent: rentals by default, never mixing sale + rent inventory.
  const [listingTypeFilter, setListingTypeFilter] = useState<
    "louer" | "vendre"
  >("louer");

  // Initialize filters from landing page query string.
  useEffect(() => {
    const q = (searchParams?.get("q") || "").trim();
    if (!q) return;

    setLocationFilter(q);
    setSearchQuery("");
  }, [searchParams]);

  useEffect(() => {
    const category = (searchParams?.get("category") || "").trim();
    if (CATEGORY_FILTER_VALUES.includes(category)) {
      setCategoryFilter(category);
    }
  }, [searchParams]);

  useEffect(() => {
    const type = (searchParams?.get("type") || "").trim();
    if (type) {
      setTypeFilter(type);
    }
  }, [searchParams]);

  useEffect(() => {
    setProperties(initialProperties);
  }, [initialProperties]);

  // Check if user needs to select user type
  useEffect(() => {
    if (isLoaded && isSignedIn && user) {
      const userType =
        user.publicMetadata?.userType || user.publicMetadata?.user_type;
      if (!userType) {
        setShowUserTypeModal(true);
      }
    }
  }, [isLoaded, isSignedIn, user]);

  const handleUserTypeSelect = async (
    userType: string,
    agentInfo?: { companyName: string; facebookUrl?: string },
  ) => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error("No authentication token");
      }

      const body: Record<string, string> = { userType };
      if (agentInfo) {
        if (agentInfo.companyName) body.companyName = agentInfo.companyName;
        if (agentInfo.facebookUrl) body.facebookUrl = agentInfo.facebookUrl;
      }

      const response = await fetch("/api/clerk/users/me/metadata", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error("Failed to update user type");
      }

      // Reload user data to get updated metadata
      await user?.reload();
      setShowUserTypeModal(false);
    } catch (error) {
      console.error("Error updating user type:", error);
      throw error;
    }
  };

  // Check user permissions
  const userType = (user?.publicMetadata?.userType ||
    user?.publicMetadata?.user_type) as string | undefined;
  const canCreateProperty =
    userType === "agent" ||
    userType === "owner" ||
    userType === "staff" ||
    userType === "founder";
  const isStaffOrFounder = userType === "staff" || userType === "founder";
  const isAgentOrOwner = userType === "agent" || userType === "owner";
  const searchConsoleImage =
    marketingAssets.searchConsole ?? marketingAssets.heroHome;

  const filteredProperties = useMemo(() => {
    const result = properties.filter((listing) => {
      // For staff/founders: show all properties (including test ones)
      // For others: only show live, non-test properties
      const statusMatch = isStaffOrFounder
        ? true
        : listing.status === "en_ligne" && !listing.is_test;

      if (!statusMatch) return false;

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
        categoryFilter === "all" ||
        (categoryFilter === "Furnished"
          ? isPropertyFurnished(listing.amenities)
          : categoryFilter === "Unfurnished"
            ? !isPropertyFurnished(listing.amenities)
            : listing.category === categoryFilter);
      const matchesListingType =
        (listing.listingType ?? "louer") === listingTypeFilter;

      return (
        matchesSearch &&
        matchesLocation &&
        matchesType &&
        matchesCategory &&
        matchesListingType
      );
    });

    // Apply Sorting
    return result.sort((a, b) => {
      if (sortBy === "Prix (Croissant)") {
        return parseFloat(a.price) - parseFloat(b.price);
      }
      if (sortBy === "Prix (Décroissant)") {
        return parseFloat(b.price) - parseFloat(a.price);
      }
      if (sortBy === "Le plus récent") {
        return (
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime()
        );
      }
      // "Pertinence": Prioritize sponsored listings, then newest
      if (a.isSponsored !== b.isSponsored) {
        return a.isSponsored ? -1 : 1;
      }
      return (
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime()
      );
    });
  }, [
    properties,
    searchQuery,
    locationFilter,
    typeFilter,
    categoryFilter,
    listingTypeFilter,
    sortBy,
    isStaffOrFounder,
  ]);

  useEffect(() => {
    if (loading) {
      return;
    }

    posthog.capture("property_search_performed", {
      filters: {
        search_query: searchQuery || null,
        location: locationFilter,
        property_type: typeFilter,
        category: categoryFilter,
        sort_by: sortBy,
      },
      result_count: filteredProperties.length,
    });
  }, [
    searchQuery,
    locationFilter,
    typeFilter,
    categoryFilter,
    sortBy,
    loading,
    filteredProperties.length,
  ]);

  // Extract unique values for filters
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

  // Determine if user owns a property
  const isOwnerOfProperty = (property: Property) => {
    return property.owner_id === user?.id;
  };

  // One canonical URL per listing: staff get the admin view rendered at the
  // same public slug URL (see app/proprietes/[slug]).
  const getPropertyRoute = (property: Property) => {
    return getPropertyPath(property);
  };

  return (
    <div className="min-h-screen bg-[#f5efe6]">
      {/* User Type Selection Modal */}
      <UserTypeSelectionModal
        isOpen={showUserTypeModal}
        onSelectUserType={handleUserTypeSelect}
      />

      <main className="mx-auto max-w-7xl space-y-8 px-6 pb-20 pt-32 md:pt-40">
        {/* Results Header */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-[2rem] bg-[#17120f] p-6 text-white shadow-2xl shadow-black/10 md:p-10"
        >
          <MarketingImage
            src={searchConsoleImage.src}
            fallbackSrc={searchConsoleImage.fallback}
            alt="Recherche de propriétés Roogo"
            fill
            priority
            sizes="(max-width: 768px) 100vw, 1280px"
            className="object-cover opacity-30"
          />
          <div className="absolute inset-0 bg-[#17120f]/75" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(201,106,46,0.32),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.09),transparent_45%)]" />
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white/70">
                Console de recherche
              </div>
              <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight md:text-6xl">
                Trouvez un bien fiable, visible et prêt à visiter.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-white/70 md:text-lg">
                Filtrez les logements, studios, villas et espaces commerciaux
                disponibles à Ouagadougou sans perdre le fil de votre recherche.
              </p>
              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                {[
                  ["Biens", `${filteredProperties.length}`],
                  ["Ville", "Ouagadougou"],
                  ["Tri", sortBy],
                ].map(([label, value]) => (
                  <motion.div
                    key={label}
                    whileHover={{ y: -3, backgroundColor: "rgba(255,255,255,0.14)" }}
                    transition={{ duration: 0.25 }}
                    className="rounded-2xl border border-white/10 bg-white/10 p-4"
                  >
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/50">
                      {label}
                    </p>
                    <p className="mt-1 truncate text-lg font-black text-white">
                      {value}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="relative" ref={sortRef}>
              <motion.button
                onClick={() => setIsSortOpen(!isSortOpen)}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 self-start rounded-full border border-white/15 bg-white px-5 py-3 text-neutral-950 shadow-xl shadow-black/15 transition-all hover:bg-white/90 md:self-auto"
              >
                <span className="text-xs font-black uppercase tracking-wider text-neutral-400">
                  Trier par
                </span>
                <span className="text-sm font-black text-neutral-950">
                  {sortBy}
                </span>
                <CaretDownIcon
                  size={14}
                  weight="bold"
                  className={`text-neutral-400 transition-transform duration-300 ${
                    isSortOpen ? "rotate-180 text-primary" : ""
                  }`}
                />
              </motion.button>

              <AnimatePresence>
                {isSortOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 top-full z-50 mt-2 w-56 rounded-2xl border border-neutral-100 bg-white p-2 text-neutral-950 shadow-2xl"
                  >
                    {sortOptions.map((option) => (
                      <button
                        key={option}
                        onClick={() => {
                          setSortBy(option);
                          setIsSortOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
                          sortBy === option
                            ? "bg-primary/10 text-primary"
                            : "text-neutral-600 hover:bg-neutral-50"
                        }`}
                      >
                        {option}
                        {sortBy === option && (
                          <CheckIcon size={14} weight="bold" />
                        )}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.section>

        {/* Custom Styled Filter Section */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm transition-all hover:shadow-xl hover:shadow-[#5a321a]/10 sm:p-8 md:p-10"
        >
          <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-neutral-950">
                Filtres de recherche
              </h2>
              <p className="mt-2 max-w-xl text-sm font-medium leading-6 text-neutral-500">
                Gardez les critères importants visibles pendant que vous
                explorez les annonces.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {canCreateProperty && (
                <ExpandableScreen
                  layoutId="add-property-proprietes"
                  contentRadius="32px"
                >
                  <ExpandableScreenTrigger>
                    <motion.div
                      whileHover={{ y: -2, scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      className="flex cursor-pointer items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90"
                    >
                      <PlusIcon size={20} weight="bold" />
                      <span>Nouveau Bien</span>
                    </motion.div>
                  </ExpandableScreenTrigger>

                  <ExpandableScreenContent
                    className="bg-neutral-50"
                    closeButtonClassName="text-neutral-400 hover:bg-neutral-200"
                  >
                    <PropertyFormModal userType={userType || "owner"} />
                  </ExpandableScreenContent>
                </ExpandableScreen>
              )}

              <div className="relative" ref={menuRef}>
                <motion.button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.94 }}
                  className={cn(
                    "rounded-full border p-2.5 shadow-sm transition-all",
                    isMenuOpen
                      ? "bg-neutral-100 border-neutral-200 text-primary"
                      : "hover:bg-neutral-50 border-neutral-100 text-neutral-400",
                  )}
                >
                  <DotsThreeVerticalIcon size={24} weight="bold" />
                </motion.button>

                <AnimatePresence>
                  {isMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 top-full z-50 mt-3 w-64 rounded-3xl border border-neutral-100 bg-white p-2 shadow-2xl"
                    >
                      {isStaffOrFounder && (
                        <Link
                          href="/admin/annonces"
                          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-neutral-600 transition-all hover:bg-neutral-50 hover:text-primary"
                        >
                          <BuildingsIcon size={18} weight="bold" />
                          Gérer les annonces
                        </Link>
                      )}

                      <button
                        onClick={() => {
                          setSearchQuery("");
                          setLocationFilter("all");
                          setTypeFilter("all");
                          setCategoryFilter("all");
                          setIsMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-neutral-600 transition-all hover:bg-neutral-50"
                      >
                        <div className="h-[18px] w-[18px] rounded-md border-2 border-neutral-300" />
                        Réinitialiser les filtres
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Primary intent: Louer / Acheter — never mix sale & rent inventory */}
          <div className="mb-5 inline-flex rounded-full border border-neutral-100 bg-neutral-50 p-1">
            {(
              [
                { id: "louer", label: "Louer" },
                { id: "vendre", label: "Acheter" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                onClick={() => setListingTypeFilter(opt.id)}
                className={`rounded-full px-6 py-2 text-sm font-black transition-all ${
                  listingTypeFilter === opt.id
                    ? "bg-primary text-white"
                    : "text-neutral-500 hover:text-neutral-900"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
            {/* Keyword Filter */}
            <div className="space-y-3">
              <label className="ml-4 text-[13px] font-bold uppercase tracking-wider text-neutral-900 opacity-60">
                Mot-clé
              </label>
              <motion.div
                className="relative group"
                whileHover={{ y: -2 }}
                transition={{ duration: 0.2 }}
              >
                <input
                  type="text"
                  placeholder="Entrez un mot-clé..."
                  className="w-full rounded-full border border-neutral-100 bg-neutral-50/50 py-4 pl-12 pr-6 text-[15px] font-medium transition-all placeholder:text-neutral-300 focus:border-primary/20 focus:bg-white focus:ring-4 focus:ring-primary/5"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-300 transition-colors group-focus-within:text-primary">
                  <MagnifyingGlassIcon size={20} weight="bold" />
                </div>
              </motion.div>
            </div>

            {/* Location Filter */}
            <FilterSelect
              label="Localisation"
              value={locationFilter}
              onChange={setLocationFilter}
              options={locations}
              placeholder="Toutes les zones"
            />

            {/* Property Type Filter */}
            <FilterSelect
              label="Type de bien"
              value={typeFilter}
              onChange={setTypeFilter}
              options={propertyTypes}
              placeholder="Tous les types"
            />

            {/* Category Filter */}
            <FilterSelect
              label="Catégorie"
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={CATEGORY_FILTER_OPTIONS}
              placeholder="Toutes catégories"
            />
          </div>
        </motion.div>

        {/* Properties Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <p className="text-neutral-400 font-medium">
              Chargement des biens...
            </p>
          </div>
        ) : filteredProperties.length > 0 ? (
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProperties.map((property) => {
              const route = getPropertyRoute(property);
              const showStatus =
                isStaffOrFounder ||
                (isAgentOrOwner && isOwnerOfProperty(property));

              return (
                <motion.div
                  key={property.id}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -6 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Link href={route} className="block relative group">
                    <PropertyCard property={property} showStatus={showStatus} />
                  </Link>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-[2rem] border border-black/10 bg-white py-32 text-center shadow-sm">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-neutral-50">
              <MagnifyingGlassIcon size={40} className="text-neutral-300" />
            </div>
            <h3 className="text-xl font-bold text-neutral-900 mb-2">
              Aucun résultat trouvé
            </h3>
            <p className="text-neutral-500 max-w-sm mx-auto font-medium">
              Nous n&apos;avons trouvé aucune propriété correspondant à vos
              critères. Essayez d&apos;élargir votre recherche.
            </p>
            <button
              onClick={() => {
                setSearchQuery("");
                setLocationFilter("all");
                setTypeFilter("all");
                setCategoryFilter("all");
              }}
              className="mt-8 rounded-full bg-neutral-900 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-black/10 transition-transform hover:scale-105 active:scale-95"
            >
              Réinitialiser les filtres
            </button>
          </div>
        )}
      </main>

      <Footer />
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
  options: Array<string | { value: string; label: string }>;
  placeholder: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const normalizedOptions = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );

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

  const selectedLabel =
    value === "all"
      ? placeholder
      : normalizedOptions.find((option) => option.value === value)?.label ||
        value;

  return (
    <div className="space-y-3" ref={dropdownRef}>
      <label className="text-[13px] font-bold text-neutral-900 ml-4 uppercase tracking-wider opacity-60">
        {label}
      </label>
      <div className="relative group">
        <motion.button
          onClick={() => setIsOpen(!isOpen)}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
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
        </motion.button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute top-full left-0 right-0 mt-3 bg-white rounded-[24px] p-2 shadow-2xl border border-neutral-100 z-50 max-h-[300px] overflow-y-auto"
            >
              <motion.button
                onClick={() => {
                  onChange("all");
                  setIsOpen(false);
                }}
                whileHover={{ x: 3 }}
                whileTap={{ scale: 0.98 }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                  value === "all"
                    ? "bg-primary/10 text-primary"
                    : "text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                {placeholder}
                {value === "all" && <CheckIcon size={16} weight="bold" />}
              </motion.button>
              <div className="h-px bg-neutral-50 my-1 mx-2" />
              {normalizedOptions.map((opt) => (
                <motion.button
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  whileHover={{ x: 3 }}
                  whileTap={{ scale: 0.98 }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    value === opt.value
                      ? "bg-primary/10 text-primary"
                      : "text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  {opt.label}
                  {value === opt.value && <CheckIcon size={16} weight="bold" />}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function PropertiesClient({
  initialProperties,
}: {
  initialProperties: Property[];
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#f5efe6]">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary"></div>
        </div>
      }
    >
      <PropertiesPageContent initialProperties={initialProperties} />
    </Suspense>
  );
}
