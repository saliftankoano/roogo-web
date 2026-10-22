import type { Metadata } from "next";

export const SITE_NAME = "Roogo";
export const SITE_ORIGIN = "https://www.roogobf.com";
export const HOME_TITLE = "Roogo : maisons et appartements à louer à Ouagadougou";
export const HOME_DESCRIPTION =
  "Trouvez une maison, un appartement ou une villa à louer à Ouagadougou, au Burkina Faso. Consultez les annonces et organisez votre visite avec Roogo.";

/** Keep search and sharing metadata aligned for public landing pages. */
export function publicPageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const url = new URL(path, SITE_ORIGIN).toString();
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "fr_BF",
      siteName: SITE_NAME,
      title,
      description,
      url,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
