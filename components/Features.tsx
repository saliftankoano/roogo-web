"use client";

import { AnimatedGroup } from "./motion-primitives/animated-group";
import { ShieldCheckIcon, CameraIcon, HeadsetIcon, WalletIcon } from "@phosphor-icons/react";

export function Features() {
  const features = [
    {
      icon: ShieldCheckIcon,
      title: "100% Sécurisé",
      description: "Toutes les annonces sont vérifiées par notre équipe pour éviter les arnaques.",
    },
    {
      icon: CameraIcon,
      title: "Visites Immersives",
      description: "Photos HD et visites virtuelles pour vous projeter sans vous déplacer.",
    },
    {
      icon: WalletIcon,
      title: "Paiement Simplifié",
      description: "Payez votre loyer par mobile money ou carte bancaire en toute sécurité.",
    },
    {
      icon: HeadsetIcon,
      title: "Support 24/7",
      description: "Une équipe dédiée pour vous accompagner à chaque étape de votre recherche.",
    },
  ];

  return (
    <section className="py-24 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-neutral-900 mb-4">Pourquoi choisir Roogo ?</h2>
          <p className="text-neutral-500 text-lg max-w-2xl mx-auto">
            Nous redéfinissons l&apos;expérience immobilière au Burkina Faso avec technologie et confiance.
          </p>
        </div>

        <AnimatedGroup
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8"
          preset="slide"
        >
          {features.map((feature, index) => (
            <div key={index} className="flex flex-col items-center text-center group p-6 rounded-2xl hover:bg-neutral-50 transition-colors">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 text-primary group-hover:scale-110 transition-transform duration-300">
                <feature.icon size={32} weight="duotone" />
              </div>
              <h3 className="text-xl font-bold text-neutral-900 mb-3">{feature.title}</h3>
              <p className="text-neutral-500 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </AnimatedGroup>
      </div>
    </section>
  );
}
