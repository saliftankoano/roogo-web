"use client";

import { useState, useMemo, useEffect } from "react";
import { DotsThreeVertical, CaretDown } from "@phosphor-icons/react";
import Link from "next/link";
import { Property, fetchProperties } from "@/lib/data";
import { PropertyCard } from "@/components/PropertyCard";

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
      <div className="bg-white p-8 rounded-[40px] border border-neutral-100 shadow-sm relative">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-neutral-900">
            Customer Filter
          </h2>
          <button className="p-2 hover:bg-neutral-50 rounded-full transition-colors">
            <DotsThreeVertical
              size={24}
              weight="bold"
              className="text-neutral-400"
            />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-neutral-900">
              Enter Your Keyword...
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Enter Your Keyword..."
                className="w-full pl-4 pr-4 py-3 bg-neutral-50 rounded-[20px] border-none focus:ring-2 focus:ring-primary/20 transition-all text-sm placeholder:text-neutral-300"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <FilterSelect
            label="Select Location"
            value={locationFilter}
            onChange={setLocationFilter}
            options={locations}
            placeholder="Select Location"
          />

          <FilterSelect
            label="Property Type"
            value={typeFilter}
            onChange={setTypeFilter}
            options={propertyTypes}
            placeholder="Single Family Home"
          />

          <FilterSelect
            label="Select Category"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={["Residential", "Business"]}
            placeholder="Select Category"
          />
        </div>
      </div>

      {/* Property Grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
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
        <div className="text-center py-20">
          <p className="text-neutral-500">Aucune propriété trouvée.</p>
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
  return (
    <div className="space-y-2">
      <label className="text-sm font-bold text-neutral-900">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none pl-4 pr-10 py-3 bg-neutral-50 rounded-[20px] border-none focus:ring-2 focus:ring-primary/20 transition-all text-sm text-neutral-900"
        >
          <option value="all">{placeholder}</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400">
          <CaretDown size={16} weight="bold" />
        </div>
      </div>
    </div>
  );
}
