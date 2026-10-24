import { Footer } from "../../components/Footer";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Conditions Générales d'Utilisation",
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
              Version 2.0 — Dernière mise à jour : 30 août 2026
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
                Pour une location mensuelle, le propriétaire peut choisir une
                publication sans paiement initial. Dans ce cas, aucun montant
                n&apos;est dû le jour de la publication. Si Roogo apporte un
                locataire et encaisse le premier loyer, un frais unique égal à
                50% du loyer mensuel indiqué au moment de la publication est
                retenu sur cet encaissement. Une remise de parrainage affichée
                et validée avant la publication réduit ce frais enregistré.
              </p>
              <p className="mt-3">
                Le propriétaire peut aussi choisir un pack payé avant
                publication; le prix complet du pack est alors affiché avant le
                paiement et le frais unique de succès ne s&apos;applique pas. La
                collecte des loyers suivants via Roogo est activée par défaut
                lorsqu&apos;un bail mensuel devient actif. Roogo retient 7% de
                chaque loyer effectivement encaissé par la plateforme. Le
                propriétaire peut la désactiver depuis le bail pour les
                échéances futures non payées. Si le frais unique de succès reste
                dû, le premier loyer demeure payable via Roogo. Les montants
                applicables sont présentés dans le parcours concerné avant
                confirmation.
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
