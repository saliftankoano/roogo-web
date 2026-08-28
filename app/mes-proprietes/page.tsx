"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { PropertyCard } from "../../components/PropertyCard";
import { Property, fetchProperties } from "../../lib/data";
import { getPropertyPath } from "../../lib/property-url";
import { motion, AnimatePresence } from "framer-motion";
import {
  DotsThreeVerticalIcon,
  CaretDownIcon,
  MagnifyingGlassIcon,
  CheckIcon,
  PlusIcon,
  HouseIcon,
} from "@phosphor-icons/react";
import { PropertyFormModal } from "../../components/property-form/PropertyFormModal";
import {
  ExpandableScreen,
  ExpandableScreenContent,
  ExpandableScreenTrigger,
} from "../../components/ui/expandable-screen";
import { cn } from "../../lib/utils";

export default function MyPropertiesPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("Le plus récent");
  const [isSortOpen, setIsSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  // Options menu state
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [statusFilter, setStatusFilter] = useState("all");

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
    "Le plus récent",
    "Le plus ancien",
    "Prix (Croissant)",
    "Prix (Décroissant)",
  ];

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push("/connexion");
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    async function loadProperties() {
      if (!user) return;

      const { properties: data } = await fetchProperties();
      // Filter to only show user's properties
      const myProperties = data.filter((p) => p.owner_id === user.id);
      setProperties(myProperties);
      setLoading(false);
    }

    if (isLoaded && user) {
      loadProperties();
    }
  }, [isLoaded, user]);

  // Check user permissions
  const userType = (user?.publicMetadata?.userType ||
    user?.publicMetadata?.user_type) as string | undefined;
  const isAgentOrOwner = userType === "agent" || userType === "owner";

  // Redirect if not an agent or owner
  useEffect(() => {
    if (isLoaded && userType && !isAgentOrOwner) {
      router.push("/proprietes");
    }
  }, [isLoaded, userType, isAgentOrOwner, router]);

  const filteredProperties = useMemo(() => {
    const result = properties.filter((listing) => {
      const matchesSearch =
        (listing.location || listing.address || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        listing.description.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || listing.status === statusFilter;

      return matchesSearch && matchesStatus;
    });

    // Apply Sorting
    return result.sort((a, b) => {
      if (sortBy === "Prix (Croissant)") {
        return parseFloat(a.price) - parseFloat(b.price);
      }
      if (sortBy === "Prix (Décroissant)") {
        return parseFloat(b.price) - parseFloat(a.price);
      }
      if (sortBy === "Le plus ancien") {
        return (
          new Date(a.created_at || 0).getTime() -
          new Date(b.created_at || 0).getTime()
        );
      }
      // "Le plus récent" (default)
      return (
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime()
      );
    });
  }, [properties, searchQuery, statusFilter, sortBy]);

  // Get property route - the public slug URL shows the unified detail page
  const getPropertyRoute = (property: Property) => {
    return getPropertyPath(property);
  };

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  if (!isAgentOrOwner) {
    return null;
  }

  return (
    <div className="min-h-screen bg-neutral-50/30">
      <main className="max-w-7xl mx-auto px-6 pt-40 pb-20 space-y-8">
        {/* Results Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">
              Mes propriétés
            </h1>
            <p className="text-neutral-500 font-medium mt-1">
              Gérez vos {filteredProperties.length} bien
              {filteredProperties.length !== 1 ? "s" : ""}
            </p>
            <Link
              href="/tutoriels/comment-mettre-bien-en-vente-roogo"
              className="mt-3 inline-flex text-sm font-bold text-primary hover:text-primary-hover hover:underline"
            >
              Comment mettre un bien en vente sur Roogo ?
            </Link>
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

        {/* Filter Section */}
        <div className="bg-white p-8 sm:p-10 rounded-[40px] border border-neutral-100 shadow-sm relative transition-all">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">
              Filtres
            </h2>
            <div className="flex items-center gap-3">
              <ExpandableScreen
                layoutId="add-property-mes-proprietes"
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
                  <PropertyFormModal userType={userType || "owner"} />
                </ExpandableScreenContent>
              </ExpandableScreen>

              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className={cn(
                    "p-2.5 rounded-full transition-all border shadow-sm",
                    isMenuOpen
                      ? "bg-neutral-100 border-neutral-200 text-primary"
                      : "hover:bg-neutral-50 border-neutral-100 text-neutral-400",
                  )}
                >
                  <DotsThreeVerticalIcon size={24} weight="bold" />
                </button>

                <AnimatePresence>
                  {isMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute top-full right-0 mt-3 w-64 bg-white rounded-[24px] p-2 shadow-2xl border border-neutral-100 z-50"
                    >
                      <button
                        onClick={() => {
                          setSearchQuery("");
                          setStatusFilter("all");
                          setIsMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-neutral-600 hover:bg-neutral-50 transition-all"
                      >
                        <div className="w-[18px] h-[18px] border-2 border-neutral-300 rounded-md" />
                        Réinitialiser les filtres
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Keyword Filter */}
            <div className="space-y-3">
              <label className="text-[13px] font-bold text-neutral-900 ml-4 uppercase tracking-wider opacity-60">
                Recherche
              </label>
              <div className="relative group">
                <input
                  type="text"
                  placeholder="Rechercher dans mes biens..."
                  className="w-full pl-12 pr-6 py-4 bg-neutral-50/50 rounded-full border border-neutral-100 focus:bg-white focus:ring-4 focus:ring-primary/5 focus:border-primary/20 transition-all text-[15px] placeholder:text-neutral-300 font-medium"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-300 group-focus-within:text-primary transition-colors">
                  <MagnifyingGlassIcon size={20} weight="bold" />
                </div>
              </div>
            </div>

            {/* Status Filter */}
            <FilterSelect
              label="Statut"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "en_ligne", label: "En ligne" },
                { value: "en_attente", label: "En attente" },
                { value: "locked", label: "Réservé" },
                { value: "finalized", label: "Loué" },
                { value: "expired", label: "Expiré" },
              ]}
              placeholder="Tous les statuts"
            />
          </div>
        </div>

        {/* Properties Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <p className="text-neutral-400 font-medium">
              Chargement de vos biens...
            </p>
          </div>
        ) : filteredProperties.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredProperties.map((property) => {
              const route = getPropertyRoute(property);

              return (
                <Link
                  key={property.id}
                  href={route}
                  className="block relative group"
                >
                  <PropertyCard property={property} showStatus={true} />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-32 text-center bg-white rounded-[40px] border border-neutral-100 shadow-sm">
            <div className="w-20 h-20 bg-neutral-50 rounded-full flex items-center justify-center mb-6">
              <HouseIcon size={40} className="text-neutral-300" />
            </div>
            <h3 className="text-xl font-bold text-neutral-900 mb-2">
              Aucune propriété
            </h3>
            <p className="text-neutral-500 max-w-sm mx-auto font-medium mb-8">
              {properties.length === 0
                ? "Vous n'avez pas encore ajouté de propriété. Commencez dès maintenant !"
                : "Aucune propriété ne correspond à vos critères de recherche."}
            </p>
            {properties.length === 0 && (
              <ExpandableScreen
                layoutId="add-property-empty"
                contentRadius="32px"
              >
                <ExpandableScreenTrigger>
                  <button className="px-8 py-3 bg-neutral-900 text-white rounded-full font-bold hover:bg-neutral-800 transition-all">
                    Ajouter mon premier bien
                  </button>
                </ExpandableScreenTrigger>
                <ExpandableScreenContent className="bg-neutral-50">
                  <PropertyFormModal userType={userType || "owner"} />
                </ExpandableScreenContent>
              </ExpandableScreen>
            )}
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
  options: { value: string; label: string }[];
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

  const selectedLabel =
    value === "all"
      ? placeholder
      : options.find((opt) => opt.value === value)?.label || value;

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
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    value === opt.value
                      ? "bg-primary/10 text-primary"
                      : "text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  {opt.label}
                  {value === opt.value && <CheckIcon size={16} weight="bold" />}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
