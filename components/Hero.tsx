"use client";

import { Button } from "./ui/Button";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import {
  AppStoreLogoIcon,
  GooglePlayLogoIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import {
  MarketingImage,
  ProofStat,
} from "./marketing/MarketingPrimitives";
import { marketingAssets } from "./marketing/assets";
import { roogoMotion } from "@/lib/motion";

export function Hero() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/proprietes?q=${encodeURIComponent(searchQuery)}`);
    } else {
      router.push("/proprietes");
    }
  };

  const popularSearches = ["Ouaga 2000", "Gounghin", "Dassasgho"];
  const trustBadges = [
    "Logements vérifiés",
    "Visites organisées",
    "Paiement suivi",
  ];

  return (
    <section className="relative overflow-hidden bg-[#efe6d9] px-3 pb-10 pt-28 sm:px-6 lg:pt-32">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_12%,rgba(201,106,46,0.26),transparent_28%),radial-gradient(circle_at_88%_4%,rgba(63,166,217,0.18),transparent_25%)]" />

      <div className="relative mx-auto max-w-[1500px] overflow-hidden rounded-[30px] border border-white/50 bg-[#17120f] shadow-2xl shadow-[#5a321a]/25 sm:rounded-[36px]">
        <div className="absolute inset-0">
          <motion.div
            className="absolute inset-0"
            initial={{ scale: 1.02 }}
            animate={{ scale: 1 }}
            transition={roogoMotion.deliberate}
          >
            <MarketingImage
              src={marketingAssets.heroHome.src}
              fallbackSrc={marketingAssets.heroHome.fallback}
              alt="Maison moderne disponible à Ouagadougou"
              fill
              sizes="100vw"
              priority
              className="object-cover"
            />
          </motion.div>
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(12,9,7,0.92),rgba(12,9,7,0.58)_48%,rgba(12,9,7,0.18)),linear-gradient(180deg,rgba(12,9,7,0.2),rgba(12,9,7,0.72))]" />
        </div>

        <div className="relative grid min-h-[720px] items-end px-5 pb-8 pt-20 sm:px-10 lg:grid-cols-[minmax(0,1fr)_410px] lg:px-16 lg:pb-14">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={roogoMotion.deliberate}
            className="max-w-4xl"
          >
            <div className="mb-8 flex flex-wrap gap-3 text-[11px] font-black uppercase tracking-[0.18em] text-white/70">
              {trustBadges.map((badge, index) => (
                <motion.span
                  key={badge}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.12 + index * 0.08,
                    ...roogoMotion.standard,
                  }}
                  whileHover={{ backgroundColor: "rgba(255,255,255,0.16)" }}
                  className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5"
                >
                  {badge}
                </motion.span>
              ))}
            </div>

            <h1 className="max-w-3xl text-5xl font-black leading-[0.98] tracking-tight text-white sm:text-7xl lg:text-7xl">
              Logements fiables à Ouagadougou.
            </h1>

            <p className="mt-7 max-w-2xl text-base font-medium leading-8 text-white/70 sm:text-lg">
              Annonces vérifiées, visites organisées, paiement suivi. Roogo
              rend la location plus simple, du premier clic aux clés.
            </p>

            <motion.form
              onSubmit={handleSearch}
              className="mt-10 max-w-3xl rounded-[28px] border border-white/15 bg-white p-2 shadow-2xl shadow-black/30 sm:flex sm:items-center sm:gap-2"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...roogoMotion.deliberate, delay: 0.12 }}
            >
              <div className="flex h-16 flex-1 items-center px-4">
                <MapPinIcon
                  size={24}
                  className="mr-3 shrink-0 text-primary"
                  weight="duotone"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Quartier, ville ou type de bien"
                  className="h-full w-full bg-transparent text-base font-bold text-neutral-950 outline-none placeholder:text-neutral-400 sm:text-lg"
                />
              </div>
              <Button
                type="submit"
                size="lg"
                className="h-14 w-full rounded-[22px] px-7 text-base font-black sm:h-16 sm:w-auto"
              >
                <MagnifyingGlassIcon size={22} className="mr-2" weight="bold" />
                Rechercher
              </Button>
            </motion.form>

            <div className="mt-6 flex flex-wrap items-center gap-2 text-sm font-bold text-white/70">
              <span>Recherches populaires</span>
              {popularSearches.map((search) => (
                <motion.button
                  key={search}
                  type="button"
                  onClick={() =>
                    router.push(`/proprietes?q=${encodeURIComponent(search)}`)
                  }
                  whileTap={{ scale: 0.985 }}
                  className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-white transition-colors hover:bg-white/20"
                >
                  {search}
                </motion.button>
              ))}
            </div>
          </motion.div>

          <motion.aside
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...roogoMotion.deliberate, delay: 0.18 }}
            className="mt-10 hidden rounded-[28px] border border-white/15 bg-black/30 p-5 text-white shadow-2xl shadow-black/25 backdrop-blur-md lg:block"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-white">
                <ShieldCheckIcon size={26} weight="duotone" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-white/50">
                  Système Roogo
                </p>
                <p className="font-black">Recherche plus nette</p>
              </div>
            </div>

            <div className="mt-6 grid gap-5">
              <ProofStat dark value="0 FCFA" label="frais de visite imposés" />
              <ProofStat dark value="72h" label="objectif de mise en relation" />
              <ProofStat dark value="1 flow" label="recherche, visite, suivi" />
            </div>

            <div className="mt-7 grid gap-3 text-sm font-bold text-white/70">
              <a
                href="https://apps.apple.com/us/app/roogo-burkina/id6761714300"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-3 transition-colors hover:bg-white/20"
              >
                <AppStoreLogoIcon size={22} weight="fill" />
                App Store
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=com.kazedra.roogo"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-3 transition-colors hover:bg-white/20"
              >
                <GooglePlayLogoIcon size={22} weight="fill" />
                Google Play
              </a>
            </div>
          </motion.aside>
        </div>
      </div>
    </section>
  );
}
