"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Navbar } from "../../components/Navbar";
import { PropertyCard } from "../../components/PropertyCard";
import { properties } from "../../lib/data";
import { Button } from "../../components/ui/Button";
import { MagnifyingGlassIcon, CaretDownIcon } from "@phosphor-icons/react";

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

      <div className="sticky top-0 z-30 bg-white border-b border-neutral-200 shadow-sm pt-28 pb-3">
        <div className="max-w-[1920px] mx-auto px-4 md:px-8 flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-[200px]">
                <input
                  type="text"
              placeholder="Ville, quartier..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-3 pr-9 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white shadow-sm"
            />
            <MagnifyingGlassIcon
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500"
              size={16}
            />
          </div>

          <div className="h-6 w-px bg-neutral-200 hidden sm:block mx-1"></div>

          {/* Pill Filters - Adapted from Zillow */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* For Rent Filter */}
            <div className="relative group">
              <button className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 text-sm text-neutral-700 whitespace-nowrap transition-colors shadow-sm">
                À Louer <CaretDownIcon size={12} weight="bold" />
              </button>
              {/* Dropdown content would go here */}
            </div>

            {/* Price Filter */}
            <div className="relative group">
              <button className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 text-sm text-neutral-700 whitespace-nowrap transition-colors shadow-sm">
                Prix <CaretDownIcon size={12} weight="bold" />
              </button>
              {/* Simple dropdown implementation */}
              <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-lg shadow-xl border border-neutral-200 p-4 hidden group-hover:block z-50">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">
                      Min
                    </label>
                    <input
                      type="number"
                      placeholder="Min"
                      className="w-full p-2 border rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">
                      Max
                    </label>
                    <input
                      type="number"
                      placeholder="Max"
                      className="w-full p-2 border rounded text-sm"
                    />
                  </div>
                  <Button size="sm" fullWidth>
                    Appliquer
                  </Button>
                </div>
              </div>
            </div>

            {/* Beds & Baths Filter */}
            <div className="relative group">
              <button className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 text-sm text-neutral-700 whitespace-nowrap transition-colors shadow-sm">
                Chambres / Douches <CaretDownIcon size={12} weight="bold" />
              </button>

              <div className="absolute top-full left-0 mt-1 w-72 bg-white rounded-lg shadow-xl border border-neutral-200 p-4 hidden group-hover:block z-50">
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-neutral-500 mb-2">
                    Chambres
                  </label>
                  <div className="flex gap-1">
                    <button className="px-3 py-1 border rounded hover:bg-gray-50 text-xs">
                      Tout
                    </button>
                    <button className="px-3 py-1 border rounded hover:bg-gray-50 text-xs">
                      1+
                    </button>
                    <button className="px-3 py-1 border rounded hover:bg-gray-50 text-xs">
                      2+
                    </button>
                    <button className="px-3 py-1 border rounded hover:bg-gray-50 text-xs">
                      3+
                    </button>
                    <button className="px-3 py-1 border rounded hover:bg-gray-50 text-xs">
                      4+
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 mb-2">
                    Douches
                  </label>
                  <div className="flex gap-1">
                    <button className="px-3 py-1 border rounded hover:bg-gray-50 text-xs">
                      Tout
                    </button>
                    <button className="px-3 py-1 border rounded hover:bg-gray-50 text-xs">
                      1+
                    </button>
                    <button className="px-3 py-1 border rounded hover:bg-gray-50 text-xs">
                      2+
                    </button>
                    <button className="px-3 py-1 border rounded hover:bg-gray-50 text-xs">
                      3+
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Home Type Filter */}
            <div className="relative group">
              <button className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 text-sm text-neutral-700 whitespace-nowrap transition-colors shadow-sm">
                Type de bien <CaretDownIcon size={12} weight="bold" />
              </button>
              <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-xl border border-neutral-200 p-2 hidden group-hover:block z-50">
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

            {/* More Filters */}
            <div className="relative group">
              <button className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 text-sm text-neutral-700 whitespace-nowrap transition-colors shadow-sm">
                Plus <CaretDownIcon size={12} weight="bold" />
              </button>

              <div className="absolute top-full right-0 md:left-0 mt-1 w-80 bg-white rounded-lg shadow-xl border border-neutral-200 p-5 hidden group-hover:block z-50">
                <div className="space-y-6">
                  {/* Surface */}
                  <div>
                    <label className="block text-xs font-bold text-neutral-900 uppercase tracking-wider mb-3">
                      Superficie (m²)
                    </label>
                    <div className="flex gap-2 items-center">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          placeholder="Min"
                          className="w-full p-2.5 border border-neutral-300 rounded-md text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                        />
                      </div>
                      <span className="text-neutral-400">-</span>
                      <div className="relative flex-1">
                        <input
                          type="number"
                          placeholder="Max"
                          className="w-full p-2.5 border border-neutral-300 rounded-md text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Amenities */}
                  <div>
                    <label className="block text-xs font-bold text-neutral-900 uppercase tracking-wider mb-3">
                      Commodités
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        "Climatisation",
                        "Piscine",
                        "Jardin",
                        "Garage",
                        "Balcon",
                        "Meublé",
                      ].map((amenity) => (
                        <label
                          key={amenity}
                          className="flex items-center gap-2 text-sm text-neutral-600 cursor-pointer hover:text-neutral-900"
                        >
                        <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-neutral-300 text-primary focus:ring-primary/20"
                          />
                          {amenity}
                        </label>
                      ))}
                  </div>
                </div>

                  <div className="pt-2 border-t border-neutral-100">
                    <Button size="sm" fullWidth>
                      Appliquer
                  </Button>
                  </div>
                </div>
              </div>
            </div>
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
              <MagnifyingGlassIcon
                size={48}
                className="text-neutral-300 mx-auto mb-4"
              />
              <h3 className="text-lg font-semibold text-neutral-900 mb-2">
                Aucun résultat trouvé
              </h3>
              <p className="text-neutral-500 mb-6">
                Nous n&apos;avons trouvé aucune propriété correspondant à vos
                critères. Essayez d&apos;élargir votre recherche.
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
