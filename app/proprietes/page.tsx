import JsonLd from "@/components/JsonLd";
import { AllListingsDirectory } from "@/components/ListingLinks";
import { PropertiesClient } from "@/components/PropertiesClient";
import { fetchAllOnlineProperties, fetchProperties } from "@/lib/data";
import { getPropertiesCollectionSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export default async function PropertiesPage() {
  const [{ properties }, allOnline] = await Promise.all([
    fetchProperties({ limit: 100, status: "en_ligne" }),
    fetchAllOnlineProperties(),
  ]);

  return (
    <>
      <JsonLd schema={getPropertiesCollectionSchema(properties)} />
      <PropertiesClient initialProperties={properties}>
        <AllListingsDirectory properties={allOnline} />
      </PropertiesClient>
    </>
  );
}
