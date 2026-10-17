import { fetchFeaturedProperties } from "@/lib/data";
import { FeaturedPropertyGrid } from "@/components/FeaturedPropertyGrid";

export default async function FeaturedProperties() {
  try {
    const properties = await fetchFeaturedProperties(4);
    return <FeaturedPropertyGrid properties={properties} />;
  } catch (error) {
    console.error("Unable to load featured properties:", error);
    return (
      <p className="mt-12 text-neutral-600" role="status">
        Les annonces sont momentanément indisponibles. Réessayez dans un instant.
      </p>
    );
  }
}
