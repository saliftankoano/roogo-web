"use client";

import Image from "next/image";
import { Button } from "./ui/Button";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function Hero() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // Assuming /location accepts a query param like 'q' or 'search'
      // Standard is often 'q' or just handling filters. I'll use 'q'.
      router.push(`/location?q=${encodeURIComponent(searchQuery)}`);
    } else {
      router.push("/location");
    }
  };

  return (
    <div className="relative h-[500px] sm:h-[600px] w-full flex items-center justify-center overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/hero-bg.jpg"
          alt="Arrière-plan Roogo"
          fill
          className="object-cover brightness-[0.85]"
          priority
        />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-4xl px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <h1 className="text-4xl sm:text-6xl font-bold text-white mb-6 drop-shadow-md">
            Votre futur logement, simplement.
          </h1>
          <p className="text-lg sm:text-xl text-white/90 mb-10 max-w-2xl mx-auto font-medium drop-shadow-sm">
            La référence de la location immobilière au Burkina Faso.
          </p>
        </motion.div>

        {/* Search Bar */}
        <motion.form 
          onSubmit={handleSearch}
          className="bg-white p-4 rounded-2xl shadow-xl max-w-3xl mx-auto flex flex-col sm:flex-row gap-4"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
        >
          <div className="flex-1 relative">
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Entrez une adresse, un quartier ou une ville" 
              className="w-full h-12 px-4 text-neutral-900 placeholder-neutral-500 outline-none rounded-lg focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <Button type="submit" size="md" className="sm:w-auto w-full">
            Rechercher
          </Button>
        </motion.form>
      </div>
    </div>
  );
}
