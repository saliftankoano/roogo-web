import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Location Appartement et Maison Ouagadougou | Roogo",
  description: "Parcourez les meilleures offres de location à Ouagadougou: appartements, maisons, villas, studios. Photos professionnelles, prix transparents. Trouvez votre logement aujourd'hui.",
  keywords: [
    "location appartement ouagadougou",
    "maison a louer ouaga",
    "appartement ouaga 2000",
    "location villa burkina",
    "immobilier ouaga",
    "appartement meuble ouagadougou"
  ],
  openGraph: {
    title: "Location Appartement et Maison Ouagadougou | Roogo",
    description: "Parcourez les meilleures offres de location à Ouagadougou. Photos professionnelles et prix transparents.",
    url: "https://roogo.bf/location",
  },
};

export default function LocationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
