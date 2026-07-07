"use client";

import { FormEvent, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  computePrice,
  formatFCFA,
  PRICE_PER_ROOM,
  visit3dBookingSchema,
  type Slot,
  type Visit3dBookingInput,
} from "@/lib/visites-3d";

type Props = {
  date: string;
  slot: Slot;
  onRequestPayment: (booking: Visit3dBookingInput) => void;
};

type FieldErrors = Partial<Record<keyof ReturnType<typeof blank>, string>>;

function blank() {
  return {
    name: "",
    company: "",
    phone: "",
    email: "",
    address: "",
    room_count: 1,
    notes: "",
  };
}

export function BookingForm({ date, slot, onRequestPayment }: Props) {
  const reduce = useReducedMotion();
  const [values, setValues] = useState(blank());
  const [errors, setErrors] = useState<FieldErrors>({});

  const price = computePrice(values.room_count);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const candidate = { date, slot, ...values };
    const parsed = visit3dBookingSchema.safeParse(candidate);
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      const fe: FieldErrors = {};
      for (const key of Object.keys(flat) as Array<keyof FieldErrors>) {
        const msgs = flat[key as keyof typeof flat];
        if (msgs && msgs.length) fe[key] = msgs[0];
      }
      setErrors(fe);
      return;
    }
    setErrors({});
    onRequestPayment(parsed.data);
  }

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-[0_18px_40px_-24px_rgba(23,18,15,0.25)] md:p-8"
    >
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-xl font-extrabold tracking-tight text-neutral-950">
            Vos informations
          </h3>
          <p className="text-sm text-neutral-500">
            Visite le{" "}
            {format(parseISO(date), "EEEE d MMMM yyyy", { locale: fr })} de{" "}
            {slot.replace("-", " à ")}
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm text-neutral-500">Tarif</div>
          <div className="text-xl font-extrabold text-primary">
            {formatFCFA(price)}
          </div>
          <div className="mt-0.5 text-xs text-neutral-500">
            {values.room_count} pièce{values.room_count > 1 ? "s" : ""} ×{" "}
            {formatFCFA(PRICE_PER_ROOM)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Nom complet" error={errors.name} required>
          <input
            type="text"
            className={input(errors.name)}
            value={values.name}
            onChange={(e) => setValues({ ...values, name: e.target.value })}
            placeholder="Awa Ouédraogo"
            autoComplete="name"
          />
        </Field>

        <Field label="Société / agence" error={errors.company}>
          <input
            type="text"
            className={input(errors.company)}
            value={values.company}
            onChange={(e) => setValues({ ...values, company: e.target.value })}
            placeholder="Immobilier Faso SARL"
            autoComplete="organization"
          />
        </Field>

        <Field label="Téléphone" error={errors.phone} required>
          <input
            type="tel"
            inputMode="tel"
            className={input(errors.phone)}
            value={values.phone}
            onChange={(e) => setValues({ ...values, phone: e.target.value })}
            placeholder="+226 70 12 34 56"
            autoComplete="tel"
          />
        </Field>

        <Field label="Email" error={errors.email}>
          <input
            type="email"
            className={input(errors.email)}
            value={values.email}
            onChange={(e) => setValues({ ...values, email: e.target.value })}
            placeholder="vous@exemple.com"
            autoComplete="email"
          />
        </Field>

        <div className="md:col-span-2">
          <Field label="Adresse du bien" error={errors.address} required>
            <input
              type="text"
              className={input(errors.address)}
              value={values.address}
              onChange={(e) =>
                setValues({ ...values, address: e.target.value })
              }
              placeholder="Quartier, secteur, point de repère"
              autoComplete="street-address"
            />
          </Field>
        </div>

        <Field label="Nombre de pièces" error={errors.room_count} required>
          <input
            type="number"
            min={1}
            max={50}
            step={1}
            inputMode="numeric"
            className={input(errors.room_count)}
            value={values.room_count}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              setValues({
                ...values,
                room_count: Number.isFinite(n) && n > 0 ? n : 1,
              });
            }}
          />
          <span className="mt-1 text-xs text-neutral-500">
            Une pièce = un espace à capturer (chambre, salon, bar, salle…).{" "}
            {formatFCFA(PRICE_PER_ROOM)} / pièce.
          </span>
        </Field>

        <div className="md:col-span-2">
          <Field label="Notes (optionnel)" error={errors.notes}>
            <textarea
              rows={3}
              className={input(errors.notes)}
              value={values.notes}
              onChange={(e) => setValues({ ...values, notes: e.target.value })}
              placeholder="Étage, accès, contraintes particulières…"
            />
          </Field>
        </div>
      </div>

      <button
        type="submit"
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary py-4 text-lg font-extrabold text-white transition-colors hover:bg-primary-hover"
      >
        Payer et réserver — {formatFCFA(price)}
      </button>
      <p className="mt-3 text-center text-xs text-neutral-400">
        Paiement Mobile Money (Orange ou Moov). Tarif total débité à la
        réservation.
      </p>
    </motion.form>
  );
}

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold text-neutral-800">
        {label}
        {required && <span className="text-primary"> *</span>}
      </span>
      {children}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}

function input(error?: string) {
  return cn(
    "w-full h-11 px-4 rounded-xl border bg-white text-[15px]",
    "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary",
    "transition-colors",
    error ? "border-red-400" : "border-neutral-200"
  );
}
