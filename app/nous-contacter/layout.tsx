import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "Contact et assistance | Roogo",
  description: "Contactez l'équipe Roogo à Ouagadougou par téléphone, email ou WhatsApp pour votre recherche de logement ou votre annonce immobilière.",
  path: "/nous-contacter",
});

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
