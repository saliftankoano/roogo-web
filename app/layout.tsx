import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { NavHandler } from "../components/NavHandler";
import JsonLd from "../components/JsonLd";
import { getOrganizationSchema } from "../lib/schemas";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Roogo | Immobilier au Burkina Faso",
    template: "%s | Roogo",
  },
  description: "La référence de la location immobilière au Burkina Faso. Trouvez votre appartement, maison ou local commercial à Ouagadougou.",
  metadataBase: new URL("https://roogo.bf"),
  keywords: ["immobilier burkina faso", "location appartement ouagadougou", "louer maison burkina", "roogo"],
  authors: [{ name: "Roogo Team" }],
  creator: "Roogo",
  publisher: "Roogo",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "fr_BF",
    url: "https://roogo.bf",
    siteName: "Roogo",
    title: "Roogo | Immobilier au Burkina Faso",
    description: "La référence de la location immobilière au Burkina Faso. Trouvez votre appartement, maison ou local commercial à Ouagadougou.",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Roogo Immobilier",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Roogo | Immobilier au Burkina Faso",
    description: "La référence de la location immobilière au Burkina Faso.",
    images: ["/og-image.jpg"],
  },
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="fr">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          <JsonLd schema={getOrganizationSchema()} />
          <NavHandler />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
