import type { Metadata } from "next";
import { TalentCandidateClient } from "@/components/talent/TalentCandidateClient";

export const metadata: Metadata = {
  title: "Roogo Talent | Challenge acquisition propriétaires",
  description:
    "Espace candidat Roogo Talent pour l'évaluation acquisition propriétaires.",
};

export default function TalentPage() {
  return <TalentCandidateClient />;
}
