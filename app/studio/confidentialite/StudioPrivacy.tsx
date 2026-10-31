import Link from "next/link";

// Roogo Studio privacy note for the YouTube API Services audit (2026-10-24,
// decided by Salif) and the TikTok Content Posting API audit (TikTok section
// added 2026-10-31). Public, unlinked, noindex, not in the sitemap: the
// customer privacy policy and terms do not mention YouTube or TikTok.

type Section = {
  heading: string;
  lines: readonly string[];
  terms: readonly { label: string; href: string }[];
  revoke: { label: string; href?: string };
};

const COPY = {
  fr: {
    title: "Roogo Studio : confidentialité (outil interne)",
    updated: "Mise à jour : 31 octobre 2026",
    other: { href: "/studio/confidentialite/en", label: "English" },
    intro: [
      "Roogo Studio est l'outil interne de Roogo. Il est utilisé uniquement par l'équipe Roogo. Il publie les vidéos de Roogo sur les comptes de Roogo, après validation par le fondateur.",
      "Aucune donnée d'autres comptes ou de tiers n'est utilisée.",
    ],
    sections: [
      {
        heading: "YouTube",
        lines: [
          "L'accès Google est une application OAuth de type « Interne » : seuls les comptes de l'équipe Roogo peuvent l'autoriser.",
          "Roogo Studio utilise les Services d'API YouTube pour publier les vidéos de Roogo sur la chaîne YouTube de Roogo et lire les statistiques de cette chaîne.",
          "Données utilisées : les statistiques de la chaîne de Roogo et les vidéos que Roogo publie.",
          "Les jetons de connexion et les statistiques en cache sont supprimés lorsque la connexion YouTube est retirée dans Roogo Studio. Le nombre quotidien d'abonnés de la chaîne de Roogo est conservé comme historique des objectifs internes.",
        ],
        terms: [
          { label: "Conditions d'utilisation de YouTube", href: "https://www.youtube.com/t/terms" },
          { label: "Règles de confidentialité de Google", href: "https://policies.google.com/privacy" },
        ],
        revoke: { label: "autorisations du compte Google", href: "https://myaccount.google.com/permissions" },
      },
      {
        heading: "TikTok",
        lines: [
          "Roogo Studio utilise Login Kit et la Content Posting API de TikTok pour publier les vidéos de Roogo sur le compte TikTok de Roogo et lire les statistiques de ce compte (profil, abonnés, mentions J'aime, vidéos récentes).",
          "Avant chaque publication, le fondateur voit le compte connecté et choisit la visibilité, les interactions autorisées (commentaires, Duo, Collage) et la déclaration de contenu commercial. Ces choix sont enregistrés avec la publication et envoyés tels quels à TikTok.",
          "Données utilisées : le profil et les statistiques du compte TikTok de Roogo, et les vidéos que Roogo publie.",
          "Les jetons TikTok sont chiffrés. Ils sont révoqués auprès de TikTok et supprimés lorsque la connexion TikTok est retirée dans Roogo Studio. Le nombre quotidien d'abonnés du compte de Roogo est conservé comme historique des objectifs internes.",
        ],
        terms: [
          { label: "Conditions d'utilisation de TikTok", href: "https://www.tiktok.com/legal/page/global/terms-of-service/fr" },
          { label: "Politique de confidentialité de TikTok", href: "https://www.tiktok.com/legal/page/row/privacy-policy/fr" },
        ],
        revoke: { label: "dans l'application TikTok, paramètres de sécurité, applications autorisées" },
      },
    ] satisfies Section[],
    termsIntro: "En savoir plus :",
    revoke: "Révoquer l'accès :",
    contact: "Contact :",
  },
  en: {
    title: "Roogo Studio: privacy (internal tool)",
    updated: "Updated: October 31, 2026",
    other: { href: "/studio/confidentialite", label: "Français" },
    intro: [
      "Roogo Studio is Roogo's internal tool. It is used only by Roogo staff. It publishes Roogo's own videos to Roogo's own accounts, after the founder approves them.",
      "No data from other accounts or third parties is used.",
    ],
    sections: [
      {
        heading: "YouTube",
        lines: [
          "Google access is an OAuth app with the « Internal » audience: only Roogo staff accounts can authorize it.",
          "Roogo Studio uses YouTube API Services to publish Roogo's own videos to Roogo's own YouTube channel and to read that channel's statistics.",
          "Data used: Roogo's channel statistics and the videos Roogo publishes.",
          "Connection tokens and cached statistics are deleted when the YouTube connection is removed in Roogo Studio. The daily subscriber count of Roogo's own channel is kept as internal goal history.",
        ],
        terms: [
          { label: "YouTube Terms of Service", href: "https://www.youtube.com/t/terms" },
          { label: "Google Privacy Policy", href: "https://policies.google.com/privacy" },
        ],
        revoke: { label: "Google Account permissions", href: "https://myaccount.google.com/permissions" },
      },
      {
        heading: "TikTok",
        lines: [
          "Roogo Studio uses TikTok Login Kit and the Content Posting API to publish Roogo's own videos to Roogo's own TikTok account and to read that account's statistics (profile, followers, likes, recent videos).",
          "Before each post, the founder sees the connected account and chooses the visibility, the allowed interactions (comments, Duet, Stitch) and the commercial content disclosure. These choices are saved with the post and sent to TikTok as chosen.",
          "Data used: the profile and statistics of Roogo's TikTok account, and the videos Roogo publishes.",
          "TikTok tokens are encrypted. They are revoked with TikTok and deleted when the TikTok connection is removed in Roogo Studio. The daily follower count of Roogo's own account is kept as internal goal history.",
        ],
        terms: [
          { label: "TikTok Terms of Service", href: "https://www.tiktok.com/legal/page/global/terms-of-service/en" },
          { label: "TikTok Privacy Policy", href: "https://www.tiktok.com/legal/page/row/privacy-policy/en" },
        ],
        revoke: { label: "in the TikTok app, security settings, authorized apps" },
      },
    ] satisfies Section[],
    termsIntro: "Learn more:",
    revoke: "Revoke access:",
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
        {c.intro.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {c.sections.map((section) => (
          <section key={section.heading} className="space-y-4 pt-4">
            <h2 className="text-lg font-semibold text-neutral-900">{section.heading}</h2>
            {section.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
            <p>
              {c.termsIntro}{" "}
              {section.terms.map((term, i) => (
                <span key={term.href}>
                  {i > 0 && ", "}
                  <a href={term.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    {term.label}
                  </a>
                </span>
              ))}
              .
            </p>
            <p>
              {c.revoke}{" "}
              {section.revoke.href ? (
                <a href={section.revoke.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  {section.revoke.label}
                </a>
              ) : (
                section.revoke.label
              )}
              .
            </p>
          </section>
        ))}
        <p className="pt-4">
          {c.contact}{" "}
          <a href="mailto:salift@roogobf.com" className={linkClass}>
            salift@roogobf.com
          </a>
        </p>
      </div>
    </main>
  );
}
