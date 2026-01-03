"use client";

import { useState, useMemo } from "react";
import {
  MapPinIcon,
  TrendUpIcon,
  WarningCircleIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import Link from "next/link";

// Updated status types based on the new flow
type PropertyStatus =
  | "en_attente"
  | "en_ligne"
  | "closing"
  | "expired"
  | "rejected";

type PropertyListing = {
  id: string;
  titre: string;
  type: string;
  prixMensuel: number;
  quartier: string;
  ville: string;
  status: PropertyStatus;
  tier_id: "essentiel" | "standard" | "premium";
  slots_filled: number;
  slot_limit: number;
  photos_are_professional: boolean;
  owner: {
    name: string;
    phone: string;
  };
  submittedAt: string;
};

const mockListings: PropertyListing[] = [
  {
    id: "1",
    titre: "Villa Moderne Zone A",
    type: "Villa",
    prixMensuel: 450000,
    quartier: "Ouaga 2000",
    ville: "Ouagadougou",
    status: "en_attente",
    tier_id: "standard",
    slots_filled: 0,
    slot_limit: 50,
    photos_are_professional: false,
    owner: { name: "Jean Ouedraogo", phone: "+226 70 11 22 33" },
    submittedAt: "2023-12-25T10:00:00Z",
  },
  {
    id: "2",
    titre: "Appartement Centre Ville",
    type: "Appartement",
    prixMensuel: 200000,
    quartier: "Koulouba",
    ville: "Ouagadougou",
    status: "en_ligne",
    tier_id: "essentiel",
    slots_filled: 18,
    slot_limit: 25,
    photos_are_professional: true,
    owner: { name: "Aminata Diallo", phone: "+226 76 55 44 33" },
    submittedAt: "2023-12-20T14:30:00Z",
  },
  {
    id: "3",
    titre: "Duplex Haut Standing",
    type: "Villa",
    prixMensuel: 800000,
    quartier: "Ouaga 2000",
    ville: "Ouagadougou",
    status: "closing",
    tier_id: "premium",
    slots_filled: 98,
    slot_limit: 100,
    photos_are_professional: true,
    owner: { name: "Moussa Koné", phone: "+226 78 99 00 11" },
    submittedAt: "2023-12-15T09:15:00Z",
  },
];

const getStatusClasses = (status: PropertyStatus) => {
  switch (status) {
    case "en_attente":
      return "bg-yellow-50 text-yellow-700 border-yellow-200";
    case "en_ligne":
      return "bg-green-50 text-green-700 border-green-200";
    case "closing":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "expired":
      return "bg-neutral-50 text-neutral-700 border-neutral-200";
    case "rejected":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "";
  }
};

const getStatusLabel = (status: PropertyStatus) => {
  switch (status) {
    case "en_attente":
      return "Photo Pro Requise";
    case "en_ligne":
      return "En Ligne";
    case "closing":
      return "Fermeture Bientôt";
    case "expired":
      return "Expirée";
    case "rejected":
      return "Rejetée";
    default:
      return status;
  }
};

export default function AdminListingsPage() {
  const [filterStatus, setFilterStatus] = useState<PropertyStatus | "all">(
    "en_attente"
  );
  const [searchQuery, setSearchQuery] = useState("");

  const stats = useMemo(
    () => ({
      total: mockListings.length,
      pending: mockListings.filter((l) => l.status === "en_attente").length,
      active: mockListings.filter(
        (l) => l.status === "en_ligne" || l.status === "closing"
      ).length,
      expired: mockListings.filter((l) => l.status === "expired").length,
    }),
    []
  );

  const filteredListings = useMemo(() => {
    return mockListings.filter((listing) => {
      const matchesStatus =
        filterStatus === "all" || listing.status === filterStatus;
      const matchesSearch =
        listing.titre.toLowerCase().includes(searchQuery.toLowerCase()) ||
        listing.owner.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [filterStatus, searchQuery]);

  return (
    <div className="space-y-8 h-[calc(100vh-120px)] flex flex-col">
      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <StatsCard
          title="Total Annonces"
          value={stats.total}
          icon={TrendUpIcon}
          colorClass="text-blue-600"
          bgClass="bg-blue-50"
        />
        <StatsCard
          title="En Attente Photos"
          value={stats.pending}
          icon={WarningCircleIcon}
          colorClass="text-yellow-600"
          bgClass="bg-yellow-50"
        />
        <StatsCard
          title="Actives"
          value={stats.active}
          icon={CheckCircleIcon}
          colorClass="text-green-600"
          bgClass="bg-green-50"
        />
        <StatsCard
          title="Expirées"
          value={stats.expired}
          icon={XCircleIcon}
          colorClass="text-neutral-600"
          bgClass="bg-neutral-50"
        />
      </div>

      {/* Filters & Actions */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-2xl border border-neutral-100 shadow-sm shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto">
          <FilterButton
            active={filterStatus === "all"}
            onClick={() => setFilterStatus("all")}
            label="Tous"
          />
          <FilterButton
            active={filterStatus === "en_attente"}
            onClick={() => setFilterStatus("en_attente")}
            label="Attente Photos"
          />
          <FilterButton
            active={filterStatus === "en_ligne"}
            onClick={() => setFilterStatus("en_ligne")}
            label="En Ligne"
          />
          <FilterButton
            active={filterStatus === "closing"}
            onClick={() => setFilterStatus("closing")}
            label="Closing"
          />
        </div>
        <div className="relative w-full md:w-64">
          <input
            type="text"
            placeholder="Rechercher..."
            className="w-full pl-4 pr-10 py-2 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-grow overflow-y-auto pb-20 px-1">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredListings.map((listing) => (
            <Link
              href={`/admin/listings/${listing.id}`}
              key={listing.id}
              className="group"
            >
              <div className="bg-white p-5 rounded-2xl border border-neutral-200 hover:border-primary/50 hover:shadow-xl hover:shadow-black/5 transition-all h-full flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <div
                    className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-full border ${getStatusClasses(
                      listing.status
                    )}`}
                  >
                    {getStatusLabel(listing.status)}
                  </div>
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                    Pack {listing.tier_id}
                  </span>
                </div>

                <h3 className="font-bold text-neutral-900 mb-1 group-hover:text-primary transition-colors line-clamp-1">
                  {listing.titre}
                </h3>

                <div className="flex items-center gap-1.5 text-xs text-neutral-500 mb-4">
                  <MapPinIcon size={14} />
                  {listing.quartier}, {listing.ville}
                </div>

                {/* Progress Bar */}
                <div className="space-y-2 mb-6 mt-auto">
                  <div className="flex justify-between text-[10px] font-bold text-neutral-500">
                    <span>SLOTS REMPLIS</span>
                    <span>
                      {listing.slots_filled}/{listing.slot_limit}
                    </span>
                  </div>
                  <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        listing.status === "closing"
                          ? "bg-orange-500"
                          : "bg-primary"
                      }`}
                      style={{
                        width: `${
                          (listing.slots_filled / listing.slot_limit) * 100
                        }%`,
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-neutral-50">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-[10px] font-bold text-neutral-500 border border-neutral-200">
                      {listing.owner.name.charAt(0)}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-neutral-900 leading-none mb-1">
                        {listing.owner.name}
                      </span>
                      <span className="text-[10px] text-neutral-400 leading-none">
                        {listing.owner.phone}
                      </span>
                    </div>
                  </div>
                  <span className="font-bold text-neutral-900 text-sm">
                    {listing.prixMensuel.toLocaleString()} F
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

interface StatsCardProps {
  title: string;
  value: number | string;
  icon: React.ElementType;
  colorClass: string;
  bgClass: string;
}

function StatsCard({
  title,
  value,
  icon: Icon,
  colorClass,
  bgClass,
}: StatsCardProps) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-neutral-100 shadow-sm flex items-center gap-4">
      <div
        className={`w-12 h-12 rounded-xl flex items-center justify-center ${bgClass} ${colorClass}`}
      >
        <Icon size={24} weight="duotone" />
      </div>
      <div>
        <p className="text-xs text-neutral-400 font-bold uppercase tracking-wider">
          {title}
        </p>
        <p className="text-2xl font-bold text-neutral-900 leading-none mt-1">
          {value}
        </p>
      </div>
    </div>
  );
}

interface FilterButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
}

function FilterButton({ active, onClick, label }: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap border ${
        active
          ? "bg-neutral-900 text-white border-neutral-900"
          : "bg-neutral-50 text-neutral-500 border-neutral-100 hover:bg-neutral-100"
      }`}
    >
      {label}
    </button>
  );
}
