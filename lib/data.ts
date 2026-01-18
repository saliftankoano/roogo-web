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
  payment_id?: string;
  transaction_id?: string;
  agent?: {
    full_name: string;
    phone: string;
    avatar_url: string;
    user_type?: string;
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
  is_boosted: boolean | null;
  status: string;
  description: string | null;
  amenities: string[] | null;
  views_count: number | null;
  favorites_count: number | null;
  created_at: string;
  agent_name: string | null;
  agent_phone: string | null;
  agent_avatar: string | null;
  agent_type: string | null;
  payment_id: string | null;
  transaction_id: string | null;
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

  const mappedProperties = ((data as DBProperty[]) || []).map((p) => ({
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
    category: (p.property_type === "commercial" ? "Business" : "Residential") as "Business" | "Residential",
    isSponsored: p.is_boosted || false,
    status: p.status,
    propertyType: p.property_type,
    description: p.description || "",
    amenities: p.amenities || [],
    views: p.views_count || 0,
    favorites: p.favorites_count || 0,
    city: p.city,
    quartier: p.quartier,
    created_at: p.created_at,
    payment_id: p.payment_id || undefined,
    transaction_id: p.transaction_id || undefined,
    agent: {
      full_name: p.agent_name || "Agent Inconnu",
      phone: p.agent_phone || "",
      avatar_url: p.agent_avatar || "",
      user_type: p.agent_type || undefined,
    },
  }));

  // Sort by isSponsored first, then by created_at
  return mappedProperties.sort((a, b) => {
    if (a.isSponsored && !b.isSponsored) return -1;
    if (!a.isSponsored && b.isSponsored) return 1;
    return 0; // maintain created_at order from query
  });
}

export async function fetchFeaturedProperties(
  limit: number = 4
): Promise<Property[]> {
  // To ensure we get enough sponsored properties, we fetch more and then slice
  const { data, error } = await supabase
    .from("property_details")
    .select("*")
    .eq("status", "en_ligne")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching featured properties:", error);
    return [];
  }

  const mappedProperties = ((data as DBProperty[]) || []).map((p) => ({
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
    category: (p.property_type === "commercial" ? "Business" : "Residential") as "Business" | "Residential",
    isSponsored: p.is_boosted || false,
    status: p.status,
    propertyType: p.property_type,
    description: p.description || "",
    amenities: p.amenities || [],
    views: p.views_count || 0,
    favorites: p.favorites_count || 0,
    city: p.city,
    quartier: p.quartier,
    created_at: p.created_at,
    payment_id: p.payment_id || undefined,
    transaction_id: p.transaction_id || undefined,
    agent: {
      full_name: p.agent_name || "Agent Inconnu",
      phone: p.agent_phone || "",
      avatar_url: p.agent_avatar || "",
      user_type: p.agent_type || undefined,
    },
  }));

  return mappedProperties
    .sort((a, b) => {
      if (a.isSponsored && !b.isSponsored) return -1;
      if (!a.isSponsored && b.isSponsored) return 1;
      return 0;
    })
    .slice(0, limit);
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
    category: (p.property_type === "commercial" ? "Business" : "Residential") as "Business" | "Residential",
    isSponsored: p.is_boosted || false,
    status: p.status,
    propertyType: p.property_type,
    description: p.description || "",
    amenities: p.amenities || [],
    views: p.views_count || 0,
    favorites: p.favorites_count || 0,
    city: p.city,
    quartier: p.quartier,
    created_at: p.created_at,
    payment_id: p.payment_id || undefined,
    transaction_id: p.transaction_id || undefined,
    agent: {
      full_name: p.agent_name || "Agent Inconnu",
      phone: p.agent_phone || "",
      avatar_url: p.agent_avatar || "",
      user_type: p.agent_type || undefined,
    },
  };
}

export type Transaction = {
  id: string;
  deposit_id: string;
  amount: number;
  currency: string;
  status: "pending" | "completed" | "failed" | "refunded";
  type: "listing_submission" | "photography" | "boost";
  provider: string;
  payer_phone: string;
  property_id: string | null;
  user_id: string | null;
  created_at: string;
  metadata?: any;
};

export async function fetchTransactionsByPropertyId(
  propertyId: string,
  paymentId?: string | null,
  transactionId?: string | null
): Promise<Transaction[]> {
  // Try multiple ways to find the transaction
  const queries = [];
  
  // 1. Find by property_id
  queries.push(supabase.from("transactions").select("*").eq("property_id", propertyId));
  
  // 2. Find by payment_id (deposit_id)
  if (paymentId) {
    queries.push(supabase.from("transactions").select("*").eq("deposit_id", paymentId));
  }
  
  // 3. Find by transaction_id (primary key)
  if (transactionId) {
    queries.push(supabase.from("transactions").select("*").eq("id", transactionId));
  }

  const results = await Promise.all(queries);
  const allTransactions: Transaction[] = [];
  const seenIds = new Set<string>();

  results.forEach((res) => {
    if (!res.error && res.data) {
      (res.data as Transaction[]).forEach(tx => {
        if (!seenIds.has(tx.id)) {
          seenIds.add(tx.id);
          allTransactions.push(tx);
        }
      });
    } else if (res.error) {
      console.error("Error in transaction query:", res.error);
    }
  });

  // Sort by created_at descending
  allTransactions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return allTransactions;
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

export async function updatePropertyStatus(
  id: string,
  status: string
): Promise<boolean> {
  try {
    const response = await fetch(`/api/properties/${id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      console.error("Error updating property status:", await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error updating property status:", error);
    return false;
  }
}
