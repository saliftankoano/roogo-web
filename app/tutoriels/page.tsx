import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRightIcon,
  BookOpenTextIcon,
  PlayCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Footer } from "@/components/Footer";
import JsonLd from "@/components/JsonLd";
import {
  TrackedTutorialLink,
  TutorialAnalytics,
} from "@/components/tutorials/TutorialAnalytics";
import {
  getTutorialPath,
  getYouTubeThumbnail,
  TUTORIAL_PLAYLIST_URL,
  tutorials,
} from "@/lib/tutorials";
import { SITE_URL } from "@/lib/schemas";

export const metadata: Metadata = {
  title: "Tutoriels et aide pour les propriétaires",
  description:
    "Apprenez à créer votre compte propriétaire et à mettre un bien en vente sur Roogo grâce à nos vidéos et guides en français.",
  alternates: { canonical: "/blog/tutoriels" },
  openGraph: {
    type: "website",
    locale: "fr_BF",
    url: `${SITE_URL}/blog/tutoriels`,
    title: "Tutoriels Roogo pour les propriétaires",
    description:
      "Deux guides pratiques pour créer votre compte et proposer un bien immobilier à la vente depuis votre téléphone.",
    images: [
      {
        url: getYouTubeThumbnail(tutorials[0].videos.horizontal.alimata.id),
        width: 1280,
        height: 720,
        alt: "Tutoriels vidéo Roogo pour propriétaires",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tutoriels Roogo pour les propriétaires",
    description:
      "Créez votre compte et apprenez à mettre un bien en vente sur Roogo.",
    images: [getYouTubeThumbnail(tutorials[0].videos.horizontal.alimata.id)],
  },
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Accueil",
      item: SITE_URL,
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Tutoriels",
      item: `${SITE_URL}/blog`,
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "Tutoriels",
      item: `${SITE_URL}/blog/tutoriels`,
    },
  ],
};

export default function TutorialsPage() {
  return (
    <div className="min-h-screen bg-[#fbf7f2]">
      <TutorialAnalytics event="tutorial_list_viewed" sourceScreen="blog_tutorial_category" />
      <JsonLd schema={breadcrumbSchema} />

      <main>
        <section className="border-b border-[#eadbc9] bg-[radial-gradient(circle_at_top_right,_rgba(201,106,46,0.18),_transparent_38%)] px-6 pb-20 pt-36 sm:pt-44">
          <div className="mx-auto max-w-6xl">
            <nav aria-label="Fil d'Ariane" className="text-sm font-bold text-neutral-500">
              <Link href="/" className="hover:text-primary">Accueil</Link>
              <span aria-hidden="true" className="mx-2">/</span>
              <Link href="/blog" className="hover:text-primary">Blog</Link>
              <span aria-hidden="true" className="mx-2">/</span>
              <span aria-current="page" className="text-neutral-900">Tutoriels</span>
            </nav>

            <div className="mt-12 max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white px-4 py-2 text-sm font-black text-primary shadow-sm">
                <BookOpenTextIcon size={20} weight="fill" />
                Catégorie · Tutoriels
              </div>
              <h1 className="mt-6 text-4xl font-black leading-tight tracking-tight text-neutral-900 sm:text-6xl">
                Apprendre à utiliser Roogo, une étape à la fois
              </h1>
              <p className="mt-6 max-w-2xl text-lg font-medium leading-8 text-neutral-600 sm:text-xl">
                Retrouvez ici les vidéos et guides pratiques pour créer votre compte propriétaire et proposer un bien à la vente depuis votre téléphone.
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="tutorials-heading" className="px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.16em] text-primary">Guides disponibles</p>
                <h2 id="tutorials-heading" className="mt-2 text-3xl font-black text-neutral-900">Que voulez-vous faire ?</h2>
              </div>
              <p className="max-w-md text-sm font-semibold leading-6 text-neutral-500">
                Chaque sujet réunit une vidéo courte et un guide détaillé que vous pouvez consulter sans compte.
              </p>
            </div>

            <div className="mt-10 grid gap-8 lg:grid-cols-2">
              {tutorials.map((tutorial) => {
                const primary = tutorial.videos.horizontal.alimata;

                return (
                  <article key={tutorial.slug} className="group overflow-hidden rounded-[32px] border border-[#eadbc9] bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
                    <div className="relative aspect-video overflow-hidden bg-neutral-900">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getYouTubeThumbnail(primary.id)}
                        alt={`Aperçu vidéo : ${tutorial.title}`}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                      <div className="absolute bottom-5 left-5 inline-flex items-center gap-2 rounded-full bg-black/75 px-4 py-2 text-sm font-bold text-white backdrop-blur">
                        <PlayCircleIcon size={20} weight="fill" />
                        Vidéo et guide
                      </div>
                    </div>

                    <div className="p-7 sm:p-9">
                      <p className="text-sm font-black uppercase tracking-[0.14em] text-primary">{tutorial.eyebrow}</p>
                      <h3 className="mt-3 text-2xl font-black leading-tight text-neutral-900">{tutorial.title}</h3>
                      <p className="mt-4 font-medium leading-7 text-neutral-600">{tutorial.summary}</p>
                      <TrackedTutorialLink
                        href={getTutorialPath(tutorial)}
                        event="tutorial_opened"
                        tutorialSlug={tutorial.slug}
                        topic={tutorial.topic}
                        sourceScreen="tutorial_index_card"
                        className="mt-7 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-black text-white transition hover:bg-primary-hover"
                      >
                        Voir le tutoriel
                        <ArrowRightIcon size={18} weight="bold" />
                      </TrackedTutorialLink>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="mt-12 rounded-[28px] border border-[#eadbc9] bg-[#fff9f3] p-7 sm:flex sm:items-center sm:justify-between sm:p-9">
              <div>
                <h2 className="text-xl font-black text-neutral-900">Toutes les vidéos Roogo au même endroit</h2>
                <p className="mt-2 font-medium leading-7 text-neutral-600">La playlist publique rassemble les différentes voix et formats des tutoriels.</p>
              </div>
              <a
                href={TUTORIAL_PLAYLIST_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center gap-2 font-black text-primary hover:text-primary-hover sm:mt-0"
              >
                Ouvrir la playlist
                <ArrowRightIcon size={18} weight="bold" />
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
