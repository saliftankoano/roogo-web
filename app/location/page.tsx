"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { PropertyCard } from "../../components/PropertyCard";
import { Property, fetchProperties } from "../../lib/data";
import { motion, AnimatePresence } from "framer-motion";
import {
  DotsThreeVerticalIcon,
  CaretDownIcon,
  MagnifyingGlassIcon,
  CheckIcon,
} from "@phosphor-icons/react";
import UserTypeSelectionModal from "../../components/UserTypeSelectionModal";
import PropertyDetailsModal from "../../components/PropertyDetailsModal";

export default function PropertiesPage() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("Pertinence");
  const [isSortOpen, setIsSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  // User type selection modal
  const [showUserTypeModal, setShowUserTypeModal] = useState(false);

  // Property details modal
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [showPropertyModal, setShowPropertyModal] = useState(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(event.target as Node)) {
        setIsSortOpen(false);
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

  // Initialize filters from landing page query string.
  // The hero search bar is "Où souhaitez-vous habiter ?" so we map `q` to the location filter.
  useEffect(() => {
    const q = (searchParams?.get("q") || "").trim();
    if (!q) return;

    setLocationFilter(q);
    setSearchQuery("");
  }, [searchParams]);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push("/sign-in");
    }
  }, [isLoaded, isSignedIn, router]);

  // Check if user needs to select user type
  useEffect(() => {
    if (isLoaded && isSignedIn && user) {
      const userType = user.publicMetadata?.userType;
      if (!userType) {
        setShowUserTypeModal(true);
      }
    }
  }, [isLoaded, isSignedIn, user]);

  useEffect(() => {
    async function loadProperties() {
      const { properties: data } = await fetchProperties();
      setProperties(data);
      setLoading(false);
    }
    loadProperties();
  }, []);

  const handleUserTypeSelect = async (
    userType: string,
    agentInfo?: { companyName: string; facebookUrl?: string }
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

  const handlePropertyClick = (property: Property) => {
    setSelectedProperty(property);
    setShowPropertyModal(true);
  };

  const handleClosePropertyModal = () => {
    setShowPropertyModal(false);
    setTimeout(() => setSelectedProperty(null), 300);
  };

  const filteredProperties = useMemo(() => {
    const result = properties.filter((listing) => {
      // Only show live properties
      const isLive = listing.status === "en_ligne";
      if (!isLive) return false;

      const matchesSearch =
        listing.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
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
    sortBy,
  ]);

  // Extract unique values for filters
  const locations = useMemo(
    () =>
      Array.from(
        new Set(
          properties.map((p) => p.city).filter((city): city is string => !!city)
        )
      ),
    [properties]
  );
  const propertyTypes = useMemo(
    () =>
      Array.from(
        new Set(
          properties
            .map((p) => p.propertyType)
            .filter((type): type is string => !!type)
        )
      ),
    [properties]
  );

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return (
    <div className="min-h-screen bg-neutral-50/30">
      {/* User Type Selection Modal */}
      <UserTypeSelectionModal
        isOpen={showUserTypeModal}
        onSelectUserType={handleUserTypeSelect}
      />

      {/* Property Details Modal */}
      <PropertyDetailsModal
        isOpen={showPropertyModal}
        onClose={handleClosePropertyModal}
        property={selectedProperty}
      />

      <main className="max-w-7xl mx-auto px-6 pt-40 pb-20 space-y-8">
        {/* Results Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">
              Location immobilière
            </h1>
            <p className="text-neutral-500 font-medium mt-1">
              Découvrez nos {filteredProperties.length} biens disponibles à
              Ouagadougou
            </p>
          </div>

          <div className="relative" ref={sortRef}>
            <button
              onClick={() => setIsSortOpen(!isSortOpen)}
              className="flex items-center gap-2 bg-white px-5 py-2.5 rounded-full border border-neutral-100 shadow-sm self-start md:self-auto hover:border-primary/20 transition-all group"
            >
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                Trier par:
              </span>
              <span className="text-sm font-bold text-neutral-900 group-hover:text-primary transition-colors">
                {sortBy}
              </span>
              <CaretDownIcon
                size={14}
                weight="bold"
                className={`text-neutral-300 transition-transform duration-300 ${
                  isSortOpen ? "rotate-180 text-primary" : ""
                }`}
              />
            </button>

            <AnimatePresence>
              {isSortOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-full right-0 mt-2 w-56 bg-white rounded-2xl p-2 shadow-2xl border border-neutral-100 z-50"
                >
                  {sortOptions.map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setSortBy(option);
                        setIsSortOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
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

        {/* Custom Styled Filter Section */}
        <div className="bg-white p-8 sm:p-10 rounded-[40px] border border-neutral-100 shadow-sm relative transition-all">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">
              Filtres de recherche
            </h2>
            <button className="p-2.5 hover:bg-neutral-50 rounded-full transition-colors border border-neutral-100 shadow-sm">
              <DotsThreeVerticalIcon
                size={24}
                weight="bold"
                className="text-neutral-400"
              />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Keyword Filter */}
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
              options={["Residential", "Business"]}
              placeholder="Toutes catégories"
            />
          </div>
        </div>

        {/* Properties Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <p className="text-neutral-400 font-medium">
              Chargement des biens...
            </p>
          </div>
        ) : filteredProperties.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredProperties.map((property) => (
              <PropertyCard
                key={property.id}
                property={property}
                onClick={() => handlePropertyClick(property)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-32 text-center bg-white rounded-[40px] border border-neutral-100 shadow-sm">
            <div className="w-20 h-20 bg-neutral-50 rounded-full flex items-center justify-center mb-6">
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
              className="mt-8 px-8 py-3 bg-neutral-900 text-white rounded-full font-bold text-sm hover:scale-105 transition-transform active:scale-95 shadow-lg shadow-black/10"
            >
              Réinitialiser les filtres
            </button>
          </div>
        )}
      </main>
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
