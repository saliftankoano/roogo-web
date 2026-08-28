import { Footer } from "../../components/Footer";
import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Plan du Site",
  description:
    "Explorez toutes les pages et sections de Roogo - la plateforme immobilière au Burkina Faso.",
};

export default function SitemapPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <main className="grow pt-40 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-3xl font-bold text-neutral-900 mb-8">
            Plan du Site
          </h1>

          <div className="space-y-8">
            {/* Main Pages */}
            <section>
              <h2 className="text-2xl font-semibold text-neutral-800 mb-4">
                Pages Principales
              </h2>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/"
                    className="text-primary-600 hover:text-primary-700 hover:underline"
                  >
                    Accueil
                  </Link>
                </li>
                <li>
                  <Link
                    href="/proprietes"
                    className="text-primary-600 hover:text-primary-700 hover:underline"
                  >
                    Propriétés
                  </Link>
                </li>
                <li>
                  <Link
                    href="/visites-3d"
                    className="text-primary-600 hover:text-primary-700 hover:underline"
                  >
                    Visites 3D
                  </Link>
                </li>
                <li>
                  <Link
                    href="/a-propos"
                    className="text-primary-600 hover:text-primary-700 hover:underline"
                  >
                    À Propos
                  </Link>
                </li>
                <li>
                  <Link
                    href="/nous-contacter"
                    className="text-primary-600 hover:text-primary-700 hover:underline"
                  >
                    Nous Contacter
                  </Link>
                </li>
              </ul>
            </section>

            {/* Legal */}
            <section>
              <h2 className="text-2xl font-semibold text-neutral-800 mb-4">
                Informations Légales
              </h2>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/conditions-utilisation"
                    className="text-primary-600 hover:text-primary-700 hover:underline"
                  >
                    Conditions Générales d&apos;Utilisation
                  </Link>
                </li>
                <li>
                  <Link
                    href="/confidentialite"
                    className="text-primary-600 hover:text-primary-700 hover:underline"
                  >
                    Politique de Confidentialité
                  </Link>
                </li>
              </ul>
            </section>

            {/* Account */}
            <section>
              <h2 className="text-2xl font-semibold text-neutral-800 mb-4">
                Compte
              </h2>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/personnel/rejoindre"
                    className="text-primary-600 hover:text-primary-700 hover:underline"
                  >
                    Rejoindre l&apos;Équipe
                  </Link>
                </li>
                <li>
                  <Link
                    href="/supprimer-compte"
                    className="text-primary-600 hover:text-primary-700 hover:underline"
                  >
                    Supprimer mon Compte
                  </Link>
                </li>
              </ul>
            </section>

            {/* Resources */}
            <section>
              <h2 className="text-2xl font-semibold text-neutral-800 mb-4">
                Ressources
              </h2>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/tutoriels"
                    className="text-primary-600 hover:text-primary-700 hover:underline"
                  >
                    Aide &amp; tutoriels propriétaires
                  </Link>
                </li>
                <li>
                  <Link
                    href="/tutoriels/comment-s-inscrire-roogo-proprietaire"
                    className="text-primary-600 hover:text-primary-700 hover:underline"
                  >
                    Créer un compte propriétaire Roogo
                  </Link>
                </li>
                <li>
                  <Link
                    href="/tutoriels/comment-mettre-bien-en-vente-roogo"
                    className="text-primary-600 hover:text-primary-700 hover:underline"
                  >
                    Mettre un bien en vente sur Roogo
                  </Link>
                </li>
                <li>
                  <a
                    href="/sitemap.xml"
                    className="text-primary-600 hover:text-primary-700 hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Sitemap XML
                  </a>
                </li>
                <li>
                  <a
                    href="/robots.txt"
                    className="text-primary-600 hover:text-primary-700 hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Robots.txt
                  </a>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
