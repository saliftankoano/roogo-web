import { fetchFeaturedProperties } from "../lib/data";
import HomeClient from "../components/HomeClient";
import { Metadata } from "next";
import JsonLd from "../components/JsonLd";
import { getHomePageSchema } from "../lib/schemas";

export const metadata: Metadata = {
  title: "Location Appartement et Maison au Burkina Faso | Roogo",
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
    canonical: "https://www.roogobf.com",
  },
};

export default async function Home() {
  const featuredProperties = await fetchFeaturedProperties(4);

  return (
    <>
      <JsonLd schema={getHomePageSchema()} />
      <HomeClient featuredProperties={featuredProperties} />
    </>
  );
}
