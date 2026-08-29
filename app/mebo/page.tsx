import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  CubeIcon,
  FilePdfIcon,
  HouseLineIcon,
  PlayCircleIcon,
  ShieldCheckIcon,
  StorefrontIcon,
} from "@phosphor-icons/react/dist/ssr";
import { MeboHeader } from "@/components/mebo/MeboHeader";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const collections = [
  {
    label: "Maisons compactes",
    note: "Pour tirer le meilleur d’une parcelle maîtrisée",
    image: "/marketing/roogo-final-cta-courtyard.jpg",
  },
  {
    label: "Villas familiales",
    note: "Des espaces pensés pour évoluer avec la famille",
    image: "/marketing/roogo-hero-dusk-home.jpg",
  },
  {
    label: "Duplexes",
    note: "Plus de volume, sans perdre la clarté du plan",
    image: "/marketing/roogo-neighborhood-golden-hour.jpg",
  },
  {
    label: "Locaux & projets",
    note: "Des concepts adaptés aux usages professionnels",
    image: "/marketing/roogo-commercial-space.jpg",
  },
];

const deliverables = [
  { icon: PlayCircleIcon, label: "Vidéo 3D", detail: "Voir le projet sous plusieurs angles" },
  { icon: CubeIcon, label: "Rendus", detail: "Comprendre les volumes et les matériaux" },
  { icon: FilePdfIcon, label: "Dossier PDF", detail: "Savoir exactement quels documents sont inclus" },
];

export default function MeboHomePage() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#f3eee7] text-[#1b1612]">
      <MeboHeader />

      <main>
        <section className="relative min-h-[820px] bg-[#100c09] px-4 pb-8 pt-4 sm:px-6 sm:pb-10 sm:pt-6">
          <div className="relative mx-auto min-h-[780px] max-w-[1520px] overflow-hidden rounded-[32px] border border-white/10 sm:rounded-[42px]">
            <Image
              src="/marketing/roogo-mebo-hero-v1.png"
              alt="Visualisation architecturale d’une maison contemporaine en terre et pierre à la tombée du jour"
              fill
              priority
              sizes="100vw"
              className="object-cover object-[64%_center]"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,8,6,0.93)_0%,rgba(10,8,6,0.78)_32%,rgba(10,8,6,0.28)_64%,rgba(10,8,6,0.2)_100%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,6,4,0.28),transparent_36%,rgba(8,6,4,0.78))]" />

            <div className="relative z-10 flex min-h-[780px] flex-col justify-end px-6 pb-10 pt-32 sm:px-10 sm:pb-12 lg:px-16 lg:pb-16">
              <div className="max-w-3xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#f1c29d] backdrop-blur-md">
                  <span className="size-2 rounded-full bg-[#e58b50]" />
                  Ouverture prochaine
                </span>
                <h1 className="mt-7 max-w-3xl text-5xl font-black leading-[0.94] tracking-[-0.055em] text-white sm:text-7xl lg:text-[88px]">
                  Le plan qui donne envie de bâtir.
                </h1>
                <p className="mt-7 max-w-xl text-base font-semibold leading-8 text-white/68 sm:text-lg">
                  Découvrez des maisons à travers leurs rendus, vidéos 3D et
                  documents. Comparez les créations, connaissez le prix et
                  achetez auprès d’architectes et d’entreprises.
                </p>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="#collections"
                    className="inline-flex h-14 items-center justify-center gap-3 rounded-full bg-[#d7793f] px-7 text-sm font-black text-white shadow-xl shadow-black/25 transition hover:bg-[#e28a50] active:scale-[0.985]"
                  >
                    Explorer les styles
                    <ArrowRightIcon size={20} weight="bold" />
                  </Link>
                  <Link
                    href="#fonctionnement"
                    className="inline-flex h-14 items-center justify-center rounded-full border border-white/20 bg-white/10 px-7 text-sm font-black text-white backdrop-blur-md transition hover:bg-white/15"
                  >
                    Voir ce que l’on achète
                  </Link>
                </div>
              </div>

              <div className="mt-12 grid max-w-3xl gap-3 sm:grid-cols-3">
                {[
                  ["01", "Des prix affichés"],
                  ["02", "Des livrables clairs"],
                  ["03", "Des créateurs identifiés"],
                ].map(([number, label]) => (
                  <div key={number} className="rounded-2xl border border-white/12 bg-black/25 px-4 py-4 backdrop-blur-md">
                    <span className="text-xs font-black text-[#e8a36c]">{number}</span>
                    <p className="mt-1 text-sm font-black text-white">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="collections" className="px-5 py-20 sm:px-8 sm:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b65e2d]">Commencer par une envie</p>
                <h2 className="mt-4 max-w-xl text-4xl font-black leading-[1.02] tracking-[-0.045em] sm:text-6xl">
                  Moins de catalogues froids. Plus de projets à ressentir.
                </h2>
              </div>
              <p className="max-w-2xl text-base font-semibold leading-8 text-[#6f6258] lg:justify-self-end">
                La découverte commence par l’image et la vidéo. Les détails
                techniques arrivent ensuite, au bon moment, pour transformer un
                coup de cœur en décision comprise.
              </p>
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-2">
              {collections.map((collection, index) => (
                <article
                  key={collection.label}
                  className={`group relative aspect-[4/3] overflow-hidden rounded-[30px] bg-[#211913] ${index === 0 || index === 3 ? "md:aspect-[1.45/1]" : "md:aspect-[1.1/1]"}`}
                >
                  <Image
                    src={collection.image}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-cover transition duration-300 group-hover:scale-[1.015]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                    <span className="rounded-full border border-white/15 bg-black/25 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-white/65 backdrop-blur-md">
                      Collection à venir
                    </span>
                    <h3 className="mt-4 text-3xl font-black tracking-[-0.035em] text-white">{collection.label}</h3>
                    <p className="mt-2 max-w-md text-sm font-semibold leading-6 text-white/65">{collection.note}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="fonctionnement" className="bg-[#19130f] px-5 py-20 text-white sm:px-8 sm:py-28">
          <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#e08a52]">Du rendu au dossier</p>
              <h2 className="mt-4 max-w-xl text-4xl font-black leading-[1.02] tracking-[-0.045em] sm:text-6xl">
                Beau à regarder. Clair à acheter.
              </h2>
              <p className="mt-6 max-w-xl text-base font-semibold leading-8 text-white/55">
                Chaque fiche distinguera la visualisation commerciale des
                documents réellement inclus. Vous verrez le prix, la licence et
                les livrables avant de payer.
              </p>

              <div className="mt-9 grid gap-3">
                {deliverables.map((item) => (
                  <div key={item.label} className="grid grid-cols-[48px_1fr] gap-4 rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                    <span className="grid size-12 place-items-center rounded-xl bg-[#d7793f]/15 text-[#ef9f6d]">
                      <item.icon size={24} weight="duotone" />
                    </span>
                    <div>
                      <h3 className="font-black">{item.label}</h3>
                      <p className="mt-1 text-sm font-medium leading-6 text-white/50">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[34px] border border-white/10 bg-[#241b15] p-3 shadow-2xl shadow-black/35">
              <div className="rounded-[27px] bg-[#eee5d9] p-5 text-[#1b1612] sm:p-8">
                <div className="flex items-center justify-between gap-4 border-b border-[#d7c8b8] pb-5">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.17em] text-[#a0522b]">Exemple de contenu</p>
                    <h3 className="mt-2 text-2xl font-black tracking-[-0.035em]">Dossier Essentiel</h3>
                  </div>
                  <span className="rounded-full bg-[#1b1612] px-4 py-2 text-xs font-black text-white">PDF protégé</span>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {[
                    "Plan de distribution",
                    "Façades principales",
                    "Coupes indiquées",
                    "Tableau des surfaces",
                  ].map((label) => (
                    <div key={label} className="flex items-center gap-3 rounded-2xl bg-white/70 p-4 text-sm font-bold">
                      <CheckCircleIcon size={20} weight="fill" className="shrink-0 text-[#c96a2e]" />
                      {label}
                    </div>
                  ))}
                </div>
                <div className="mt-5 rounded-2xl border border-[#d7c8b8] bg-[#e5d8c9] p-5">
                  <div className="flex items-center gap-3">
                    <ShieldCheckIcon size={25} weight="duotone" className="text-[#8a4924]" />
                    <p className="text-sm font-black">Concept ≠ autorisation de construire</p>
                  </div>
                  <p className="mt-3 text-sm font-medium leading-6 text-[#6c5b4f]">
                    Le niveau technique et les adaptations nécessaires seront
                    indiqués sans ambiguïté sur chaque produit.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="createurs" className="px-5 py-20 sm:px-8 sm:py-28">
          <div className="mx-auto grid max-w-7xl overflow-hidden rounded-[36px] bg-[#d7773d] lg:grid-cols-[1.05fr_0.95fr]">
            <div className="flex flex-col justify-center p-8 sm:p-12 lg:p-16">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-white/15 text-white">
                <StorefrontIcon size={27} weight="duotone" />
              </div>
              <p className="mt-8 text-xs font-black uppercase tracking-[0.18em] text-white/65">Architectes & entreprises</p>
              <h2 className="mt-4 max-w-xl text-4xl font-black leading-[1.02] tracking-[-0.045em] text-white sm:text-6xl">
                Vos idées méritent mieux qu’un post perdu.
              </h2>
              <p className="mt-6 max-w-xl text-base font-semibold leading-8 text-white/72">
                Présentez vos plans avec un prix, une vidéo, des livrables clairs
                et un profil professionnel. Nous préparons le premier groupe de
                créateurs Roogo Mêbo.
              </p>
              <a
                href="mailto:bonjour@roogobf.com?subject=Candidature%20vendeur%20Roogo%20M%C3%AAbo"
                className="mt-9 inline-flex h-14 w-fit items-center gap-3 rounded-full bg-[#18120e] px-7 text-sm font-black text-white transition hover:bg-black active:scale-[0.985]"
              >
                Rejoindre les premiers créateurs
                <ArrowRightIcon size={20} weight="bold" />
              </a>
            </div>
            <div className="relative min-h-[420px] lg:min-h-[640px]">
              <Image
                src="/marketing/roogo-owner-workflow.jpg"
                alt="Professionnel préparant la présentation numérique d’un projet architectural"
                fill
                sizes="(max-width: 1024px) 100vw, 48vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#18120e]/35 to-transparent lg:bg-gradient-to-r lg:from-[#d7773d]/25 lg:to-transparent" />
            </div>
          </div>
        </section>

        <section className="px-5 pb-20 sm:px-8 sm:pb-28">
          <div className="mx-auto flex max-w-7xl flex-col gap-8 rounded-[34px] border border-[#d9cbbd] bg-white/60 p-8 sm:p-12 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#1b1612] text-white">
                <HouseLineIcon size={25} weight="duotone" />
              </span>
              <div>
                <h2 className="text-2xl font-black tracking-[-0.035em] sm:text-3xl">Roogo Immobilier continue.</h2>
                <p className="mt-2 max-w-2xl text-sm font-semibold leading-7 text-[#6f6258]">
                  Votre compte reste le même. Vos préférences immobilières ne
                  changent pas lorsque vous découvrez Roogo Mêbo.
                </p>
              </div>
            </div>
            <a
              href="https://www.roogobf.com"
              className="inline-flex h-12 shrink-0 items-center justify-center rounded-full border border-[#cbb9a8] px-6 text-sm font-black transition hover:bg-white"
            >
              Aller sur Roogo Immobilier
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#120e0b] px-5 py-10 text-white sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-white">
              <Image src="/logo.png" alt="" width={23} height={23} />
            </span>
            <span className="font-black">Roogo Mêbo</span>
          </div>
          <p className="text-xs font-semibold text-white/40">© {new Date().getFullYear()} Roogo. Marketplace en préparation.</p>
        </div>
      </footer>
    </div>
  );
}
