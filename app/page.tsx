import { fetchFeaturedProperties } from "../lib/data";
import HomeClient from "../components/HomeClient";
import { Metadata } from "next";
import JsonLd from "../components/JsonLd";
import { getWebSiteSchema } from "../lib/schemas";

export const metadata: Metadata = {
  title: "Roogo | Location Appartement et Maison au Burkina Faso",
  description: "Trouvez votre logement idéal à Ouagadougou et au Burkina Faso. Location appartement, maison, villa et local commercial. Photos professionnelles, visites organisées.",
  keywords: [
    "location appartement ouagadougou",
    "immobilier burkina faso",
    "louer maison ouagadougou",
    "appartement a louer ouaga",
    "immobilier ouaga",
    "villa a louer burkina"
  ],
  alternates: {
    canonical: "https://roogo.bf",
  },
};

export default async function Home() {
  const featuredProperties = await fetchFeaturedProperties(4);

  return (
    <>
      <JsonLd schema={getWebSiteSchema()} />
      <HomeClient featuredProperties={featuredProperties} />
    </>
  );
}
