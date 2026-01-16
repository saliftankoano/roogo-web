import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contactez Roogo | Assistance Immobilière Ouagadougou",
  description: "Besoin d'aide pour trouver un logement à Ouagadougou? Contactez l'équipe Roogo. Assistance rapide par téléphone, email ou WhatsApp.",
  keywords: ["contact roogo", "agence immobilière ouagadougou", "aide location burkina"],
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
