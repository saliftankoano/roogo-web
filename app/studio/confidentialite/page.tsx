import type { Metadata } from "next";
import { StudioPrivacy } from "./StudioPrivacy";

export const metadata: Metadata = {
  title: "Roogo Studio : confidentialité (outil interne)",
  robots: { index: false, follow: false },
};

export default function StudioPrivacyPage() {
  return <StudioPrivacy lang="fr" />;
}
