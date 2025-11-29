"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Navbar } from "../../components/Navbar";
import { PropertyCard } from "../../components/PropertyCard";
import { properties } from "../../lib/data";
import { Button } from "../../components/ui/Button";
import { MagnifyingGlass, CaretDown } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";

type FilterState = {
  category: "all" | "Residential" | "Business";
  priceRange: [number, number];
  bedrooms: string;
  bathrooms: string;
  areaRange: [number, number];
};

export default function PropertiesPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>({
    category: "all",
    priceRange: [0, 5000000],
    bedrooms: "Tous",
    bathrooms: "Tous",
    areaRange: [0, 5000],
  });

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push("/sign-in");
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  const filteredProperties = properties.filter((property) => {
    if (filters.category !== "all" && property.category !== filters.category) {
      return false;
    }
    const price = parseInt(property.price);
    if (price < filters.priceRange[0] || price > filters.priceRange[1]) {
      return false;
    }
    if (filters.bedrooms !== "Tous") {
      const beds = parseInt(filters.bedrooms);
      if (beds === 4) {
        if (property.bedrooms < 4) return false;
      } else if (property.bedrooms !== beds) {
        return false;
      }
    }
    if (filters.bathrooms !== "Tous") {
      const baths = parseInt(filters.bathrooms);
      if (baths === 3) {
        if (property.bathrooms < 3) return false;
      } else if (property.bathrooms !== baths) {
        return false;
      }
    }
    const area = parseInt(property.area);
    if (area < filters.areaRange[0] || area > filters.areaRange[1]) {
      return false;
    }
    if (
      searchQuery &&
      !property.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !property.location.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Sticky Filter Bar - Adjusted top spacing for floating navbar compatibility */}
      <div className="sticky top-0 z-30 bg-white border-b border-neutral-200 shadow-sm pt-28 pb-3">
        <div className="max-w-[1920px] mx-auto px-4 md:px-8 flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-grow max-w-md">
            <input
              type="text"
              placeholder="Ville, quartier, adresse..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-4 pr-10 py-2.5 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white shadow-sm"
            />
            <MagnifyingGlass
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500"
              size={20}
            />
          </div>

          <div className="h-8 w-px bg-neutral-200 hidden sm:block mx-2"></div>

          {/* Pill Filters */}
          <div className="flex items-center gap-3 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
            {/* For Rent (Static for now as per user flow) */}
            <div className="relative group">
              <button className="flex items-center gap-2 px-4 py-2.5 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 text-sm font-medium text-neutral-700 whitespace-nowrap transition-colors shadow-sm">
                À Louer <CaretDown size={16} weight="bold" />
              </button>
            </div>

            {/* Price Filter */}
            <div className="relative group">
              <button className="flex items-center gap-2 px-4 py-2.5 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 text-sm font-medium text-neutral-700 whitespace-nowrap transition-colors shadow-sm">
                Prix <CaretDown size={16} weight="bold" />
              </button>
              {/* Dropdown could go here */}
            </div>

            {/* Beds & Baths Filter */}
            <div className="relative group">
              <button className="flex items-center gap-2 px-4 py-2.5 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 text-sm font-medium text-neutral-700 whitespace-nowrap transition-colors shadow-sm">
                Chambres / Douches <CaretDown size={16} weight="bold" />
              </button>

              {/* Simple dropdown implementation for demo purposes */}
              <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-neutral-200 p-4 hidden group-hover:block z-50">
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-neutral-500 mb-1">
                    Chambres
                  </label>
                  <select
                    value={filters.bedrooms}
                    onChange={(e) =>
                      setFilters({ ...filters, bedrooms: e.target.value })
                    }
                    className="w-full p-2 border border-neutral-300 rounded text-sm"
                  >
                    <option value="Tous">Tout</option>
                    <option value="1">1+</option>
                    <option value="2">2+</option>
                    <option value="3">3+</option>
                    <option value="4">4+</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 mb-1">
                    Douches
                  </label>
                  <select
                    value={filters.bathrooms}
                    onChange={(e) =>
                      setFilters({ ...filters, bathrooms: e.target.value })
                    }
                    className="w-full p-2 border border-neutral-300 rounded text-sm"
                  >
                    <option value="Tous">Tout</option>
                    <option value="1">1+</option>
                    <option value="2">2+</option>
                    <option value="3">3+</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Home Type Filter */}
            <div className="relative group">
              <button className="flex items-center gap-2 px-4 py-2.5 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 text-sm font-medium text-neutral-700 whitespace-nowrap transition-colors shadow-sm">
                Type de bien <CaretDown size={16} weight="bold" />
              </button>
              <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-neutral-200 p-2 hidden group-hover:block z-50">
                <div
                  className={`p-2 hover:bg-neutral-50 cursor-pointer rounded text-sm ${
                    filters.category === "all" ? "font-bold text-primary" : ""
                  }`}
                  onClick={() => setFilters({ ...filters, category: "all" })}
                >
                  Tous les types
                </div>
                <div
                  className={`p-2 hover:bg-neutral-50 cursor-pointer rounded text-sm ${
                    filters.category === "Residential"
                      ? "font-bold text-primary"
                      : ""
                  }`}
                  onClick={() =>
                    setFilters({ ...filters, category: "Residential" })
                  }
                >
                  Résidentiel
                </div>
                <div
                  className={`p-2 hover:bg-neutral-50 cursor-pointer rounded text-sm ${
                    filters.category === "Business"
                      ? "font-bold text-primary"
                      : ""
                  }`}
                  onClick={() =>
                    setFilters({ ...filters, category: "Business" })
                  }
                >
                  Commercial
                </div>
              </div>
            </div>

            <button className="px-4 py-2.5 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 text-sm font-medium text-neutral-700 whitespace-nowrap transition-colors shadow-sm">
              Plus
            </button>

            <Button
              variant="primary"
              size="md"
              className="ml-auto whitespace-nowrap shadow-sm"
            >
              Enregistrer la recherche
            </Button>
          </div>
        </div>
      </div>

      <main className="max-w-[1920px] mx-auto px-4 md:px-8 py-6 bg-neutral-50 min-h-[calc(100vh-140px)]">
        {/* Results Header */}
        <div className="flex justify-between items-end mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              Location immobilière à Ouagadougou
            </h1>
            <p className="text-neutral-500 text-sm mt-1">
              {filteredProperties.length} résultats
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-500 hidden sm:inline">
              Trier:
            </span>
            <select className="bg-transparent border-none text-sm font-medium text-neutral-900 focus:ring-0 cursor-pointer">
              <option>Pertinence</option>
              <option>Prix (Croissant)</option>
              <option>Prix (Décroissant)</option>
              <option>Le plus récent</option>
            </select>
          </div>
        </div>

        {/* Properties Grid - Full Width Zillow Style */}
        {filteredProperties.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredProperties.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-neutral-100 max-w-md">
              <MagnifyingGlass
                size={48}
                className="text-neutral-300 mx-auto mb-4"
              />
              <h3 className="text-lg font-semibold text-neutral-900 mb-2">
                Aucun résultat trouvé
              </h3>
              <p className="text-neutral-500 mb-6">
                Nous n'avons trouvé aucune propriété correspondant à vos
                critères. Essayez d'élargir votre recherche.
              </p>
              <Button
                variant="outline"
                onClick={() =>
                  setFilters({
                    category: "all",
                    priceRange: [0, 5000000],
                    bedrooms: "Tous",
                    bathrooms: "Tous",
                    areaRange: [0, 5000],
                  })
                }
              >
                Effacer tous les filtres
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
