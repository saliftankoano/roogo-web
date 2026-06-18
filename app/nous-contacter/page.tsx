"use client";

import { Footer } from "../../components/Footer";
import { motion } from "framer-motion";
import { Button } from "../../components/ui/Button";
import {
  EnvelopeSimpleIcon,
  MapPinIcon,
  PaperPlaneTiltIcon,
  PhoneIcon,
  WhatsappLogoIcon,
} from "@phosphor-icons/react";
import { type FormEvent, useState } from "react";
import {
  MarketingImage,
  SectionHeader,
} from "../../components/marketing/MarketingPrimitives";
import { marketingAssets } from "../../components/marketing/assets";

export default function ContactPage() {
  const contactHeroImage =
    marketingAssets.agentOffice ?? marketingAssets.finalCta;

  const [formState, setFormState] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    console.log("Form submitted:", formState);
    alert("Merci pour votre message ! Notre équipe vous contactera bientôt.");
    setFormState({ name: "", email: "", subject: "", message: "" });
  };

  const contactInfo = [
    {
      icon: PhoneIcon,
      label: "Téléphone Moov",
      value: "+226 53 11 11 19",
      subValue: "Lun - Ven, 8h - 18h",
    },
    {
      icon: PhoneIcon,
      label: "Téléphone Orange",
      value: "+226 67 00 61 16",
      subValue: "Lun - Ven, 8h - 18h",
    },
    {
      icon: EnvelopeSimpleIcon,
      label: "Email",
      value: "bonjour@roogobf.com",
      subValue: "Réponse sous 24h",
    },
    {
      icon: WhatsappLogoIcon,
      label: "WhatsApp",
      value: "+226 67 00 61 16",
      subValue: "Assistance rapide",
    },
  ];

  return (
    <div className="min-h-screen bg-[#f5efe6]">
      <main>
        <section className="relative overflow-hidden bg-[#17120f] px-3 pb-3 pt-28 sm:px-6 lg:pt-32">
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="relative mx-auto min-h-[620px] max-w-[1500px] overflow-hidden rounded-[30px] border border-white/10 bg-neutral-950"
          >
            <MarketingImage
              src={contactHeroImage.src}
              fallbackSrc={contactHeroImage.fallback}
              alt="Assistance Roogo au téléphone"
              fill
              sizes="100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(12,9,7,0.92),rgba(12,9,7,0.58)_55%,rgba(12,9,7,0.18)),linear-gradient(180deg,rgba(12,9,7,0.1),rgba(12,9,7,0.7))]" />
            <div className="relative flex min-h-[620px] max-w-3xl flex-col justify-end px-6 py-10 sm:px-10 lg:px-14">
              <div className="mb-5 inline-flex w-fit rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white/70">
                Contact
              </div>
              <h1 className="text-5xl font-black leading-[0.98] tracking-tight text-white md:text-7xl">
                Parlons de votre prochain logement.
              </h1>
              <p className="mt-7 max-w-2xl text-base font-medium leading-8 text-white/70 md:text-lg">
                Une question sur une annonce, une visite, un bien à publier ou
                un paiement ? L&apos;équipe Roogo vous oriente vers la prochaine
                étape utile.
              </p>
            </div>
          </motion.div>
        </section>

        <section className="py-24 md:py-32">
          <div className="mx-auto grid max-w-7xl gap-10 px-6 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <SectionHeader
                kicker="Coordonnées"
                title="Un point d'entrée clair pour chaque demande."
                description="Choisissez le canal le plus pratique. Pour une annonce précise, ajoutez le quartier ou le lien du bien dans votre message."
              />

              <div className="mt-10 grid gap-4">
                {contactInfo.map((info, index) => (
                  <motion.div
                    key={info.label}
                    className="rounded-[26px] border border-[#e7dacb] bg-white/75 p-6 shadow-sm"
                    initial={{ opacity: 0, x: -18 }}
                    animate={{ opacity: 1, x: 0 }}
                    whileHover={{ x: 5, y: -2 }}
                    whileTap={{ scale: 0.99 }}
                    transition={{ delay: index * 0.08 }}
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <info.icon size={26} weight="duotone" />
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
                          {info.label}
                        </p>
                        <p className="mt-1 text-lg font-black text-neutral-950">
                          {info.value}
                        </p>
                        <p className="text-sm font-semibold text-neutral-500">
                          {info.subValue}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}

                <motion.div
                  initial={{ opacity: 0, x: -18 }}
                  animate={{ opacity: 1, x: 0 }}
                  whileHover={{ x: 5, y: -2 }}
                  whileTap={{ scale: 0.99 }}
                  transition={{ delay: contactInfo.length * 0.08 }}
                  className="rounded-[26px] border border-[#e7dacb] bg-white/75 p-6 shadow-sm"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <MapPinIcon size={26} weight="duotone" />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
                        Adresse
                      </p>
                      <p className="mt-1 text-lg font-black text-neutral-950">
                        Karpala, Ouagadougou
                      </p>
                      <p className="text-sm font-semibold leading-6 text-neutral-500">
                        3ème boutique après le groupe l&apos;académie
                      </p>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>

            <motion.div
              className="rounded-[34px] border border-neutral-200 bg-white p-6 shadow-2xl shadow-[#5a321a]/10 sm:p-8 lg:p-10"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -4 }}
              transition={{ delay: 0.2 }}
            >
              <h2 className="text-3xl font-black text-neutral-950">
                Envoyez-nous un message
              </h2>
              <p className="mt-3 text-sm font-medium leading-7 text-neutral-600">
                Donnez-nous le contexte. Notre équipe pourra vous répondre avec
                une orientation plus précise.
              </p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                <div className="grid gap-5 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="ml-3 text-sm font-black text-neutral-950">
                      Nom complet
                    </span>
                    <input
                      required
                      type="text"
                      placeholder="Jean Dupont"
                      className="w-full rounded-full border border-neutral-200 bg-[#f8f5ef] px-5 py-4 text-sm font-semibold outline-none transition-all focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
                      value={formState.name}
                      onChange={(e) =>
                        setFormState({ ...formState, name: e.target.value })
                      }
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="ml-3 text-sm font-black text-neutral-950">
                      Email
                    </span>
                    <input
                      required
                      type="email"
                      placeholder="jean@example.com"
                      className="w-full rounded-full border border-neutral-200 bg-[#f8f5ef] px-5 py-4 text-sm font-semibold outline-none transition-all focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
                      value={formState.email}
                      onChange={(e) =>
                        setFormState({ ...formState, email: e.target.value })
                      }
                    />
                  </label>
                </div>

                <label className="block space-y-2">
                  <span className="ml-3 text-sm font-black text-neutral-950">
                    Sujet
                  </span>
                  <input
                    required
                    type="text"
                    placeholder="Annonce, visite, publication..."
                    className="w-full rounded-full border border-neutral-200 bg-[#f8f5ef] px-5 py-4 text-sm font-semibold outline-none transition-all focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
                    value={formState.subject}
                    onChange={(e) =>
                      setFormState({ ...formState, subject: e.target.value })
                    }
                  />
                </label>

                <label className="block space-y-2">
                  <span className="ml-3 text-sm font-black text-neutral-950">
                    Message
                  </span>
                  <textarea
                    required
                    rows={6}
                    placeholder="Écrivez votre message ici..."
                    className="w-full resize-none rounded-[26px] border border-neutral-200 bg-[#f8f5ef] px-5 py-4 text-sm font-semibold outline-none transition-all focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
                    value={formState.message}
                    onChange={(e) =>
                      setFormState({ ...formState, message: e.target.value })
                    }
                  />
                </label>

                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  className="rounded-full py-4 text-base font-black transition-transform hover:-translate-y-0.5 active:translate-y-0"
                >
                  <PaperPlaneTiltIcon size={22} weight="bold" className="mr-2" />
                  Envoyer le message
                </Button>
              </form>
            </motion.div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
