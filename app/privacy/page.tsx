import { Footer } from "../../components/Footer";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Politique de Confidentialité | Roogo",
  description:
    "Consultez la politique de confidentialité de Roogo pour comprendre comment nous protégeons et utilisons vos données personnelles.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <main className="grow pt-40 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-3xl font-bold text-neutral-900 mb-8">
            Politique de Confidentialité
          </h1>

          <div className="prose prose-sm max-w-none text-neutral-600 space-y-6">
            <p className="text-sm italic">
              Dernière mise à jour : 15 janvier 2026
            </p>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                1. Collecte des données
              </h2>
              <p>
                Nous collectons les informations que vous nous fournissez
                directement lors de la création de votre compte, de la
                publication d&apos;une annonce ou de la soumission d&apos;une
                candidature. Cela inclut votre nom, adresse email, numéro de
                téléphone et détails sur la propriété le cas échéant.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                2. Utilisation des données
              </h2>
              <p>Vos données sont utilisées pour :</p>
              <ul className="list-disc pl-6">
                <li>Gérer votre compte et vos annonces.</li>
                <li>
                  Faciliter la mise en relation entre propriétaires et
                  locataires.
                </li>
                <li>Améliorer nos services et votre expérience utilisateur.</li>
                <li>
                  Communiquer avec vous concernant vos transactions et les mises
                  à jour de la plateforme.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                3. Protection des données
              </h2>
              <p>
                Roogo met en œuvre des mesures de sécurité techniques et
                organisationnelles pour protéger vos données contre tout accès
                non autorisé, perte ou destruction. Nous utilisons des
                protocoles de cryptage standards pour les transactions.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                4. Partage des données
              </h2>
              <p>
                Nous ne vendons pas vos données personnelles. Vos informations
                de contact ne sont partagées avec un tiers (propriétaire ou
                locataire) qu&apos;une fois qu&apos;une mise en relation
                officielle est établie via la plateforme.
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
