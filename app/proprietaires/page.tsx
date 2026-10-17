import { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { OwnerVsl } from "@/components/proprietaires/OwnerVsl";
import { SITE_URL } from "@/lib/schemas";

export const metadata: Metadata = {
  title: "Propriétaires : trouvez un locataire avec Roogo",
  description:
    "0 FCFA aujourd'hui. Publiez votre bien sur Roogo, nous vous amenons des locataires et nous encaissons les loyers par mobile money. Regardez la vidéo.",
  keywords: [
    "louer sa maison Ouagadougou",
    "propriétaire Burkina Faso location",
    "trouver un locataire Ouagadougou",
    "encaisser loyer mobile money",
    "Roogo propriétaires",
  ],
  openGraph: {
    type: "website",
    url: `${SITE_URL}/proprietaires`,
    title: "Propriétaires : trouvez un locataire avec Roogo",
    description:
      "0 FCFA aujourd'hui. Roogo vous amène des locataires et encaisse les loyers par mobile money.",
  },
  alternates: { canonical: "/proprietaires" },
};

export default function ProprietairesPage() {
  return (
    <div className="min-h-screen bg-[#f5efe6]">
      <main>
        <OwnerVsl />
      </main>
      <Footer />
    </div>
  );
}
