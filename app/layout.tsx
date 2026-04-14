import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { NavHandler } from "../components/NavHandler";
import JsonLd from "../components/JsonLd";
import { getOrganizationSchema } from "../lib/schemas";
import { WebOnboardingTour } from "../components/onboarding/WebOnboardingTour";
import { TrustpilotScript } from "../components/TrustpilotScript";

const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;

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
  description:
    "La référence de la location immobilière au Burkina Faso. Trouvez votre appartement, maison ou local commercial à Ouagadougou.",
  metadataBase: new URL("https://roogo.bf"),
  keywords: [
    "immobilier burkina faso",
    "location appartement ouagadougou",
    "louer maison burkina",
    "roogo",
  ],
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
    description:
      "La référence de la location immobilière au Burkina Faso. Trouvez votre appartement, maison ou local commercial à Ouagadougou.",
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
    icon: "/logo.png?v=2",
    shortcut: "/logo.png?v=2",
    apple: "/logo.png?v=2",
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
          <TrustpilotScript />
          {metaPixelId && (
            <>
              <Script
                id="meta-pixel"
                strategy="afterInteractive"
                dangerouslySetInnerHTML={{
                  __html: `
                !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
                fbq('init','${metaPixelId}');
                fbq('track','PageView');
              `,
                }}
              />
              <noscript>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1`}
                  alt=""
                  width={1}
                  height={1}
                  style={{ display: "none" }}
                />
              </noscript>
            </>
          )}
          <JsonLd schema={getOrganizationSchema()} />
          <NavHandler />
          <WebOnboardingTour />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
