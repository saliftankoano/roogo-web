"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { useExpandableScreen } from "@/components/ui/expandable-screen";
import { hustleApplicationSchema } from "@/lib/validations";

const CAPTCHA_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CAPTCHA_LENGTH = 5;

function generateCaptchaCode(): string {
  const bytes = new Uint8Array(CAPTCHA_LENGTH);
  window.crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((value) => CAPTCHA_CHARS[value % CAPTCHA_CHARS.length])
    .join("");
}

export function HustleApplicationModal() {
  const { collapse } = useExpandableScreen();

  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [secondaryPhone, setSecondaryPhone] = useState("");
  const [proudAchievement, setProudAchievement] = useState("");
  const [difficultProblem, setDifficultProblem] = useState("");
  const [thirtyDayStrategy, setThirtyDayStrategy] = useState("");
  const [proofLinks, setProofLinks] = useState("");
  const [neighborhoodChallenge, setNeighborhoodChallenge] = useState("");
  const [captchaCode, setCaptchaCode] = useState("");
  const [captchaInput, setCaptchaInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [showValidationErrors, setShowValidationErrors] = useState(false);

  // Persistence Key
  const STORAGE_KEY = "roogo_hustle_application";

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.fullName) setFullName(data.fullName);
        if (data.email) setEmail(data.email);
        if (data.phone) setPhone(data.phone);
        if (data.secondaryPhone) setSecondaryPhone(data.secondaryPhone);
        if (data.proudAchievement) setProudAchievement(data.proudAchievement);
        if (data.difficultProblem) setDifficultProblem(data.difficultProblem);
        if (data.thirtyDayStrategy)
          setThirtyDayStrategy(data.thirtyDayStrategy);
        if (data.proofLinks) setProofLinks(data.proofLinks);
        if (data.neighborhoodChallenge)
          setNeighborhoodChallenge(data.neighborhoodChallenge);
        if (data.step) setStep(data.step);
      } catch {
        console.error("Failed to load saved application");
      }
    }
  }, []);

  // Save to localStorage whenever data changes
  useEffect(() => {
    const data = {
      fullName,
      email,
      phone,
      secondaryPhone,
      proudAchievement,
      difficultProblem,
      thirtyDayStrategy,
      proofLinks,
      neighborhoodChallenge,
      step,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [
    fullName,
    email,
    phone,
    secondaryPhone,
    proudAchievement,
    difficultProblem,
    thirtyDayStrategy,
    proofLinks,
    neighborhoodChallenge,
    step,
  ]);

  const normalizedCaptchaInput = useMemo(
    () => captchaInput.trim().toUpperCase(),
    [captchaInput],
  );

  useEffect(() => {
    setCaptchaCode(generateCaptchaCode());
  }, []);

  const regenerateCaptcha = () => {
    setCaptchaCode(generateCaptchaCode());
    setCaptchaInput("");
  };

  const isCaptchaValid =
    normalizedCaptchaInput.length === CAPTCHA_LENGTH &&
    normalizedCaptchaInput === captchaCode;

  const step1Validation = hustleApplicationSchema
    .pick({ fullName: true, email: true, phone: true, secondaryPhone: true })
    .safeParse({ fullName, email, phone, secondaryPhone });
  const isStep1Valid = step1Validation.success;

  const step2Validation = hustleApplicationSchema
    .pick({ proudAchievement: true, difficultProblem: true })
    .safeParse({ proudAchievement, difficultProblem });
  const isStep2Valid = step2Validation.success;

  const step3Validation = hustleApplicationSchema
    .pick({ thirtyDayStrategy: true })
    .safeParse({ thirtyDayStrategy });
  const isStep3Valid = step3Validation.success;

  const step4Validation = hustleApplicationSchema
    .pick({ neighborhoodChallenge: true })
    .safeParse({ neighborhoodChallenge });
  const isStep4Valid = step4Validation.success;

  const getStepError = () => {
    if (step === 1 && !isStep1Valid && !step1Validation.success) {
      return step1Validation.error.issues[0]?.message;
    }
    if (step === 2 && !isStep2Valid && !step2Validation.success) {
      return step2Validation.error.issues[0]?.message;
    }
    if (step === 3 && !isStep3Valid && !step3Validation.success) {
      return step3Validation.error.issues[0]?.message;
    }
    if (step === 4 && !isStep4Valid && !step4Validation.success) {
      return step4Validation.error.issues[0]?.message;
    }
    return null;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isCaptchaValid) {
      setSubmitError("Le code de vérification est incorrect.");
      setShowValidationErrors(true);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    // ... rest of handleSubmit

    try {
      const response = await fetch("/api/careers/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          phone,
          secondaryPhone,
          proudAchievement,
          difficultProblem,
          thirtyDayStrategy,
          proofLinks,
          neighborhoodChallenge,
          captchaCode,
          captchaInput: normalizedCaptchaInput,
        }),
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        console.error("Failed to parse JSON response:", text);
        throw new Error("Erreur serveur : réponse invalide.");
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Une erreur est survenue.");
      }

      // Clear localStorage on success
      localStorage.removeItem(STORAGE_KEY);

      setSubmitSuccess(true);
      setTimeout(() => {
        collapse();
      }, 2000);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Échec de l'envoi de la candidature. Veuillez réessayer.";
      setSubmitError(message);
      regenerateCaptcha();
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextStep = () => {
    if (
      (step === 1 && !isStep1Valid) ||
      (step === 2 && !isStep2Valid) ||
      (step === 3 && !isStep3Valid) ||
      (step === 4 && !isStep4Valid)
    ) {
      setShowValidationErrors(true);
      return;
    }
    setShowValidationErrors(false);
    setStep((s) => s + 1);
  };

  const prevStep = () => {
    setShowValidationErrors(false);
    setStep((s) => s - 1);
  };

  const stepVariants = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-white p-4 sm:p-8">
      <div className="w-full max-w-2xl">
        <AnimatePresence mode="wait">
          {submitSuccess ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center text-center"
            >
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-50 text-green-500">
                <CheckCircleIcon size={48} weight="fill" />
              </div>
              <h2 className="mb-2 text-3xl font-black text-neutral-900">
                Candidature envoyée !
              </h2>
              <p className="text-neutral-500">
                Merci {fullName.split(" ")[0]}, nous avons bien reçu votre
                candidature.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key={step}
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="flex flex-col"
            >
              {/* Header */}
              <div className="mb-10">
                <div className="mb-4 flex items-center justify-between">
                  <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-primary">
                    <SparkleIcon size={14} weight="bold" />
                    Étape {step} sur 5
                  </div>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={`h-1.5 w-8 rounded-full transition-all duration-300 ${
                          i <= step ? "bg-primary" : "bg-neutral-100"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {step === 1 && (
                  <>
                    <h2 className="text-3xl font-black text-neutral-900 sm:text-4xl">
                      Join Roogo
                    </h2>
                    <p className="mt-2 text-neutral-500">
                      Montrez-nous de quoi vous êtes capable. Nous ne cherchons
                      pas des CV parfaits, mais des gens qui font bouger les
                      choses.
                    </p>
                  </>
                )}

                {step === 2 && (
                  <>
                    <h2 className="text-3xl font-black text-neutral-900 sm:text-4xl">
                      Réalisations
                    </h2>
                    <p className="mt-2 text-neutral-500">
                      Parlez-nous de vos accomplissements et de votre
                      débrouillardise.
                    </p>
                  </>
                )}

                {step === 3 && (
                  <>
                    <h2 className="text-3xl font-black text-neutral-900 sm:text-4xl">
                      Action & Preuves
                    </h2>
                    <p className="mt-2 text-neutral-500">
                      Comment allez-vous nous aider à grandir ?
                    </p>
                  </>
                )}

                {step === 4 && (
                  <>
                    <h2 className="text-3xl font-black text-neutral-900 sm:text-4xl">
                      Le Challenge Roogo
                    </h2>
                    <p className="mt-2 text-neutral-500">
                      Un petit défi pour montrer votre détermination.
                    </p>
                  </>
                )}

                {step === 5 && (
                  <>
                    <h2 className="text-3xl font-black text-neutral-900 sm:text-4xl">
                      Dernière étape
                    </h2>
                    <p className="mt-2 text-neutral-500">
                      Vérifiez que vous n&apos;êtes pas un robot.
                    </p>
                  </>
                )}
              </div>

              {/* Form Content */}
              <div className="min-h-[300px]">
                {step === 1 && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-neutral-800">
                        Nom complet
                      </label>
                      <input
                        type="text"
                        autoFocus
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="h-16 w-full rounded-2xl border-2 border-neutral-100 bg-neutral-50 px-6 text-lg font-medium outline-none transition-all focus:border-primary/20 focus:bg-white focus:ring-4 focus:ring-primary/5"
                        placeholder="Ex: Aicha Ouedraogo"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-neutral-800">
                        Email professionnel
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-16 w-full rounded-2xl border-2 border-neutral-100 bg-neutral-50 px-6 text-lg font-medium outline-none transition-all focus:border-primary/20 focus:bg-white focus:ring-4 focus:ring-primary/5"
                        placeholder="aicha@exemple.com"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-neutral-800">
                          Numéro de téléphone
                        </label>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => {
                            const val = e.target.value
                              .replace(/\D/g, "")
                              .slice(0, 8);
                            setPhone(val);
                          }}
                          className="h-16 w-full rounded-2xl border-2 border-neutral-100 bg-neutral-50 px-6 text-lg font-medium outline-none transition-all focus:border-primary/20 focus:bg-white focus:ring-4 focus:ring-primary/5"
                          placeholder="Ex: 76 95 57 94"
                          maxLength={8}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-neutral-800">
                          Téléphone secondaire (Optionnel)
                        </label>
                        <input
                          type="tel"
                          value={secondaryPhone}
                          onChange={(e) => {
                            const val = e.target.value
                              .replace(/\D/g, "")
                              .slice(0, 8);
                            setSecondaryPhone(val);
                          }}
                          className="h-16 w-full rounded-2xl border-2 border-neutral-100 bg-neutral-50 px-6 text-lg font-medium outline-none transition-all focus:border-primary/20 focus:bg-white focus:ring-4 focus:ring-primary/5"
                          placeholder="Ex: 70 00 00 00"
                          maxLength={8}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-8">
                    <div className="space-y-3">
                      <label className="text-lg font-black text-neutral-900 leading-tight">
                        Qu&apos;est-ce que vous avez construit, vendu ou réalisé
                        dont vous êtes fier ?
                      </label>
                      <p className="text-sm text-neutral-500">
                        Expliquez ce que vous avez fait et le résultat.
                      </p>
                      <textarea
                        autoFocus
                        value={proudAchievement}
                        onChange={(e) => setProudAchievement(e.target.value)}
                        rows={4}
                        className="w-full rounded-2xl border-2 border-neutral-100 bg-neutral-50 px-6 py-4 text-lg font-medium outline-none transition-all focus:border-primary/20 focus:bg-white focus:ring-4 focus:ring-primary/5"
                        placeholder="Votre réponse..."
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-lg font-black text-neutral-900 leading-tight">
                        Parlez-nous d&apos;une fois où vous avez résolu un
                        problème difficile avec peu d&apos;aide.
                      </label>
                      <p className="text-sm text-neutral-500">
                        Quelle était la situation et qu&apos;avez-vous fait ?
                      </p>
                      <textarea
                        value={difficultProblem}
                        onChange={(e) => setDifficultProblem(e.target.value)}
                        rows={4}
                        className="w-full rounded-2xl border-2 border-neutral-100 bg-neutral-50 px-6 py-4 text-lg font-medium outline-none transition-all focus:border-primary/20 focus:bg-white focus:ring-4 focus:ring-primary/5"
                        placeholder="Votre réponse..."
                      />
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-8">
                    <div className="space-y-3">
                      <label className="text-lg font-black text-neutral-900 leading-tight">
                        Si vous rejoigniez Roogo demain, comment nous
                        aideriez-vous à obtenir plus de maisons listées sur la
                        plateforme ?
                      </label>
                      <p className="text-sm text-neutral-500">
                        Expliquez exactement ce que vous tenteriez dans vos 30
                        premiers jours.
                      </p>
                      <textarea
                        autoFocus
                        value={thirtyDayStrategy}
                        onChange={(e) => setThirtyDayStrategy(e.target.value)}
                        rows={4}
                        className="w-full rounded-2xl border-2 border-neutral-100 bg-neutral-50 px-6 py-4 text-lg font-medium outline-none transition-all focus:border-primary/20 focus:bg-white focus:ring-4 focus:ring-primary/5"
                        placeholder="Votre stratégie..."
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-lg font-black text-neutral-900 leading-tight">
                        Preuves (Optionnel)
                      </label>
                      <p className="text-sm text-neutral-500">
                        Liens, vidéos, projets, entreprises, pages de réseaux
                        sociaux, etc.
                      </p>
                      <input
                        type="text"
                        value={proofLinks}
                        onChange={(e) => setProofLinks(e.target.value)}
                        className="h-16 w-full rounded-2xl border-2 border-neutral-100 bg-neutral-50 px-6 text-lg font-medium outline-none transition-all focus:border-primary/20 focus:bg-white focus:ring-4 focus:ring-primary/5"
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                )}

                {step === 4 && (
                  <div className="space-y-4">
                    <div className="bg-primary/5 border-2 border-primary/10 rounded-3xl p-6">
                      <h3 className="text-xl font-black text-primary mb-2">
                        Challenge : Exploration de quartier
                      </h3>
                      <p className="text-neutral-700 leading-relaxed">
                        Promenez-vous dans votre quartier. Comptez combien de
                        maisons semblent vacantes.{" "}
                        <strong>Récupérez les noms et contacts</strong> des
                        propriétaires et expliquez-nous{" "}
                        <strong>comment vous les avez convaincus</strong> de
                        vous donner leurs coordonnées.
                      </p>
                    </div>
                    <textarea
                      autoFocus
                      value={neighborhoodChallenge}
                      onChange={(e) => setNeighborhoodChallenge(e.target.value)}
                      rows={6}
                      className="w-full rounded-2xl border-2 border-neutral-100 bg-neutral-50 px-6 py-4 text-lg font-medium outline-none transition-all focus:border-primary/20 focus:bg-white focus:ring-4 focus:ring-primary/5"
                      placeholder="Listez les contacts obtenus et expliquez votre approche..."
                    />
                  </div>
                )}

                {step === 5 && (
                  <div className="space-y-6">
                    <div className="rounded-3xl border-2 border-neutral-100 bg-neutral-50 p-8 text-center">
                      <p className="mb-4 text-sm font-bold text-neutral-500 uppercase tracking-widest">
                        Code de vérification (sans espaces)
                      </p>
                      <div className="mb-6 flex items-center justify-center gap-6">
                        <div className="rounded-2xl border-2 border-neutral-200 bg-white px-8 py-4 font-mono text-4xl font-black tracking-[0.3em] text-neutral-900 shadow-sm">
                          {captchaCode}
                        </div>
                        <button
                          type="button"
                          onClick={regenerateCaptcha}
                          className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-primary shadow-sm transition-transform hover:scale-110 active:scale-95"
                        >
                          <ArrowLeftIcon
                            size={20}
                            weight="bold"
                            className="rotate-180"
                          />
                        </button>
                      </div>
                      <input
                        type="text"
                        autoFocus
                        value={captchaInput}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\s/g, "");
                          setCaptchaInput(val);
                          if (submitError) setSubmitError(null);
                        }}
                        className={`h-16 w-full rounded-2xl border-2 px-6 text-center text-2xl font-black uppercase tracking-widest outline-none transition-all focus:ring-4 ${
                          submitError && showValidationErrors
                            ? "border-red-500 bg-red-50 focus:ring-red-100"
                            : "border-neutral-200 bg-white focus:border-primary/40 focus:ring-primary/5"
                        }`}
                        placeholder="TAPEZ LE CODE"
                        maxLength={CAPTCHA_LENGTH}
                      />
                    </div>
                    <div className="h-5 mt-1">
                      <AnimatePresence>
                        {submitError && showValidationErrors && (
                          <motion.p
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="text-center text-[10px] font-bold text-red-500"
                          >
                            {submitError}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                )}
              </div>

              {/* Navigation */}
              <div className="mt-12 flex items-center justify-between gap-4">
                {step > 1 ? (
                  <button
                    onClick={prevStep}
                    className="flex h-14 items-center gap-2 rounded-full px-6 font-bold text-neutral-400 transition-colors hover:text-neutral-900"
                  >
                    <ArrowLeftIcon size={20} weight="bold" />
                    Retour
                  </button>
                ) : (
                  <button
                    onClick={collapse}
                    className="flex h-14 items-center gap-2 rounded-full px-6 font-bold text-neutral-400 transition-colors hover:text-neutral-900"
                  >
                    Annuler
                  </button>
                )}

                {step < 5 ? (
                  <div className="flex flex-col items-end">
                    <Button
                      size="lg"
                      onClick={nextStep}
                      className="group h-14 rounded-full px-10"
                    >
                      Continuer
                      <ArrowRightIcon
                        size={20}
                        weight="bold"
                        className="ml-2 transition-transform group-hover:translate-x-1"
                      />
                    </Button>
                    <div className="h-5 mt-1">
                      <AnimatePresence>
                        {showValidationErrors && getStepError() && (
                          <motion.p
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="text-right text-[10px] font-bold text-red-500"
                          >
                            {getStepError()}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-end">
                    <Button
                      size="lg"
                      onClick={(e) =>
                        handleSubmit(e as unknown as FormEvent<HTMLFormElement>)
                      }
                      disabled={isSubmitting}
                      className="h-14 rounded-full px-10"
                    >
                      {isSubmitting ? "Envoi..." : "Soumettre"}
                    </Button>
                    <div className="h-5 mt-1">
                      <AnimatePresence>
                        {showValidationErrors &&
                          (submitError || !isCaptchaValid) && (
                            <motion.p
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              className="text-right text-[10px] font-bold text-red-500"
                            >
                              {submitError ||
                                "Le code de vérification est incorrect."}
                            </motion.p>
                          )}
                      </AnimatePresence>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
