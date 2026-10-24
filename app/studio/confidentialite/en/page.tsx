import type { Metadata } from "next";
import { StudioPrivacy } from "../StudioPrivacy";

export const metadata: Metadata = {
  title: "Roogo Studio: privacy (internal tool)",
  robots: { index: false, follow: false },
};

export default function StudioPrivacyEnPage() {
  return <StudioPrivacy lang="en" />;
}
