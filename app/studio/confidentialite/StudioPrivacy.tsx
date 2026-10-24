import Link from "next/link";

// Roogo Studio privacy note for the YouTube API Services audit (2026-10-24,
// decided by Salif). Public, unlinked, noindex, not in the sitemap: the
// customer privacy policy and terms do not mention YouTube.

const COPY = {
  fr: {
    title: "Roogo Studio : confidentialité (outil interne)",
    updated: "Mise à jour : 24 octobre 2026",
    other: { href: "/studio/confidentialite/en", label: "English" },
    lines: [
      "Roogo Studio est l'outil interne de Roogo. Il est utilisé uniquement par l'équipe Roogo (application Google OAuth de type « Interne »).",
      "Il utilise les Services d'API YouTube pour publier les vidéos de Roogo sur la chaîne YouTube de Roogo et lire les statistiques de cette chaîne.",
      "Données utilisées : les statistiques de la chaîne de Roogo et les vidéos que Roogo publie. Aucune donnée d'autres chaînes ou de tiers.",
      "Les jetons de connexion et les statistiques en cache sont supprimés lorsque la connexion YouTube est retirée dans Roogo Studio. Le nombre quotidien d'abonnés de la chaîne de Roogo est conservé comme historique des objectifs internes.",
    ],
    terms: ["Conditions d'utilisation de YouTube", "Règles de confidentialité de Google"],
    termsIntro: "En savoir plus :",
    revoke: "Révoquer l'accès :",
    revokeLabel: "autorisations du compte Google",
    contact: "Contact :",
  },
  en: {
    title: "Roogo Studio: privacy (internal tool)",
    updated: "Updated: October 24, 2026",
    other: { href: "/studio/confidentialite", label: "Français" },
    lines: [
      "Roogo Studio is Roogo's internal tool. It is used only by Roogo staff (Google OAuth app with the « Internal » audience).",
      "It uses YouTube API Services to publish Roogo's own videos to Roogo's own YouTube channel and to read that channel's statistics.",
      "Data used: Roogo's channel statistics and the videos Roogo publishes. No data from other channels or third parties.",
      "Connection tokens and cached statistics are deleted when the YouTube connection is removed in Roogo Studio. The daily subscriber count of Roogo's own channel is kept as internal goal history.",
    ],
    terms: ["YouTube Terms of Service", "Google Privacy Policy"],
    termsIntro: "Learn more:",
    revoke: "Revoke access:",
    revokeLabel: "Google Account permissions",
    contact: "Contact:",
  },
} as const;

const linkClass = "text-orange-600 hover:underline";

export function StudioPrivacy({ lang }: { lang: "fr" | "en" }) {
  const c = COPY[lang];
  return (
    <main lang={lang} className="min-h-screen bg-white px-4 pb-16 pt-32">
      <div className="mx-auto max-w-2xl space-y-4 text-[15px] leading-relaxed text-neutral-700">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-neutral-900">{c.title}</h1>
          <Link href={c.other.href} className="shrink-0 text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-800">
            {c.other.label}
          </Link>
        </div>
        <p className="text-sm italic text-neutral-500">{c.updated}</p>
        {c.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <p>
          {c.termsIntro}{" "}
          <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" className={linkClass}>
            {c.terms[0]}
          </a>
          ,{" "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className={linkClass}>
            {c.terms[1]}
          </a>
          .
        </p>
        <p>
          {c.revoke}{" "}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className={linkClass}>
            {c.revokeLabel}
          </a>
          .
        </p>
        <p>
          {c.contact}{" "}
          <a href="mailto:salift@roogobf.com" className={linkClass}>
            salift@roogobf.com
          </a>
        </p>
      </div>
    </main>
  );
}
