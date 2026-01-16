import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Carrières chez Roogo | Rejoignez l'Équipe",
  description: "Rejoignez Roogo, la startup qui révolutionne l'immobilier au Burkina Faso. Opportunités pour talents ambitieux à Ouagadougou.",
  keywords: ["emploi burkina faso", "recrutement roogo", "travailler dans l'immobilier ouagadougou"],
};

export default function CareersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
