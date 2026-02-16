import { Footer } from "../../components/Footer";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Conditions Générales d'Utilisation | Roogo",
  description:
    "Lisez les conditions générales d'utilisation de Roogo pour en savoir plus sur les règles d'utilisation de notre plateforme immobilière.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <main className="grow pt-40 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-3xl font-bold text-neutral-900 mb-8">
            Conditions Générales d&apos;Utilisation
          </h1>

          <div className="prose prose-sm max-w-none text-neutral-600 space-y-6">
            <p className="text-sm italic">
              Dernière mise à jour : 15 janvier 2026
            </p>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                1. Acceptation des conditions
              </h2>
              <p>
                En accédant et en utilisant la plateforme Roogo, vous acceptez
                d&apos;être lié par les présentes conditions générales
                d&apos;utilisation. Si vous n&apos;acceptez pas ces conditions,
                veuillez ne pas utiliser nos services.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                2. Description des services
              </h2>
              <p>
                Roogo est une plateforme intermédiaire de mise en relation
                immobilière. Nous ne sommes ni propriétaires, ni agents
                immobiliers traditionnels, ni gestionnaires des biens listés,
                sauf indication contraire explicite.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                3. Engagements des utilisateurs
              </h2>
              <p>
                Les utilisateurs s&apos;engagent à fournir des informations
                exactes et véridiques. Les propriétaires garantissent
                qu&apos;ils ont le droit de mettre en location les biens
                qu&apos;ils publient. Les locataires s&apos;engagent à respecter
                les processus de candidature et de réservation de la plateforme.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                4. Tarification et Paiements
              </h2>
              <p>
                Les tarifs des différents packs de publication et des frais de
                réservation Early Bird sont indiqués sur la plateforme. Tous les
                paiements effectués via Roogo sont finaux, sous réserve de notre
                politique de remboursement spécifique.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                5. Responsabilité
              </h2>
              <p>
                Roogo s&apos;efforce de maintenir la qualité des annonces mais
                ne peut être tenu responsable des vices cachés des propriétés ou
                du comportement des utilisateurs une fois la mise en relation
                effectuée.
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
