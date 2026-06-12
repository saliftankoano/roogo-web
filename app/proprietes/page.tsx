import JsonLd from "@/components/JsonLd";
import { PropertiesClient } from "@/components/PropertiesClient";
import { fetchProperties } from "@/lib/data";
import { getPropertiesCollectionSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export default async function PropertiesPage() {
  const { properties } = await fetchProperties({
    limit: 100,
    status: "en_ligne",
  });

  return (
    <>
      <JsonLd schema={getPropertiesCollectionSchema(properties)} />
      <PropertiesClient initialProperties={properties} />
    </>
  );
}
