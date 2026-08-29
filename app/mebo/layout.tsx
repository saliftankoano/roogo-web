import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import { ROOGO_MEBO_ORIGIN } from "@/lib/site-context";

export const metadata: Metadata = {
  metadataBase: new URL(ROOGO_MEBO_ORIGIN),
  title: {
    default: "Roogo Mêbo | Plans de maisons et créations architecturales",
    template: "%s | Roogo Mêbo",
  },
  description:
    "Découvrez des plans de maisons présentés en images et en vidéo, proposés par des architectes et entreprises de construction.",
  openGraph: {
    type: "website",
    locale: "fr_BF",
    url: ROOGO_MEBO_ORIGIN,
    siteName: "Roogo Mêbo",
    title: "Roogo Mêbo | Le plan qui donne envie de bâtir",
    description:
      "Une marketplace visuelle pour découvrir et acheter des plans auprès de créateurs vérifiés.",
    images: [
      {
        url: "/marketing/roogo-mebo-hero-v1.png",
        width: 1672,
        height: 941,
        alt: "Maison contemporaine adaptée au climat sahélien",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Roogo Mêbo | Le plan qui donne envie de bâtir",
    description:
      "Découvrez des plans de maisons en images, rendus 3D et vidéos.",
    images: ["/marketing/roogo-mebo-hero-v1.png"],
  },
};

const meboWebsiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Roogo Mêbo",
  url: ROOGO_MEBO_ORIGIN,
  description:
    "Marketplace de plans de maisons et de créations architecturales au Burkina Faso.",
  publisher: {
    "@type": "Organization",
    name: "Roogo",
    url: "https://www.roogobf.com",
  },
};

export default function MeboLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd schema={meboWebsiteSchema} />
      {children}
    </>
  );
}
