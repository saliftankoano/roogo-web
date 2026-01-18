"use client";

import Image from "next/image";
import { Button } from "./ui/Button";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MagnifyingGlassIcon, MapPinIcon } from "@phosphor-icons/react";

export function Hero() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/location?q=${encodeURIComponent(searchQuery)}`);
    } else {
      router.push("/location");
    }
  };

  return (
    <div className="relative min-h-[600px] lg:h-[800px] w-full flex items-center justify-center overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/hero-bg.jpg"
          alt="Arrière-plan Roogo"
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-5xl px-4 text-center mt-16 sm:mt-0">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-12"
        >
          <div className="inline-block px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm font-medium mb-6">
            ✨ La référence immobilière au Burkina Faso
          </div>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white mb-6 tracking-tight leading-[1.1]">
            Votre futur logement, <br className="hidden sm:block" />
            <span className="text-primary bg-clip-text text-transparent bg-gradient-to-r from-primary to-orange-400">
              simplement.
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-neutral-200 max-w-2xl mx-auto font-medium leading-relaxed">
            Découvrez une nouvelle façon de louer, d'acheter et de vivre.
            Des milliers de propriétés vérifiées vous attendent.
          </p>
        </motion.div>

        {/* Search Bar */}
        <motion.form
          onSubmit={handleSearch}
          className="bg-white p-2 rounded-3xl shadow-2xl max-w-3xl mx-auto flex flex-col sm:flex-row gap-2 border border-white/10 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
        >
          <div className="flex-1 relative flex items-center px-4 h-14 sm:h-16">
            <MapPinIcon size={24} className="text-neutral-400 mr-3 shrink-0" weight="duotone" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Où souhaitez-vous habiter ?"
              className="w-full h-full text-lg text-neutral-900 placeholder-neutral-500 outline-none bg-transparent"
            />
          </div>
          <Button 
            type="submit" 
            size="lg" 
            className="h-14 sm:h-16 rounded-2xl px-8 text-lg font-bold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all"
          >
            <MagnifyingGlassIcon size={24} className="mr-2" weight="bold" />
            Rechercher
          </Button>
        </motion.form>

        {/* Quick Links / Tags */}
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 1 }}
            className="mt-8 flex flex-wrap justify-center gap-3 text-white/80 text-sm font-medium"
        >
            <span>Recherches populaires :</span>
            <button type="button" onClick={() => router.push('/location?q=Ouaga 2000')} className="hover:text-white underline decoration-white/30 hover:decoration-white transition-all">Ouaga 2000</button>
            <span>•</span>
            <button type="button" onClick={() => router.push('/location?q=Gounghin')} className="hover:text-white underline decoration-white/30 hover:decoration-white transition-all">Gounghin</button>
            <span>•</span>
            <button type="button" onClick={() => router.push('/location?q=Dassasgho')} className="hover:text-white underline decoration-white/30 hover:decoration-white transition-all">Dassasgho</button>
        </motion.div>
      </div>
    </div>
  );
}
