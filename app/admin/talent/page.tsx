import type { Metadata } from "next";
import { TalentAdminClient } from "@/components/talent/TalentAdminClient";

export const metadata: Metadata = {
  title: "Talent | Administration Roogo",
  description: "Pipeline Roogo Talent pour l'évaluation des candidats.",
};

export default function AdminTalentPage() {
  return <TalentAdminClient />;
}
