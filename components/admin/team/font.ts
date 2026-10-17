import { Urbanist } from "next/font/google";

// Urbanist is the Roogo typeface (mobile app and design canvas). Loaded only
// for the briefing and team pages so the rest of the admin keeps its font.
export const urbanist = Urbanist({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});
