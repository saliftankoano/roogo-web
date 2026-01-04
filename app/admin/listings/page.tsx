"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { DotsThreeVertical, CaretDown, Check, MagnifyingGlass } from "@phosphor-icons/react";
import Link from "next/link";
import { Property, fetchProperties } from "@/lib/data";
import { PropertyCard } from "@/components/PropertyCard";
import { motion, AnimatePresence } from "framer-motion";

export default function AdminListingsPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  useEffect(() => {
    async function loadProperties() {
      const data = await fetchProperties();
      setProperties(data);
      setLoading(false);
    }
    loadProperties();
  }, []);

  const filteredListings = useMemo(() => {
    return properties.filter((listing) => {
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
  }, [properties, searchQuery, locationFilter, typeFilter, categoryFilter]);

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

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Customer Filter Section */}
      <div className="bg-white p-8 sm:p-10 rounded-[40px] border border-neutral-100 shadow-sm relative">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">
            Filtres des propriétés
          </h2>
          <button className="p-2.5 hover:bg-neutral-50 rounded-full transition-colors border border-neutral-100 shadow-sm">
            <DotsThreeVertical
              size={24}
              weight="bold"
              className="text-neutral-400"
            />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
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
                <MagnifyingGlass size={20} weight="bold" />
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
      </div>

      {/* Property Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-neutral-400 font-medium">Chargement des biens...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredListings.map((listing) => (
            <Link
              href={`/admin/listings/${listing.id}`}
              key={listing.id}
              className="block"
            >
              <PropertyCard property={listing} />
            </Link>
          ))}
        </div>
      )}

      {!loading && filteredListings.length === 0 && (
        <div className="flex flex-col items-center justify-center py-32 text-center bg-white rounded-[40px] border border-neutral-100 shadow-sm">
          <div className="w-20 h-20 bg-neutral-50 rounded-full flex items-center justify-center mb-6">
            <MagnifyingGlass size={40} className="text-neutral-300" />
          </div>
          <h3 className="text-xl font-bold text-neutral-900 mb-2">
            Aucun résultat trouvé
          </h3>
          <p className="text-neutral-500 max-w-sm mx-auto font-medium">
            Nous n&apos;avons trouvé aucune propriété correspondant à vos critères.
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
            <CaretDown size={20} weight="bold" />
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
                {value === "all" && <Check size={16} weight="bold" />}
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
                  {value === opt && <Check size={16} weight="bold" />}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
