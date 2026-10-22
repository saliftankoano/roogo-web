import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "Carrières et recrutement | Roogo",
  description: "Rejoignez l'équipe Roogo à Ouagadougou. Découvrez les opportunités pour contribuer au développement de l'immobilier au Burkina Faso.",
  path: "/carrieres",
});

export default function CareersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
