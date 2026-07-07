import { Metadata } from "next";
import { Footer } from "@/components/Footer";
import JsonLd from "@/components/JsonLd";
import { getVisites3dPageSchema, SITE_URL } from "@/lib/schemas";
import { Hero } from "@/components/visites-3d/sections/Hero";
import { Benefits } from "@/components/visites-3d/sections/Benefits";
import { Realisations } from "@/components/visites-3d/sections/Realisations";
import { Process } from "@/components/visites-3d/sections/Process";
import { Pricing } from "@/components/visites-3d/sections/Pricing";
import { FAQ } from "@/components/visites-3d/sections/FAQ";
import { BookingSection } from "@/components/visites-3d/BookingSection";
import { ContactFallback } from "@/components/visites-3d/ContactFallback";
import { PRICE_PER_ROOM, formatFCFA } from "@/lib/visites-3d";

export const metadata: Metadata = {
  title: "Visites virtuelles 3D à Ouagadougou",
  description: `Faites scanner votre bien en 3D et partagez une visite immersive à vos clients. Service Roogo à Ouagadougou — ${formatFCFA(PRICE_PER_ROOM)} / pièce. Réservez votre créneau en ligne.`,
  keywords: [
    "visite 3D Burkina Faso",
    "visite virtuelle Ouagadougou",
    "scan 3D immobilier",
    "visite virtuelle immobilier Burkina",
    "Roogo visite virtuelle",
    "Roogo visite 3D",
  ],
  openGraph: {
    type: "website",
    url: `${SITE_URL}/visites-3d`,
    title: "Visites virtuelles 3D à Ouagadougou | Roogo",
    description: `Offrez à vos clients une visite immersive 24h/24. Scan sur site, lien partageable, ${formatFCFA(PRICE_PER_ROOM)} / pièce.`,
  },
  alternates: {
    canonical: "/visites-3d",
  },
};

export default function Visites3dPage() {
  return (
    <div className="min-h-screen bg-[#f5efe6]">
      <JsonLd schema={getVisites3dPageSchema()} />
      <main>
        <Hero />
        <Benefits />
        <Realisations />
        <Process />
        <Pricing />
        <BookingSection />
        <ContactFallback />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
}
