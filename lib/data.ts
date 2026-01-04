import { supabase } from "./supabase";

export type Property = {
  id: string;
  title: string;
  location: string;
  address: string;
  price: string;
  bedrooms: number;
  bathrooms: number;
  area: string;
  parking: number;
  period?: string;
  image: string;
  images: string[];
  category: "Residential" | "Business";
  isSponsored: boolean;
  status: string;
  propertyType: string;
  description: string;
  amenities: string[];
  views?: number;
  favorites?: number;
  city?: string;
  quartier?: string;
  created_at?: string;
  agent?: {
    full_name: string;
    phone: string;
    avatar_url: string;
  };
};

interface DBProperty {
  id: string;
  title: string;
  quartier: string;
  city: string;
  address: string;
  price: number;
  bedrooms: number | null;
  bathrooms: number | null;
  area: number | null;
  parking_spaces: number | null;
  period: string;
  images: string[] | null;
  property_type: string;
  has_premium_badge: boolean | null;
  status: string;
  description: string | null;
  amenities: string[] | null;
  views_count: number | null;
  favorites_count: number | null;
  created_at: string;
  agent_name: string | null;
  agent_phone: string | null;
  agent_avatar: string | null;
}

export async function fetchProperties(): Promise<Property[]> {
  const { data, error } = await supabase
    .from("property_details")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching properties:", error);
    return [];
  }

  return ((data as DBProperty[]) || []).map((p) => ({
    id: p.id,
    title: p.title,
    location: `${p.quartier}, ${p.city}`,
    address: p.address,
    price: p.price.toString(),
    bedrooms: p.bedrooms || 0,
    bathrooms: p.bathrooms || 0,
    area: p.area?.toString() || "0",
    parking: p.parking_spaces || 0,
    period: p.period === "month" ? "Mois" : p.period,
    image: p.images?.[0] || "/hero-bg.jpg",
    images: p.images || [],
    category: p.property_type === "commercial" ? "Business" : "Residential",
    isSponsored: p.has_premium_badge || false,
    status: p.status,
    propertyType: p.property_type,
    description: p.description || "",
    amenities: p.amenities || [],
    views: p.views_count || 0,
    favorites: p.favorites_count || 0,
    city: p.city,
    quartier: p.quartier,
    created_at: p.created_at,
    agent: {
      full_name: p.agent_name || "Agent Inconnu",
      phone: p.agent_phone || "",
      avatar_url: p.agent_avatar || "",
    },
  }));
}

export async function fetchPropertyById(id: string): Promise<Property | null> {
  const { data, error } = await supabase
    .from("property_details")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching property by id:", error);
    return null;
  }

  const p = data as DBProperty;
  return {
    id: p.id,
    title: p.title,
    location: `${p.quartier}, ${p.city}`,
    address: p.address,
    price: p.price.toString(),
    bedrooms: p.bedrooms || 0,
    bathrooms: p.bathrooms || 0,
    area: p.area?.toString() || "0",
    parking: p.parking_spaces || 0,
    period: p.period === "month" ? "Mois" : p.period,
    image: p.images?.[0] || "/hero-bg.jpg",
    images: p.images || [],
    category: p.property_type === "commercial" ? "Business" : "Residential",
    isSponsored: p.has_premium_badge || false,
    status: p.status,
    propertyType: p.property_type,
    description: p.description || "",
    amenities: p.amenities || [],
    views: p.views_count || 0,
    favorites: p.favorites_count || 0,
    city: p.city,
    quartier: p.quartier,
    created_at: p.created_at,
    agent: {
      full_name: p.agent_name || "Agent Inconnu",
      phone: p.agent_phone || "",
      avatar_url: p.agent_avatar || "",
    },
  };
}

export const properties: Property[] = [
  {
    id: "1",
    title: "Villa Moderne Lakeshore",
    location: "Koulouba",
    address: "Quartier Koulouba, Ouagadougou",
    price: "450000",
    bedrooms: 4,
    bathrooms: 2,
    area: "1493",
    parking: 2,
    period: "Mois",
    image: "/hero-bg.jpg",
    images: ["/hero-bg.jpg"],
    category: "Residential",
    isSponsored: true,
    status: "Disponible",
    propertyType: "Résidence",
    description:
      "Maison moderne avec de grands espaces de vie, idéale pour les familles recherchant le confort et la proximité des commodités.",
    amenities: ["Piscine privée", "Sécurité 24/7", "Climatisation", "Jardin"],
    views: 1240,
    favorites: 45,
  },
  {
    id: "2",
    title: "Villa de Luxe Zone A",
    location: "Ouaga 2000",
    address: "Ouaga 2000, Zone A",
    price: "950000",
    bedrooms: 3,
    bathrooms: 2,
    area: "800",
    parking: 1,
    period: "Mois",
    image: "/hero-bg.jpg",
    images: ["/hero-bg.jpg"],
    category: "Residential",
    isSponsored: true,
    status: "Disponible",
    propertyType: "Villa",
    description:
      "Villa entièrement meublée with un design contemporain, proche des écoles internationales et des centres commerciaux.",
    amenities: [
      "Fibre optique",
      "Générateur de secours",
      "Buanderie équipée",
      "Terrasse panoramique",
    ],
    views: 850,
    favorites: 32,
  },
  {
    id: "3",
    title: "Espace Commercial Premium",
    location: "Somgandé",
    address: "Somgandé, Rue 12",
    price: "1200000",
    bedrooms: 0,
    bathrooms: 2,
    area: "650",
    parking: 10,
    period: "Mois",
    image: "/hero-bg.jpg",
    images: ["/hero-bg.jpg"],
    category: "Business",
    isSponsored: false,
    status: "Disponible",
    propertyType: "Bureau",
    description:
      "Espace bureau lumineux au cœur de la ville, parfait pour les startups ou les PME.",
    amenities: ["Ascenseur", "Open space", "Salle de réunion"],
    views: 560,
    favorites: 18,
  },
  {
    id: "4",
    title: "Maison Familiale Cissin",
    location: "Cissin",
    address: "Cissin, Rue des Manguiers",
    price: "300000",
    bedrooms: 3,
    bathrooms: 2,
    area: "900",
    parking: 2,
    period: "Mois",
    image: "/hero-bg.jpg",
    images: ["/hero-bg.jpg"],
    category: "Residential",
    isSponsored: false,
    status: "Disponible",
    propertyType: "Maison",
    description:
      "Charmante maison familiale with un grand jardin ombragé, idéale pour les enfants.",
    amenities: ["Forage privé", "Maison de gardien", "Clôture sécurisée"],
    views: 420,
    favorites: 12,
  },
];
