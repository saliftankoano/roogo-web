"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  MapPinIcon,
  HouseIcon,
  BedIcon,
  ArmchairIcon,
  WalletIcon,
  ClockIcon,
  CheckCircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";

const preferencesSchema = z.object({
  location: z.enum(["Ouagadougou", "Bobo-Dioulasso"], {
    message: "Choisissez une ville",
  }),
  propertyTypes: z
    .array(z.enum(["Appartement", "Villa", "Commercial"]))
    .min(1, "Choisissez au moins un type de bien"),
  rooms: z.enum(["Studio", "1", "2", "3", "4+"]).optional(),
  furnished: z.enum(["Meublé", "Non meublé", "Peu importe"]).optional(),
  budget: z
    .number({ invalid_type_error: "Entrez un montant valide" })
    .int("Entrez un montant entier")
    .min(0)
    .max(100_000_000, "Montant trop élevé")
    .optional(),
  moveInUrgency: z.enum(
    ["Ce mois-ci", "Dans 1-3 mois", "Je regarde seulement"],
    { message: "Choisissez quand vous souhaitez emménager" },
  ),
});

type PreferencesOutput = z.infer<typeof preferencesSchema>;
type FieldErrors = Partial<Record<keyof PreferencesOutput, string>>;

interface RenterPreferencesStepProps {
  onNext: (prefs: PreferencesOutput) => void;
}

const CITIES = ["Ouagadougou", "Bobo-Dioulasso"] as const;
const PROPERTY_TYPES = ["Appartement", "Villa", "Commercial"] as const;
const ROOM_OPTIONS = ["Studio", "1", "2", "3", "4+"] as const;
const FURNISHED_OPTIONS = ["Meublé", "Non meublé", "Peu importe"] as const;
const URGENCY_OPTIONS = [
  "Ce mois-ci",
  "Dans 1-3 mois",
  "Je regarde seulement",
] as const;

const CHIP =
  "px-5 py-2.5 rounded-xl font-bold text-sm transition-all border cursor-pointer select-none";
const CHIP_ACTIVE = "bg-primary border-primary text-white shadow-lg shadow-primary/20";
const CHIP_IDLE = "bg-[#1C1510] border-[#3D3027] text-neutral-400 hover:border-[#5A4535]";
const CHIP_ERROR = "bg-[#1C1510] border-red-500/50 text-neutral-400 hover:border-red-400";

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs text-red-400 mt-1">
      <WarningCircleIcon size={13} weight="fill" />
      {msg}
    </p>
  );
}

export function RenterPreferencesStep({ onNext }: RenterPreferencesStepProps) {
  const [location, setLocation] = useState<string>("");
  const [propertyTypes, setPropertyTypes] = useState<string[]>([]);
  const [rooms, setRooms] = useState<string>("");
  const [furnished, setFurnished] = useState<string>("");
  const [budgetRaw, setBudgetRaw] = useState<string>("");
  const [moveInUrgency, setMoveInUrgency] = useState<string>("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [shakeKey, setShakeKey] = useState(0);

  const togglePropertyType = (type: string) => {
    setPropertyTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
    if (errors.propertyTypes) setErrors((e) => ({ ...e, propertyTypes: undefined }));
  };

  const parseBudget = (raw: string): number | undefined => {
    const cleaned = raw.replace(/\s/g, "");
    if (cleaned === "") return undefined;
    const n = parseInt(cleaned, 10);
    return Number.isFinite(n) ? n : undefined;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = preferencesSchema.safeParse({
      location: location || undefined,
      propertyTypes,
      rooms: rooms || undefined,
      furnished: furnished || undefined,
      budget: parseBudget(budgetRaw),
      moveInUrgency: moveInUrgency || undefined,
    });

    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof PreferencesOutput;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      setShakeKey((k) => k + 1);
      return;
    }

    setErrors({});
    onNext(parsed.data);
  };

  return (
    <div className="w-full max-w-2xl py-8 text-left space-y-8">
      <div className="space-y-3 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl font-bold text-white tracking-tight"
        >
          Qu&apos;est-ce que vous cherchez ?
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-neutral-400 leading-relaxed"
        >
          Personnalisez votre recherche pour obtenir les meilleurs résultats.
        </motion.p>
      </div>

      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        onSubmit={handleSubmit}
        className="space-y-8"
      >
        {/* Row 1 — Localisation + Type de bien */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <label className="text-sm font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
              <MapPinIcon size={16} weight="bold" className="text-primary" />
              Localisation *
            </label>
            <div className="flex flex-wrap gap-2">
              {CITIES.map((city) => (
                <button
                  key={city}
                  type="button"
                  onClick={() => {
                    setLocation(city);
                    setErrors((e) => ({ ...e, location: undefined }));
                  }}
                  className={`${CHIP} ${location === city ? CHIP_ACTIVE : errors.location ? CHIP_ERROR : CHIP_IDLE}`}
                >
                  {city}
                </button>
              ))}
            </div>
            <FieldError msg={errors.location} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
              <HouseIcon size={16} weight="bold" className="text-primary" />
              Type de bien *
            </label>
            <div className="flex flex-wrap gap-2">
              {PROPERTY_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => togglePropertyType(type)}
                  className={`${CHIP} ${propertyTypes.includes(type) ? CHIP_ACTIVE : errors.propertyTypes ? CHIP_ERROR : CHIP_IDLE}`}
                >
                  {type}
                </button>
              ))}
            </div>
            <FieldError msg={errors.propertyTypes} />
          </div>
        </div>

        {/* Row 2 — Chambres + Ameublement */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <label className="text-sm font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
              <BedIcon size={16} weight="bold" className="text-primary" />
              Chambres
            </label>
            <div className="flex flex-wrap gap-2">
              {ROOM_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setRooms(rooms === option ? "" : option)}
                  className={`${CHIP} ${rooms === option ? CHIP_ACTIVE : CHIP_IDLE}`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
              <ArmchairIcon size={16} weight="bold" className="text-primary" />
              Ameublement
            </label>
            <div className="flex flex-wrap gap-2">
              {FURNISHED_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFurnished(furnished === option ? "" : option)}
                  className={`${CHIP} ${furnished === option ? CHIP_ACTIVE : CHIP_IDLE}`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Row 3 — Budget + Urgence */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <label className="text-sm font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
              <WalletIcon size={16} weight="bold" className="text-primary" />
              Budget max (XOF/mois)
            </label>
            <Input
              type="text"
              inputMode="numeric"
              value={budgetRaw}
              onChange={(e) => {
                setBudgetRaw(e.target.value.replace(/[^\d\s]/g, ""));
                setErrors((err) => ({ ...err, budget: undefined }));
              }}
              placeholder="Ex: 150 000"
              className={`h-12 bg-[#1C1510] text-white rounded-xl font-bold ${errors.budget ? "border-red-500/70 focus:ring-red-500" : "border-[#3D3027] focus:ring-primary"}`}
            />
            <FieldError msg={errors.budget} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
              <ClockIcon size={16} weight="bold" className="text-primary" />
              Emménagement *
            </label>
            <div className="flex flex-col gap-2">
              {URGENCY_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setMoveInUrgency(option);
                    setErrors((e) => ({ ...e, moveInUrgency: undefined }));
                  }}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm transition-all border ${
                    moveInUrgency === option
                      ? CHIP_ACTIVE
                      : errors.moveInUrgency
                        ? CHIP_ERROR
                        : CHIP_IDLE
                  }`}
                >
                  {option}
                  {moveInUrgency === option && <CheckCircleIcon size={18} weight="fill" />}
                </button>
              ))}
            </div>
            <FieldError msg={errors.moveInUrgency} />
          </div>
        </div>

        <motion.div
          key={shakeKey}
          animate={shakeKey > 0 ? { x: [0, -10, 10, -10, 10, -5, 5, 0] } : {}}
          transition={{ duration: 0.45, ease: "easeInOut" }}
        >
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full h-14 rounded-xl font-bold text-lg shadow-lg transition-all"
          >
            Continuer
          </Button>
        </motion.div>
      </motion.form>
    </div>
  );
}
