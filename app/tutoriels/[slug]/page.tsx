import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  LightbulbIcon,
  ListChecksIcon,
  QuestionIcon,
  WrenchIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Footer } from "@/components/Footer";
import JsonLd from "@/components/JsonLd";
import {
  TrackedTutorialLink,
  TutorialAnalytics,
} from "@/components/tutorials/TutorialAnalytics";
import { TutorialVideo } from "@/components/tutorials/TutorialVideo";
import { SITE_URL } from "@/lib/schemas";
import {
  getTutorial,
  getTutorialPath,
  getYouTubeThumbnail,
  TUTORIAL_PLAYLIST_URL,
  tutorials,
} from "@/lib/tutorials";

type TutorialPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return tutorials.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: TutorialPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tutorial = getTutorial(slug);
  if (!tutorial) return {};

  const path = getTutorialPath(tutorial);
  const primary = tutorial.videos.horizontal.alimata;
  const thumbnail = getYouTubeThumbnail(primary.id);

  return {
    title: tutorial.metaTitle,
    description: tutorial.metaDescription,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      locale: "fr_BF",
      url: `${SITE_URL}${path}`,
      title: tutorial.metaTitle,
      description: tutorial.metaDescription,
      images: [{ url: thumbnail, width: 1280, height: 720, alt: tutorial.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: tutorial.metaTitle,
      description: tutorial.metaDescription,
      images: [thumbnail],
    },
  };
}

function buildSchemas(tutorial: NonNullable<ReturnType<typeof getTutorial>>) {
  const pageUrl = `${SITE_URL}${getTutorialPath(tutorial)}`;
  const primary = tutorial.videos.horizontal.alimata;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Accueil", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
          { "@type": "ListItem", position: 3, name: "Tutoriels", item: `${SITE_URL}/blog/tutoriels` },
          { "@type": "ListItem", position: 4, name: tutorial.title, item: pageUrl },
        ],
      },
      {
        "@type": "VideoObject",
        name: primary.title,
        description: tutorial.description,
        thumbnailUrl: [getYouTubeThumbnail(primary.id)],
        uploadDate: primary.uploadDate,
        embedUrl: `https://www.youtube-nocookie.com/embed/${primary.id}`,
        contentUrl: primary.url,
        inLanguage: "fr-BF",
      },
      {
        "@type": "HowTo",
        name: tutorial.title,
        description: tutorial.description,
        inLanguage: "fr-BF",
        step: tutorial.steps.map((step, index) => ({
          "@type": "HowToStep",
          position: index + 1,
          name: step.name,
          text: step.text,
          url: `${pageUrl}#etape-${index + 1}`,
        })),
      },
      {
        "@type": "FAQPage",
        mainEntity: tutorial.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
      },
    ],
  };
}

export default async function TutorialArticlePage({ params }: TutorialPageProps) {
  const { slug } = await params;
  const tutorial = getTutorial(slug);
  if (!tutorial) notFound();

  const related = tutorials.find((item) => item.slug !== tutorial.slug)!;

  return (
    <div className="min-h-screen bg-white">
      <TutorialAnalytics
        event="tutorial_opened"
        tutorialSlug={tutorial.slug}
        topic={tutorial.topic}
        sourceScreen="tutorial_article"
      />
      <JsonLd schema={buildSchemas(tutorial)} />

      <main>
        <header className="border-b border-[#eadbc9] bg-[#fbf7f2] px-6 pb-16 pt-36 sm:pt-44">
          <div className="mx-auto max-w-5xl">
            <nav aria-label="Fil d'Ariane" className="flex flex-wrap items-center gap-2 text-sm font-bold text-neutral-500">
              <Link href="/" className="hover:text-primary">Accueil</Link>
              <span aria-hidden="true">/</span>
              <Link href="/blog" className="hover:text-primary">Blog</Link>
              <span aria-hidden="true">/</span>
              <Link href="/blog/tutoriels" className="hover:text-primary">Tutoriels</Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page" className="text-neutral-900">{tutorial.eyebrow}</span>
            </nav>

            <Link href="/blog/tutoriels" className="mt-10 inline-flex items-center gap-2 text-sm font-black text-primary hover:text-primary-hover">
              <ArrowLeftIcon size={17} weight="bold" />
              Tous les tutoriels
            </Link>
            <p className="mt-8 text-sm font-black uppercase tracking-[0.16em] text-primary">{tutorial.eyebrow}</p>
            <h1 className="mt-3 max-w-4xl text-4xl font-black leading-tight tracking-tight text-neutral-900 sm:text-6xl">{tutorial.title}</h1>
            <p className="mt-6 max-w-3xl text-lg font-medium leading-8 text-neutral-600 sm:text-xl">{tutorial.description}</p>
          </div>
        </header>

        <div className="mx-auto max-w-5xl space-y-20 px-6 py-16 sm:py-20">
          <TutorialVideo tutorial={tutorial} />

          <article className="space-y-20">
            <section aria-labelledby="prerequisites-heading" className="rounded-[28px] border border-[#eadbc9] bg-[#fff9f3] p-7 sm:p-10">
              <div className="flex items-center gap-3">
                <ListChecksIcon size={30} weight="fill" className="text-primary" />
                <h2 id="prerequisites-heading" className="text-2xl font-black text-neutral-900">Avant de commencer</h2>
              </div>
              <ul className="mt-7 grid gap-4 sm:grid-cols-2">
                {tutorial.prerequisites.map((item) => (
                  <li key={item} className="flex items-start gap-3 font-medium leading-7 text-neutral-700">
                    <CheckCircleIcon size={21} weight="fill" className="mt-1 shrink-0 text-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="steps-heading">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-primary">Guide détaillé</p>
              <h2 id="steps-heading" className="mt-2 text-3xl font-black text-neutral-900 sm:text-4xl">Les étapes dans l&apos;application</h2>
              <div className="mt-10 space-y-5">
                {tutorial.steps.map((step, index) => (
                  <section id={`etape-${index + 1}`} key={step.name} className="scroll-mt-32 rounded-[24px] border border-neutral-200 p-6 sm:flex sm:gap-6 sm:p-8">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary font-black text-white">{index + 1}</div>
                    <div className="mt-4 sm:mt-0">
                      <h3 className="text-xl font-black text-neutral-900">{step.name}</h3>
                      <p className="mt-3 font-medium leading-7 text-neutral-600">{step.text}</p>
                    </div>
                  </section>
                ))}
              </div>
            </section>

            <section aria-labelledby="guidance-heading" className="rounded-[28px] bg-neutral-900 p-7 text-white sm:p-10">
              <div className="flex items-center gap-3">
                <LightbulbIcon size={30} weight="fill" className="text-[#ef9b62]" />
                <h2 id="guidance-heading" className="text-2xl font-black">{tutorial.guidance.title}</h2>
              </div>
              <div className="mt-7 space-y-5 font-medium leading-8 text-white/75">
                {tutorial.guidance.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
              {tutorial.guidance.items && (
                <ul className="mt-7 space-y-3">
                  {tutorial.guidance.items.map((item) => (
                    <li key={item} className="flex items-start gap-3 font-semibold leading-7 text-white/85">
                      <CheckCircleIcon size={20} weight="fill" className="mt-1 shrink-0 text-[#ef9b62]" />
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="troubleshooting-heading">
              <div className="flex items-center gap-3">
                <WrenchIcon size={29} weight="fill" className="text-primary" />
                <h2 id="troubleshooting-heading" className="text-3xl font-black text-neutral-900">En cas de difficulté</h2>
              </div>
              <div className="mt-8 grid gap-5 md:grid-cols-3">
                {tutorial.troubleshooting.map((item) => (
                  <section key={item.question} className="rounded-[24px] border border-neutral-200 p-6">
                    <h3 className="font-black leading-6 text-neutral-900">{item.question}</h3>
                    <p className="mt-3 text-sm font-medium leading-6 text-neutral-600">{item.answer}</p>
                  </section>
                ))}
              </div>
            </section>

            <section aria-labelledby="faq-heading">
              <div className="flex items-center gap-3">
                <QuestionIcon size={30} weight="fill" className="text-primary" />
                <h2 id="faq-heading" className="text-3xl font-black text-neutral-900">Questions fréquentes</h2>
              </div>
              <div className="mt-8 divide-y divide-neutral-200 border-y border-neutral-200">
                {tutorial.faqs.map((faq) => (
                  <section key={faq.question} className="py-7">
                    <h3 className="text-lg font-black text-neutral-900">{faq.question}</h3>
                    <p className="mt-3 max-w-3xl font-medium leading-7 text-neutral-600">{faq.answer}</p>
                  </section>
                ))}
              </div>
            </section>

            <section aria-labelledby="next-heading" className="rounded-[32px] bg-[#fbf7f2] p-7 sm:p-10">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-primary">Passer à l&apos;action</p>
              <h2 id="next-heading" className="mt-2 text-3xl font-black text-neutral-900">{tutorial.cta.description}</h2>
              <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center">
                <TrackedTutorialLink
                  href={tutorial.cta.href}
                  event="tutorial_article_cta_clicked"
                  tutorialSlug={tutorial.slug}
                  topic={tutorial.topic}
                  sourceScreen="tutorial_article_cta"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 font-black text-white hover:bg-primary-hover"
                >
                  {tutorial.cta.label}
                  <ArrowRightIcon size={18} weight="bold" />
                </TrackedTutorialLink>
                <a href={TUTORIAL_PLAYLIST_URL} target="_blank" rel="noopener noreferrer" className="font-black text-neutral-700 hover:text-primary">Voir la playlist complète</a>
              </div>
            </section>

            <aside aria-labelledby="related-heading" className="border-t border-neutral-200 pt-10">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-primary">Tutoriel suivant</p>
              <h2 id="related-heading" className="mt-2 text-2xl font-black text-neutral-900">{related.title}</h2>
              <TrackedTutorialLink
                href={getTutorialPath(related)}
                event="tutorial_opened"
                tutorialSlug={related.slug}
                topic={related.topic}
                sourceScreen="tutorial_related_link"
                className="mt-4 inline-flex items-center gap-2 font-black text-primary hover:text-primary-hover"
              >
                Lire le guide associé
                <ArrowRightIcon size={18} weight="bold" />
              </TrackedTutorialLink>
            </aside>
          </article>
        </div>
      </main>

      <Footer />
    </div>
  );
}
