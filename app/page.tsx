import { fetchFeaturedProperties } from "../lib/data";
import HomeClient from "../components/HomeClient";
import { HOME_TITLE, HOME_DESCRIPTION, publicPageMetadata } from "@/lib/seo";
import JsonLd from "../components/JsonLd";
import { getHomePageSchema } from "../lib/schemas";

export const metadata = publicPageMetadata({
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  path: "/",
});

export default async function Home() {
  const featuredProperties = await fetchFeaturedProperties(4);

  return (
    <>
      <JsonLd schema={getHomePageSchema()} />
      <HomeClient featuredProperties={featuredProperties} />
    </>
  );
}
