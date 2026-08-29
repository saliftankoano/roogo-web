import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRightIcon,
  BookOpenTextIcon,
  ClockIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Footer } from "@/components/Footer";
import JsonLd from "@/components/JsonLd";
import {
  TrackedTutorialLink,
  TutorialAnalytics,
} from "@/components/tutorials/TutorialAnalytics";
import {
  blogCategories,
  blogPosts,
  formatBlogDate,
} from "@/lib/blog";
import { SITE_URL } from "@/lib/schemas";

export const metadata: Metadata = {
  title: "Blog immobilier, conseils et tutoriels",
  description:
    "Guides, tutoriels et conseils pratiques de Roogo pour les propriétaires, locataires et professionnels de l'immobilier au Burkina Faso.",
  alternates: { canonical: "/blog" },
  openGraph: {
    type: "website",
    locale: "fr_BF",
    url: `${SITE_URL}/blog`,
    title: "Le blog Roogo",
    description:
      "Des ressources pratiques pour mieux comprendre et utiliser Roogo.",
    images: [
      {
        url: blogPosts[0].thumbnailUrl,
        width: 1280,
        height: 720,
        alt: "Guides et tutoriels du blog Roogo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Le blog Roogo",
    description:
      "Guides, tutoriels et conseils immobiliers pratiques au Burkina Faso.",
    images: [blogPosts[0].thumbnailUrl],
  },
};

const schemas = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Accueil", item: SITE_URL },
        {
          "@type": "ListItem",
          position: 2,
          name: "Blog",
          item: `${SITE_URL}/blog`,
        },
      ],
    },
    {
      "@type": "Blog",
      name: "Le blog Roogo",
      description:
        "Guides, tutoriels et conseils immobiliers de Roogo Burkina Faso.",
      url: `${SITE_URL}/blog`,
      inLanguage: "fr-BF",
      blogPost: blogPosts.map((post) => ({
        "@type": "BlogPosting",
        headline: post.title,
        description: post.excerpt,
        datePublished: post.publishedAt,
        url: `${SITE_URL}${post.href}`,
        image: post.thumbnailUrl,
      })),
    },
  ],
};

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-[#fbf7f2]">
      <TutorialAnalytics event="tutorial_list_viewed" sourceScreen="blog_index" />
      <JsonLd schema={schemas} />

      <main>
        <header className="border-b border-[#eadbc9] bg-[radial-gradient(circle_at_top_right,_rgba(201,106,46,0.2),_transparent_40%)] px-6 pb-20 pt-36 sm:pt-44">
          <div className="mx-auto max-w-6xl">
            <nav aria-label="Fil d'Ariane" className="text-sm font-bold text-neutral-500">
              <Link href="/" className="hover:text-primary">Accueil</Link>
              <span aria-hidden="true" className="mx-2">/</span>
              <span aria-current="page" className="text-neutral-900">Blog</span>
            </nav>

            <div className="mt-12 max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white px-4 py-2 text-sm font-black text-primary shadow-sm">
                <BookOpenTextIcon size={20} weight="fill" />
                Le blog Roogo
              </div>
              <h1 className="mt-6 text-4xl font-black leading-tight tracking-tight text-neutral-900 sm:text-6xl">
                Des ressources pour avancer dans votre projet immobilier
              </h1>
              <p className="mt-6 max-w-2xl text-lg font-medium leading-8 text-neutral-600 sm:text-xl">
                Tutoriels, guides et conseils pratiques pour mieux utiliser Roogo et prendre des décisions immobilières plus sereinement.
              </p>
            </div>
          </div>
        </header>

        <section aria-labelledby="categories-heading" className="px-6 pt-14">
          <div className="mx-auto max-w-6xl">
            <h2 id="categories-heading" className="text-sm font-black uppercase tracking-[0.16em] text-neutral-500">Explorer par catégorie</h2>
            <div className="mt-5 flex flex-wrap gap-3">
              {blogCategories.map((category) => (
                <Link
                  key={category.slug}
                  href={category.href}
                  className="rounded-full border border-[#dfcbb5] bg-white px-5 py-2.5 font-black text-neutral-800 shadow-sm transition hover:border-primary hover:text-primary"
                >
                  {category.name}
                  <span className="ml-2 text-neutral-400">{blogPosts.filter((post) => post.category.slug === category.slug).length}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="recent-heading" className="px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.16em] text-primary">À lire maintenant</p>
                <h2 id="recent-heading" className="mt-2 text-3xl font-black text-neutral-900">Articles récents</h2>
              </div>
              <Link href="/blog/tutoriels" className="inline-flex items-center gap-2 font-black text-primary hover:text-primary-hover">
                Tous les tutoriels
                <ArrowRightIcon size={18} weight="bold" />
              </Link>
            </div>

            <div className="mt-10 grid gap-8 lg:grid-cols-2">
              {blogPosts.map((post) => (
                <article key={post.slug} className="group overflow-hidden rounded-[30px] border border-[#eadbc9] bg-white shadow-sm transition hover:shadow-xl">
                  <Link href={post.href} className="block">
                    <div className="relative aspect-video overflow-hidden bg-neutral-900">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={post.thumbnailUrl}
                        alt={`Aperçu de l'article : ${post.title}`}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.015]"
                      />
                      <span className="absolute left-5 top-5 rounded-full bg-white/95 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-primary shadow-sm">
                        {post.category.name}
                      </span>
                    </div>
                  </Link>

                  <div className="p-7 sm:p-9">
                    <div className="flex flex-wrap items-center gap-4 text-sm font-semibold text-neutral-500">
                      <time dateTime={post.publishedAt}>{formatBlogDate(post.publishedAt)}</time>
                      <span className="inline-flex items-center gap-1.5">
                        <ClockIcon size={17} weight="bold" />
                        {post.readingTimeMinutes} min de lecture
                      </span>
                    </div>
                    <h3 className="mt-4 text-2xl font-black leading-tight text-neutral-900">{post.title}</h3>
                    <p className="mt-4 font-medium leading-7 text-neutral-600">{post.excerpt}</p>
                    <TrackedTutorialLink
                      href={post.href}
                      event="tutorial_opened"
                      tutorialSlug={post.slug}
                      topic={post.tutorial.topic}
                      sourceScreen="blog_index_card"
                      className="mt-7 inline-flex items-center gap-2 font-black text-primary hover:text-primary-hover"
                    >
                      Lire l&apos;article
                      <ArrowRightIcon size={18} weight="bold" />
                    </TrackedTutorialLink>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
