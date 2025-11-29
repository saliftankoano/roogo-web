export type Property = {
  id: number;
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
  category: "Residential" | "Business";
  isSponsored: boolean;
  status: string;
  propertyType: string;
  description: string;
  amenities: string[];
  views?: number;
  favorites?: number;
};

export const properties: Property[] = [
  {
    id: 1,
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
    category: "Residential",
    isSponsored: true,
    status: "Disponible",
    propertyType: "Résidence",
    description:
      "Maison moderne avec de grands espaces de vie, idéale pour les familles recherchant le confort et la proximité des commodités.",
    amenities: ["Piscine privée", "Sécurité 24/7", "Climatisation", "Jardin"],
    views: 1240,
    favorites: 45
  },
  {
    id: 2,
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
    category: "Residential",
    isSponsored: true,
    status: "Disponible",
    propertyType: "Villa",
    description:
      "Villa entièrement meublée avec un design contemporain, proche des écoles internationales et des centres commerciaux.",
    amenities: [
      "Fibre optique",
      "Générateur de secours",
      "Buanderie équipée",
      "Terrasse panoramique",
    ],
    views: 850,
    favorites: 32
  },
  {
    id: 3,
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
    category: "Business",
    isSponsored: false,
    status: "Disponible",
    propertyType: "Bureau",
    description:
      "Espace bureau lumineux au cœur de la ville, parfait pour les startups ou les PME.",
    amenities: ["Ascenseur", "Open space", "Salle de réunion"],
    views: 560,
    favorites: 18
  },
  {
    id: 4,
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
    category: "Residential",
    isSponsored: false,
    status: "Disponible",
    propertyType: "Maison",
    description:
      "Charmante maison familiale avec un grand jardin ombragé, idéale pour les enfants.",
    amenities: ["Forage privé", "Maison de gardien", "Clôture sécurisée"],
    views: 420,
    favorites: 12
  },
];
