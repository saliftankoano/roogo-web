import { Footer } from "../../components/Footer";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "À propos de Roogo | Révolutionner l'Immobilier au Burkina Faso",
  description:
    "Découvrez Roogo, la plateforme qui simplifie la location immobilière au Burkina Faso grâce à l'innovation, la transparence et la qualité.",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <main className="grow pt-40 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-4xl md:text-5xl font-bold text-neutral-900 mb-8 text-center">
            À propos de Roogo
          </h1>

          <div className="prose prose-lg max-w-none text-neutral-600 space-y-8">
            <section>
              <h2 className="text-2xl font-bold text-neutral-900 mb-4">
                Notre Mission
              </h2>
              <p>
                Roogo est né d&apos;une volonté simple : transformer
                l&apos;expérience de la location immobilière au Burkina Faso.
                Nous croyons que trouver un logement ne devrait pas être un
                parcours du combattant semé d&apos;embûches et
                d&apos;incertitudes.
              </p>
              <p>
                Notre mission est de connecter les propriétaires et les
                locataires de manière transparente, efficace et sécurisée, en
                utilisant la technologie pour lever les barrières
                traditionnelles du marché.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-neutral-900 mb-4">
                Pourquoi Roogo ?
              </h2>
              <p>
                Le marché immobilier traditionnel au Burkina Faso souffre
                souvent d&apos;un manque de visibilité et de professionnalisme.
                Roogo apporte une réponse moderne avec :
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Photos Professionnelles :</strong> Chaque bien est mis
                  en valeur par notre équipe de photographes.
                </li>
                <li>
                  <strong>Visites Organisées :</strong> Nous gérons les sessions
                  Open House pour simplifier l&apos;agenda de chacun.
                </li>
                <li>
                  <strong>Zéro Frais de Visite :</strong> La recherche de
                  logement redeviens gratuite pour les locataires.
                </li>
                <li>
                  <strong>Rapidité :</strong> Un système de réservation Early
                  Bird pour ne pas rater les meilleures opportunités.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-neutral-900 mb-4">
                Notre Vision
              </h2>
              <p>
                Nous aspirons à devenir la plateforme de référence pour tout
                l&apos;écosystème immobilier en Afrique de l&apos;Ouest, en
                commençant par le Burkina Faso. En plaçant l&apos;utilisateur au
                centre de nos préoccupations, nous construisons un futur où
                l&apos;immobilier est synonyme de confiance et de simplicité.
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
