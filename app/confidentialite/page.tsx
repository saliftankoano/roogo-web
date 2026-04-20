import { Footer } from "../../components/Footer";
import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Politique de Confidentialité | Roogo",
  description:
    "Consultez la politique de confidentialité de Roogo pour comprendre comment nous collectons, utilisons et protégeons vos données personnelles.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <main className="grow pt-40 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-neutral-900">
              Politique de Confidentialité
            </h1>
            <Link
              href="/confidentialite/en"
              className="text-sm text-neutral-500 hover:text-neutral-800 underline underline-offset-2"
            >
              English version
            </Link>
          </div>

          <div className="prose prose-sm max-w-none text-neutral-600 space-y-8">
            <p className="text-sm italic">
              Dernière mise à jour : 20 avril 2026
            </p>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                1. Qui sommes-nous
              </h2>
              <p>
                Roogo est une plateforme immobilière numérique éditée par{" "}
                <strong>Kazedra Technologies</strong>, dont le siège social est
                situé à Karpala, Ouagadougou, Burkina Faso. Nous connectons
                propriétaires, agents et locataires pour la recherche, la
                publication et la gestion de biens immobiliers.
              </p>
              <p className="mt-2">
                Contact :{" "}
                <a
                  href="mailto:hello@roogo.app"
                  className="text-orange-600 hover:underline"
                >
                  hello@roogo.app
                </a>
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                2. Données que nous collectons
              </h2>
              <p>
                Selon la façon dont vous utilisez Roogo, nous pouvons collecter
                les catégories de données suivantes :
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li>
                  <strong>Identité :</strong> nom, prénom.
                </li>
                <li>
                  <strong>Contact :</strong> adresse e-mail, numéro de téléphone
                  (utilisé pour les paiements mobile money via PawaPay).
                </li>
                <li>
                  <strong>Données de localisation précise :</strong>{" "}
                  coordonnées GPS collectées uniquement lors de la publication
                  d&apos;une annonce immobilière afin de géolocaliser le bien,
                  avec votre autorisation explicite.
                </li>
                <li>
                  <strong>Photos et médias :</strong> images des biens
                  immobiliers que vous publiez, stockées sur nos serveurs.
                </li>
                <li>
                  <strong>Données financières :</strong> numéro de téléphone
                  mobile money (Orange Money / Moov Money) utilisé pour
                  initier et tracer les paiements de loyer ou de services via
                  PawaPay. Roogo ne stocke pas de numéros de carte bancaire.
                </li>
                <li>
                  <strong>Données de compte :</strong> identifiant utilisateur,
                  type de compte (propriétaire, locataire, agent), statut
                  d&apos;intégration.
                </li>
                <li>
                  <strong>Données d&apos;utilisation :</strong> interactions
                  avec l&apos;application (clics, navigation, durée de session)
                  collectées via PostHog, y compris l&apos;enregistrement de
                  session (session replay) à des fins d&apos;amélioration du
                  produit.
                </li>
                <li>
                  <strong>Données techniques :</strong> adresse IP, type
                  d&apos;appareil, système d&apos;exploitation, identifiants de
                  session.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                3. Finalités du traitement
              </h2>
              <p>Vos données sont utilisées pour :</p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li>
                  Créer et gérer votre compte utilisateur (authentification via
                  Clerk).
                </li>
                <li>
                  Publier, afficher et gérer vos annonces immobilières.
                </li>
                <li>
                  Faciliter la mise en relation entre propriétaires et
                  locataires, y compris la génération de contrats de bail.
                </li>
                <li>
                  Traiter les paiements de loyer et de services via mobile money
                  (PawaPay — Orange Money, Moov Money).
                </li>
                <li>
                  Géolocaliser les biens immobiliers sur la carte.
                </li>
                <li>
                  Vous envoyer des notifications relatives à vos transactions,
                  paiements et activités sur la plateforme.
                </li>
                <li>
                  Analyser l&apos;utilisation de la plateforme pour
                  l&apos;améliorer (analytics anonymisés via PostHog).
                </li>
                <li>
                  Respecter nos obligations légales et prévenir la fraude.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                4. Prestataires tiers
              </h2>
              <p>
                Nous faisons appel aux sous-traitants suivants pour faire
                fonctionner la plateforme. Chacun traite vos données dans le
                cadre strict de sa mission :
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li>
                  <strong>Clerk</strong> — authentification et gestion des
                  comptes utilisateurs.
                </li>
                <li>
                  <strong>Supabase</strong> — stockage des données (base de
                  données PostgreSQL et fichiers).
                </li>
                <li>
                  <strong>PawaPay</strong> — traitement des paiements mobile
                  money (Orange Money, Moov Money).
                </li>
                <li>
                  <strong>PostHog</strong> — analytics produit et
                  enregistrement de session (données pseudonymisées).
                </li>
                <li>
                  <strong>Vercel</strong> — hébergement de l&apos;application
                  web.
                </li>
                <li>
                  <strong>Expo / Apple / Google</strong> — distribution de
                  l&apos;application mobile et notifications push.
                </li>
              </ul>
              <p className="mt-3">
                Nous ne vendons pas vos données personnelles à des tiers. Nous
                ne partageons pas vos informations à des fins de publicité tierce.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                5. Partage des données entre utilisateurs
              </h2>
              <p>
                Vos coordonnées de contact (nom, téléphone, e-mail) ne sont
                partagées avec une autre partie (propriétaire ou locataire)
                qu&apos;une fois qu&apos;une mise en relation officielle est
                établie via la plateforme — candidature acceptée ou contrat de
                bail signé. Les annonces publiées sont visibles publiquement.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                6. Conservation des données
              </h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  Données de compte : conservées pendant la durée de vie de
                  votre compte, puis supprimées dans un délai de 30 jours après
                  votre demande de suppression.
                </li>
                <li>
                  Données de transaction et contrats de bail : conservées 5 ans
                  pour répondre aux obligations légales et comptables.
                </li>
                <li>
                  Données d&apos;analytics : agrégées et anonymisées après 24
                  mois.
                </li>
                <li>
                  Photos d&apos;annonces : supprimées lors de la suppression de
                  l&apos;annonce ou du compte.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                7. Vos droits
              </h2>
              <p>
                Conformément à la loi burkinabè sur la protection des données
                personnelles et aux principes du RGPD, vous disposez des droits
                suivants :
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li>
                  <strong>Droit d&apos;accès</strong> — obtenir une copie de
                  vos données.
                </li>
                <li>
                  <strong>Droit de rectification</strong> — corriger des données
                  inexactes.
                </li>
                <li>
                  <strong>Droit à l&apos;effacement</strong> — demander la
                  suppression de votre compte et de vos données via{" "}
                  <Link
                    href="/supprimer-compte"
                    className="text-orange-600 hover:underline"
                  >
                    cette page
                  </Link>
                  .
                </li>
                <li>
                  <strong>Droit d&apos;opposition</strong> — vous opposer au
                  traitement de vos données à des fins analytiques.
                </li>
                <li>
                  <strong>Droit à la portabilité</strong> — recevoir vos données
                  dans un format structuré.
                </li>
              </ul>
              <p className="mt-3">
                Pour exercer ces droits, contactez-nous à{" "}
                <a
                  href="mailto:hello@roogo.app"
                  className="text-orange-600 hover:underline"
                >
                  hello@roogo.app
                </a>
                . Nous répondons dans un délai de 30 jours.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                8. Sécurité
              </h2>
              <p>
                Roogo met en œuvre des mesures techniques et organisationnelles
                appropriées : chiffrement des communications (HTTPS/TLS),
                contrôle d&apos;accès basé sur les rôles, isolation des données
                via Row-Level Security (Supabase), tokens d&apos;authentification
                à courte durée de vie (Clerk JWT). Aucun système n&apos;est
                infaillible à 100 % ; en cas de violation de données nous vous
                notifierons dans les meilleurs délais.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                9. Mineurs
              </h2>
              <p>
                Roogo n&apos;est pas destiné aux personnes de moins de 18 ans.
                Nous ne collectons pas sciemment de données personnelles
                concernant des mineurs. Si vous constatez qu&apos;un mineur
                utilise la plateforme, contactez-nous immédiatement.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                10. Modifications
              </h2>
              <p>
                Nous pouvons mettre à jour cette politique ponctuellement. En
                cas de modification substantielle, nous vous en informerons par
                notification dans l&apos;application ou par e-mail. La date de
                dernière mise à jour est indiquée en haut de cette page. La
                poursuite de l&apos;utilisation de la plateforme après
                notification vaut acceptation des nouvelles conditions.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">
                11. Droit applicable
              </h2>
              <p>
                La présente politique est régie par le droit burkinabè. Tout
                litige relatif à la protection des données sera soumis à la
                juridiction compétente de Ouagadougou, Burkina Faso.
              </p>
            </section>

            <section className="border-t pt-6">
              <p className="text-sm">
                <strong>Kazedra Technologies</strong> — Karpala, Ouagadougou,
                Burkina Faso
                <br />
                E-mail :{" "}
                <a
                  href="mailto:hello@roogo.app"
                  className="text-orange-600 hover:underline"
                >
                  hello@roogo.app
                </a>
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
