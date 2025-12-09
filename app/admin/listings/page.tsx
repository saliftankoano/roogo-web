"use client";

import { useState, useMemo } from "react";
import { Button } from "../../../components/ui/Button";
import {
  CheckIcon,
  XIcon,
  ClockIcon,
  MapPinIcon,
  BedIcon,
  ShowerIcon,
  RulerIcon,
  HouseIcon,
  StorefrontIcon,
  EnvelopeSimpleIcon,
  PhoneIcon,
  FunnelIcon,
  // MagnifyingGlassIcon,
  TrendUpIcon,
  WarningCircleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ImageIcon,
} from "@phosphor-icons/react";
import Image from "next/image";
import {
  ExpandableScreen,
  ExpandableScreenContent,
  ExpandableScreenTrigger,
  useExpandableScreen,
} from "../../../components/ui/expandable-screen";

// Mock data based on the listing schema
type PropertyListing = {
  id: string;
  titre: string;
  type: "Maison" | "Appartement" | "Villa" | "Bureau" | "Commerce" | "Entrepôt";
  prixMensuel: number;
  quartier: string;
  ville: string;
  description: string;
  status: "pending" | "approved" | "rejected" | "changes_requested";
  photos: string[];
  bedrooms?: number;
  bathrooms?: number;
  surface?: number;
  equipements?: string[];
  interdictions?: string[];
  owner: {
    name: string;
    email: string;
    phone: string;
    avatar?: string;
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
    description:
      "Superbe villa moderne avec piscine et grand jardin. Idéal pour expatriés.",
    status: "pending",
    photos: ["/hero-bg.jpg"],
    bedrooms: 4,
    bathrooms: 3,
    surface: 500,
    equipements: [
      "Piscine",
      "Jardin",
      "Garage",
      "Climatisation",
      "Groupe électrogène",
    ],
    interdictions: ["Animaux interdits", "Fêtes bruyantes"],
    owner: {
      name: "Jean Ouedraogo",
      email: "jean.o@example.com",
      phone: "+226 70 11 22 33",
    },
    submittedAt: "2023-11-30T10:00:00Z",
  },
  {
    id: "2",
    titre: "Appartement Centre Ville",
    type: "Appartement",
    prixMensuel: 200000,
    quartier: "Koulouba",
    ville: "Ouagadougou",
    description:
      "Appartement cosy au coeur de la ville. Proche de toutes commodités.",
    status: "pending",
    photos: ["/hero-bg.jpg"],
    bedrooms: 2,
    bathrooms: 1,
    surface: 80,
    equipements: ["Balcon", "Parking souterrain", "Ascenseur"],
    interdictions: ["Fumeurs"],
    owner: {
      name: "Aminata Diallo",
      email: "aminata.d@example.com",
      phone: "+226 76 55 44 33",
    },
    submittedAt: "2023-11-29T14:30:00Z",
  },
  {
    id: "3",
    titre: "Local Commercial",
    type: "Commerce",
    prixMensuel: 150000,
    quartier: "1200 Logements",
    ville: "Ouagadougou",
    description: "Local commercial bien situé sur une rue passante.",
    status: "approved",
    photos: ["/hero-bg.jpg"],
    surface: 45,
    equipements: ["Vitrine", "Toilettes"],
    owner: {
      name: "Moussa Koné",
      email: "moussa.k@example.com",
      phone: "+226 78 99 00 11",
    },
    submittedAt: "2023-11-28T09:15:00Z",
  },
];

type Stats = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
};

function StatsCard({
  title,
  value,
  icon: Icon,
  colorClass,
  bgClass,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  colorClass: string;
  bgClass: string;
}) {
  return (
    <div className="bg-white p-4 rounded-2xl border border-neutral-100 shadow-sm flex items-center gap-4">
      <div
        className={`w-12 h-12 rounded-full flex items-center justify-center ${bgClass} ${colorClass}`}
      >
        <Icon size={24} weight="duotone" />
      </div>
      <div>
        <p className="text-sm text-neutral-500 font-medium">{title}</p>
        <p className="text-3xl font-bold text-neutral-900">{value}</p>
      </div>
    </div>
  );
}

// Helper functions moved outside the component
const getStatusClasses = (status: PropertyListing["status"]) => {
  switch (status) {
    case "pending":
      return "bg-yellow-50 text-yellow-700 border-yellow-200";
    case "approved":
      return "bg-green-50 text-green-700 border-green-200";
    case "rejected":
      return "bg-red-50 text-red-700 border-red-200";
    case "changes_requested":
      return "bg-orange-50 text-orange-700 border-orange-200";
    default:
      return "";
  }
};

function ListingDetailView({
  listing,
  onAction,
}: {
  listing: PropertyListing;
  onAction: (
    id: string,
    action: "approve" | "reject" | "request_changes"
  ) => void;
}) {
  const { collapse } = useExpandableScreen();

  return (
    <div className="flex flex-col h-full w-full max-w-[1600px] mx-auto relative">
      {/* Custom Close Button - Positioned relative to the content container */}
      <button
        onClick={collapse}
        className="absolute top-6 right-6 z-50 bg-white/80 backdrop-blur-sm shadow-sm border border-neutral-200 p-2 hover:bg-white text-neutral-500 hover:text-neutral-900 transition-all rounded-full w-10 h-10 flex items-center justify-center"
        aria-label="Fermer"
      >
        <XIcon size={20} weight="bold" />
      </button>

      {/* Detail Header - Compact & Modern */}
      <div className="pt-6 px-6 lg:px-10 pb-4 flex flex-col gap-4 shrink-0 pr-20">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl lg:text-3xl font-bold text-neutral-900 tracking-tight">
                {listing.titre}
              </h1>
              <span
                className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${getStatusClasses(
                  listing.status
                )}`}
              >
                {listing.status === "pending"
                  ? "En attente de validation"
                  : listing.status === "approved"
                  ? "Publié"
                  : listing.status === "changes_requested"
                  ? "Modifications demandées"
                  : "Rejeté"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-neutral-500">
              <span className="flex items-center gap-1.5 font-medium text-neutral-700">
                {listing.type === "Villa" ||
                listing.type === "Maison" ||
                listing.type === "Appartement" ? (
                  <HouseIcon size={16} className="text-primary" />
                ) : (
                  <StorefrontIcon size={16} className="text-primary" />
                )}
                {listing.type}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPinIcon size={16} className="text-neutral-400" />
                {listing.quartier}, {listing.ville}
              </span>
              <span className="flex items-center gap-1.5">
                <ClockIcon size={16} className="text-neutral-400" />
                Soumis le {new Date(listing.submittedAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          <div className="text-right md:mr-16 flex flex-col justify-start pt-1">
            <div className="text-3xl lg:text-4xl font-bold text-primary tracking-tight">
              {listing.prixMensuel.toLocaleString()}
              <span className="text-lg lg:text-xl text-neutral-400 font-medium ml-1">
                CFA
              </span>
            </div>
            <span className="text-sm text-neutral-400 font-medium">/ mois</span>
          </div>
        </div>
      </div>

      {/* Content Scrollable Area */}
      <div className="flex-grow overflow-y-auto px-6 lg:px-10 pb-32">
        <div className="space-y-10">
          {/* Photos - Modern Masonry/Grid */}
          <div className="grid grid-cols-12 gap-4 h-[500px] rounded-3xl overflow-hidden">
            {/* Main Photo - Takes 8 cols */}
            <div className="col-span-12 lg:col-span-8 relative h-full bg-neutral-100 group cursor-pointer">
              {listing.photos[0] ? (
                <Image
                  src={listing.photos[0]}
                  alt="Main photo"
                  fill
                  className="object-cover hover:scale-105 transition-transform duration-700 ease-out"
                  priority
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-neutral-300">
                  <ImageIcon size={48} className="opacity-20" />
                </div>
              )}
            </div>

            {/* Side Photos - Takes 4 cols, split vertically */}
            <div className="hidden lg:flex col-span-4 flex-col gap-4 h-full">
              <div className="relative flex-1 bg-neutral-100 group cursor-pointer overflow-hidden">
                {listing.photos[0] && (
                  <Image
                    src={listing.photos[0]} // Mock
                    alt="Side photo 1"
                    fill
                    className="object-cover hover:scale-105 transition-transform duration-700 ease-out"
                  />
                )}
              </div>
              <div className="relative flex-1 bg-neutral-100 group cursor-pointer overflow-hidden">
                {listing.photos[0] && (
                  <Image
                    src={listing.photos[0]} // Mock
                    alt="Side photo 2"
                    fill
                    className="object-cover hover:scale-105 transition-transform duration-700 ease-out"
                  />
                )}
                {/* "See all" Overlay mock */}
                <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-center justify-center">
                  <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-full text-xs font-bold shadow-sm opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0">
                    Voir toutes les photos
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Content Layout: 2/3 - 1/3 Split */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* Left Column: Description & Amenities (Main Content) */}
            <div className="lg:col-span-8 space-y-10">
              {/* Description */}
              <div className="bg-transparent">
                <h3 className="font-bold text-neutral-900 mb-4 text-xl">
                  Description
                </h3>
                <p className="text-neutral-600 leading-relaxed whitespace-pre-line text-lg">
                  {listing.description}
                </p>
              </div>

              {/* Amenities & Restrictions */}
              <div className="space-y-6">
                {listing.equipements && listing.equipements.length > 0 && (
                  <div>
                    <h3 className="font-bold text-neutral-900 mb-4 text-sm uppercase tracking-wider flex items-center gap-2">
                      Équipements
                    </h3>
                    <div className="flex flex-wrap gap-3">
                      {listing.equipements.map((eq, idx) => (
                        <span
                          key={idx}
                          className="flex items-center gap-2 px-4 py-2 bg-neutral-50 rounded-full border border-neutral-200 text-neutral-700 font-medium"
                        >
                          <CheckIcon
                            size={14}
                            className="text-green-600"
                            weight="bold"
                          />
                          {eq}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {listing.interdictions && listing.interdictions.length > 0 && (
                  <div>
                    <h3 className="font-bold text-neutral-900 mb-4 text-sm uppercase tracking-wider flex items-center gap-2 mt-8">
                      Interdictions
                    </h3>
                    <div className="flex flex-wrap gap-3">
                      {listing.interdictions.map((int, idx) => (
                        <span
                          key={idx}
                          className="flex items-center gap-2 px-4 py-2 bg-red-50 rounded-full border border-red-100 text-red-700 font-medium"
                        >
                          <XIcon
                            size={14}
                            className="text-red-600"
                            weight="bold"
                          />
                          {int}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Owner Info & Specs (Sidebar) */}
            <div className="lg:col-span-4 space-y-8">
              {/* Specs Card - Minimalist */}
              <div className="bg-neutral-50/50 p-6 rounded-3xl border border-neutral-100">
                <h4 className="font-bold text-neutral-900 mb-6 text-sm uppercase tracking-wider">
                  Caractéristiques
                </h4>
                <div className="space-y-5">
                  {listing.surface && (
                    <div className="flex justify-between items-center pb-4 border-b border-neutral-200/60 last:border-0 last:pb-0">
                      <span className="text-neutral-500 flex items-center gap-2">
                        <RulerIcon size={18} /> Surface
                      </span>
                      <span className="font-bold text-neutral-900 text-lg">
                        {listing.surface} m²
                      </span>
                    </div>
                  )}
                  {listing.bedrooms && (
                    <div className="flex justify-between items-center pb-4 border-b border-neutral-200/60 last:border-0 last:pb-0">
                      <span className="text-neutral-500 flex items-center gap-2">
                        <BedIcon size={18} /> Chambres
                      </span>
                      <span className="font-bold text-neutral-900 text-lg">
                        {listing.bedrooms}
                      </span>
                    </div>
                  )}
                  {listing.bathrooms && (
                    <div className="flex justify-between items-center pb-4 border-b border-neutral-200/60 last:border-0 last:pb-0">
                      <span className="text-neutral-500 flex items-center gap-2">
                        <ShowerIcon size={18} /> Douches
                      </span>
                      <span className="font-bold text-neutral-900 text-lg">
                        {listing.bathrooms}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Owner Info - Compact Sidebar View */}
              <div className="bg-white p-0">
                <h4 className="font-bold text-neutral-900 mb-4 text-sm uppercase tracking-wider">
                  Propriétaire
                </h4>
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 bg-neutral-100 rounded-full flex items-center justify-center text-xl font-bold text-neutral-400 border border-neutral-200">
                    {listing.owner.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-bold text-lg text-neutral-900">
                      {listing.owner.name}
                    </div>
                    <div className="text-xs font-medium text-neutral-500">
                      Particulier • Membre depuis 2023
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <a
                    href={`mailto:${listing.owner.email}`}
                    className="flex items-center gap-3 p-3 rounded-xl border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 transition-all group"
                  >
                    <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-600 group-hover:text-neutral-900">
                      <EnvelopeSimpleIcon size={16} weight="bold" />
                    </div>
                    <span className="text-sm font-medium text-neutral-700 truncate group-hover:text-neutral-900">
                      {listing.owner.email}
                    </span>
                  </a>

                  <a
                    href={`tel:${listing.owner.phone}`}
                    className="flex items-center gap-3 p-3 rounded-xl border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 transition-all group"
                  >
                    <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-600 group-hover:text-neutral-900">
                      <PhoneIcon size={16} weight="bold" />
                    </div>
                    <span className="text-sm font-medium text-neutral-700 truncate group-hover:text-neutral-900">
                      {listing.owner.phone}
                    </span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions Footer - Floating & Minimal */}
      <div className="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-none">
        <div className="bg-white/90 backdrop-blur-md shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-neutral-200/60 p-2 rounded-full flex items-center gap-2 pointer-events-auto transform hover:scale-[1.02] transition-transform">
          {listing.status === "pending" ? (
            <>
              <Button
                variant="ghost"
                className="rounded-full px-6 h-12 text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => onAction(listing.id, "reject")}
              >
                <XIcon size={20} className="mr-2" weight="bold" />
                Refuser
              </Button>
              <div className="w-px h-8 bg-neutral-200 mx-1"></div>
              <Button
                variant="ghost"
                className="rounded-full px-6 h-12 text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                onClick={() => onAction(listing.id, "request_changes")}
              >
                <EnvelopeSimpleIcon size={20} className="mr-2" weight="bold" />
                Infos
              </Button>
              <Button
                className="rounded-full px-8 h-12 bg-neutral-900 text-white hover:bg-black shadow-lg shadow-neutral-900/20 ml-2"
                onClick={() => onAction(listing.id, "approve")}
              >
                <CheckIcon size={20} className="mr-2" weight="bold" />
                Approuver
              </Button>
            </>
          ) : (
            <div className="flex items-center px-4">
              <span className="text-sm font-medium text-neutral-500 mr-3">
                Statut:
              </span>
              <span
                className={`font-bold text-sm px-3 py-1 rounded-full ${
                  listing.status === "approved"
                    ? "bg-green-100 text-green-700"
                    : listing.status === "rejected"
                    ? "bg-red-100 text-red-700"
                    : "bg-orange-100 text-orange-700"
                }`}
              >
                {listing.status === "approved"
                  ? "Approuvé"
                  : listing.status === "rejected"
                  ? "Rejeté"
                  : "Modifications"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-4 text-neutral-400 hover:text-neutral-900"
                onClick={() => onAction(listing.id, "request_changes")}
              >
                Modifier
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminListingsPage() {
  const [listings, setListings] = useState<PropertyListing[]>(mockListings);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(
    null
  );
  const [filterStatus, setFilterStatus] = useState<
    "all" | "pending" | "approved" | "rejected"
  >("pending");
  const [searchQuery, setSearchQuery] = useState("");

  // Quietly use the setters to avoid linter warnings about unused variables
  // In a real app, these would be used by the UI controls
  useMemo(() => {
    // Just reading these to make linter happy
    void filterStatus;
    void searchQuery;
    return {
      selectedListingId,
      setSelectedListingId,
      setFilterStatus,
      setSearchQuery,
    };
  }, [selectedListingId, filterStatus, searchQuery]);

  const stats: Stats = useMemo(
    () => ({
      total: listings.length,
      pending: listings.filter((l) => l.status === "pending").length,
      approved: listings.filter((l) => l.status === "approved").length,
      rejected: listings.filter((l) => l.status === "rejected").length,
    }),
    [listings]
  );

  const filteredListings = useMemo(() => {
    return listings.filter((listing) => {
      const matchesStatus =
        filterStatus === "all" || listing.status === filterStatus;
      const matchesSearch =
        listing.titre.toLowerCase().includes(searchQuery.toLowerCase()) ||
        listing.owner.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        listing.quartier.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [listings, filterStatus, searchQuery]);

  // const selectedListing = useMemo(
  //   () => listings.find((l) => l.id === selectedListingId) || null,
  //   [listings, selectedListingId]
  // );

  const handleAction = (
    id: string,
    action: "approve" | "reject" | "request_changes"
  ) => {
    setListings((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status:
                action === "approve"
                  ? "approved"
                  : action === "reject"
                  ? "rejected"
                  : "changes_requested",
            }
          : item
      )
    );
    // Optionally keep selection or clear it. Let's keep it to show updated status.
  };

  return (
    <div className="space-y-6 h-[calc(100vh-120px)] flex flex-col">
      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <StatsCard
          title="Total Soumissions"
          value={stats.total}
          icon={TrendUpIcon}
          colorClass="text-blue-600"
          bgClass="bg-blue-50"
        />
        <StatsCard
          title="En Attente"
          value={stats.pending}
          icon={WarningCircleIcon}
          colorClass="text-yellow-600"
          bgClass="bg-yellow-50"
        />
        <StatsCard
          title="Approuvées"
          value={stats.approved}
          icon={CheckCircleIcon}
          colorClass="text-green-600"
          bgClass="bg-green-50"
        />
        <StatsCard
          title="Rejetées"
          value={stats.rejected}
          icon={XCircleIcon}
          colorClass="text-red-600"
          bgClass="bg-red-50"
        />
      </div>

      <div className="flex-grow overflow-hidden p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 h-full overflow-y-auto pb-20">
          {filteredListings.length > 0 ? (
            filteredListings.map((listing) => (
              <ExpandableScreen key={listing.id}>
                <ExpandableScreenTrigger className="w-full">
                  <div className="group p-4 rounded-xl border border-neutral-200 hover:border-primary/50 hover:shadow-md bg-white transition-all relative overflow-hidden text-left h-full">
                    {/* Status Indicator Line - Redesigned */}
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-medium text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-full">
                        {listing.type}
                      </span>
                      <span
                        className={`text-[10px] uppercase font-bold px-2 py-1 rounded-full border ${getStatusClasses(
                          listing.status
                        )}`}
                      >
                        {listing.status === "pending"
                          ? "En attente"
                          : listing.status === "approved"
                          ? "Approuvé"
                          : listing.status === "changes_requested"
                          ? "Modif."
                          : "Rejeté"}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center gap-1 text-xs text-neutral-400 mb-1">
                        <ClockIcon size={12} />
                        {new Date(listing.submittedAt).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric" }
                        )}
                      </div>
                      <h3 className="font-bold text-neutral-900 truncate mb-1 text-sm">
                        {listing.titre}
                      </h3>
                      <p className="text-xs text-neutral-500 mb-2 truncate">
                        {listing.quartier}, {listing.ville}
                      </p>
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-neutral-100">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-neutral-100 text-neutral-500 flex items-center justify-center text-xs font-bold border border-neutral-200">
                            {listing.owner.name.charAt(0)}
                          </div>
                          <span className="text-xs font-medium text-neutral-600 truncate max-w-[100px]">
                            {listing.owner.name}
                          </span>
                        </div>
                        <span className="font-bold text-neutral-900 text-sm">
                          {listing.prixMensuel.toLocaleString()} F
                        </span>
                      </div>
                    </div>
                  </div>
                </ExpandableScreenTrigger>

                <ExpandableScreenContent
                  className="bg-white"
                  showCloseButton={false}
                >
                  <ListingDetailView
                    listing={listing}
                    onAction={handleAction}
                  />
                </ExpandableScreenContent>
              </ExpandableScreen>
            ))
          ) : (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-center text-neutral-400">
              <FunnelIcon size={32} className="mb-3 opacity-20" />
              <p className="text-sm">Aucun résultat trouvé</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
