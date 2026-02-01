"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  TrashIcon,
  WarningCircleIcon,
  CheckCircleIcon,
  UserIcon,
  EnvelopeIcon,
  ChatCircleTextIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";

export default function DeleteAccountPage() {
  const { isSignedIn, userId } = useAuth();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    reason: "",
    additionalInfo: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/account/delete-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, userId: isSignedIn ? userId : null }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to submit request");
      }

      setSubmitted(true);
    } catch (err) {
      console.error("Error submitting deletion request:", err);
      setError(
        "Une erreur s'est produite. Veuillez réessayer ou nous contacter directement."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-neutral-50/30 flex items-center justify-center p-6">
        <div className="max-w-2xl w-full bg-white rounded-[40px] border border-neutral-100 shadow-2xl p-12 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircleIcon
              size={40}
              weight="fill"
              className="text-green-600"
            />
          </div>
          <h1 className="text-3xl font-bold text-neutral-900 mb-4">
            Demande reçue
          </h1>
          <p className="text-neutral-600 leading-relaxed mb-8">
            Votre demande de suppression de compte a été reçue avec succès. Notre
            équipe la traitera dans les plus brefs délais (généralement sous 48-72
            heures).
          </p>
          <p className="text-neutral-600 leading-relaxed mb-8">
            Vous recevrez un email de confirmation une fois votre compte
            définitivement supprimé.
          </p>
          <Button
            variant="primary"
            size="lg"
            onClick={() => (window.location.href = "/")}
          >
            Retour à l&apos;accueil
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50/30 pt-40 pb-20 px-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <TrashIcon size={40} weight="fill" className="text-red-600" />
          </div>
          <h1 className="text-4xl font-bold text-neutral-900 mb-4">
            Suppression de compte
          </h1>
          <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
            Nous sommes désolés de vous voir partir. Remplissez ce formulaire pour
            demander la suppression de votre compte Roogo.
          </p>
        </div>

        {/* Warning Box */}
        <div className="bg-yellow-50 border-2 border-yellow-200 rounded-3xl p-6 mb-8">
          <div className="flex items-start gap-4">
            <WarningCircleIcon
              size={24}
              weight="fill"
              className="text-yellow-600 shrink-0 mt-1"
            />
            <div>
              <h3 className="font-bold text-neutral-900 mb-2">
                Action irréversible
              </h3>
              <p className="text-neutral-700 text-sm leading-relaxed">
                La suppression de votre compte entraînera la perte définitive de
                toutes vos données personnelles, annonces, favoris et historique.
                Cette action ne peut pas être annulée.
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-[40px] border border-neutral-100 shadow-xl p-8 md:p-12">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name Field */}
            <div>
              <label className="block text-sm font-bold text-neutral-900 mb-3">
                Nom complet <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                  <UserIcon size={20} className="text-neutral-400" />
                </div>
                <input
                  type="text"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Votre nom complet"
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-2xl py-4 pl-14 pr-5 text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Email Field */}
            <div>
              <label className="block text-sm font-bold text-neutral-900 mb-3">
                Email du compte <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                  <EnvelopeIcon size={20} className="text-neutral-400" />
                </div>
                <input
                  type="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="votre.email@exemple.com"
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-2xl py-4 pl-14 pr-5 text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
              </div>
              <p className="text-xs text-neutral-500 mt-2 ml-1">
                L&apos;email associé à votre compte Roogo
              </p>
            </div>

            {/* Reason Dropdown */}
            <div>
              <label className="block text-sm font-bold text-neutral-900 mb-3">
                Raison de la suppression <span className="text-red-500">*</span>
              </label>
              <select
                name="reason"
                required
                value={formData.reason}
                onChange={handleChange}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-2xl py-4 px-5 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              >
                <option value="">Sélectionnez une raison</option>
                <option value="no_longer_needed">
                  Je n&apos;ai plus besoin du service
                </option>
                <option value="found_alternative">
                  J&apos;ai trouvé une alternative
                </option>
                <option value="privacy_concerns">
                  Préoccupations concernant la confidentialité
                </option>
                <option value="too_many_emails">Trop d&apos;emails</option>
                <option value="difficult_to_use">Difficile à utiliser</option>
                <option value="other">Autre</option>
              </select>
            </div>

            {/* Additional Info */}
            <div>
              <label className="block text-sm font-bold text-neutral-900 mb-3">
                Informations supplémentaires{" "}
                <span className="text-neutral-400 font-normal">(optionnel)</span>
              </label>
              <div className="relative">
                <div className="absolute top-4 left-5 pointer-events-none">
                  <ChatCircleTextIcon size={20} className="text-neutral-400" />
                </div>
                <textarea
                  name="additionalInfo"
                  value={formData.additionalInfo}
                  onChange={handleChange}
                  rows={4}
                  placeholder="Dites-nous en plus sur votre décision (optionnel)"
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-2xl py-4 pl-14 pr-5 text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none"
                />
              </div>
              <p className="text-xs text-neutral-500 mt-2 ml-1">
                Vos commentaires nous aident à améliorer nos services
              </p>
            </div>

            {/* User ID Info */}
            {isSignedIn && userId && (
              <div className="bg-neutral-50 border border-neutral-100 rounded-2xl p-4">
                <p className="text-xs text-neutral-600">
                  <span className="font-semibold">ID de compte:</span>{" "}
                  <code className="bg-neutral-100 px-2 py-1 rounded text-xs">
                    {userId}
                  </code>
                </p>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <div className="pt-4">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                disabled={isSubmitting}
                className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
              >
                {isSubmitting
                  ? "Envoi en cours..."
                  : "Soumettre la demande de suppression"}
              </Button>
            </div>
          </form>

          {/* Contact Info */}
          <div className="mt-8 pt-8 border-t border-neutral-100">
            <p className="text-sm text-neutral-600 text-center">
              Vous avez des questions ?{" "}
              <a
                href="/contact"
                className="text-primary font-semibold hover:underline"
              >
                Contactez-nous
              </a>{" "}
              avant de supprimer votre compte.
            </p>
          </div>
        </div>

        {/* What happens next */}
        <div className="mt-12 bg-white rounded-3xl border border-neutral-100 p-8">
          <h2 className="text-xl font-bold text-neutral-900 mb-6">
            Que se passe-t-il ensuite ?
          </h2>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                <span className="text-primary font-bold text-sm">1</span>
              </div>
              <div>
                <h3 className="font-semibold text-neutral-900 mb-1">
                  Vérification
                </h3>
                <p className="text-sm text-neutral-600">
                  Nous vérifions votre identité et les détails de votre demande
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                <span className="text-primary font-bold text-sm">2</span>
              </div>
              <div>
                <h3 className="font-semibold text-neutral-900 mb-1">
                  Traitement
                </h3>
                <p className="text-sm text-neutral-600">
                  Votre compte et toutes vos données sont supprimés de nos systèmes
                  (48-72h)
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                <span className="text-primary font-bold text-sm">3</span>
              </div>
              <div>
                <h3 className="font-semibold text-neutral-900 mb-1">
                  Confirmation
                </h3>
                <p className="text-sm text-neutral-600">
                  Vous recevez un email confirmant la suppression définitive
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* GDPR Notice */}
        <div className="mt-8 text-center text-xs text-neutral-500">
          <p>
            Conformément au RGPD et aux lois sur la protection des données, nous
            traitons votre demande dans les meilleurs délais.
          </p>
        </div>
      </div>
    </div>
  );
}
