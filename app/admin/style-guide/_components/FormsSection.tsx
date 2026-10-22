"use client";

import * as React from "react";
import { ClockIcon, WhatsappLogoIcon } from "@phosphor-icons/react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Radio } from "@/components/ui/radio";
import { RangeInput } from "@/components/ui/range-input";
import { FileInput } from "@/components/ui/file-input";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { FormField } from "@/components/ui/form-field";
import { Switch } from "@/components/ui/switch";
import { PhoneNumberInput } from "@/components/ui/PhoneNumberInput";
import { TimeInput24h } from "@/components/ui/TimeInput24h";
import { formatNumber } from "@/lib/format";
import { fieldClassName } from "@/components/ui/input";
import {
  GuideSection,
  GuideSubsection,
  Mono,
  Specimen,
  SpecimenGrid,
} from "./primitives";

/** The eight states every text-like control must show. */
function TextStates({
  render,
  id,
}: {
  id: string;
  render: (props: {
    id: string;
    placeholder?: string;
    defaultValue?: string;
    disabled?: boolean;
    readOnly?: boolean;
    invalid?: boolean;
    "aria-describedby"?: string;
  }) => React.ReactNode;
}) {
  return (
    <div className="grid max-w-xl gap-4">
      <FormField label="Par défaut" htmlFor={`${id}-default`}>
        {render({ id: `${id}-default` })}
      </FormField>
      <FormField label="Avec indication" htmlFor={`${id}-placeholder`}>
        {render({ id: `${id}-placeholder`, placeholder: "Ex. Villa 4 pièces" })}
      </FormField>
      <FormField label="Rempli" htmlFor={`${id}-filled`}>
        {render({ id: `${id}-filled`, defaultValue: "Villa 4 pièces à Ouaga 2000" })}
      </FormField>
      <FormField
        label="Avec aide"
        htmlFor={`${id}-help`}
        help="Le titre apparaît sur la fiche publique."
      >
        {render({
          id: `${id}-help`,
          placeholder: "Titre de l'annonce",
          "aria-describedby": `${id}-help-help`,
        })}
      </FormField>
      <FormField label="Désactivé" htmlFor={`${id}-disabled`}>
        {render({ id: `${id}-disabled`, defaultValue: "Non modifiable", disabled: true })}
      </FormField>
      <FormField label="Lecture seule" htmlFor={`${id}-readonly`}>
        {render({ id: `${id}-readonly`, defaultValue: "RG-2026-00417", readOnly: true })}
      </FormField>
      <FormField
        label="En erreur"
        htmlFor={`${id}-error`}
        error="Le titre doit faire au moins 10 caractères."
        required
      >
        {render({
          id: `${id}-error`,
          defaultValue: "Villa",
          invalid: true,
          "aria-describedby": `${id}-error-error`,
        })}
      </FormField>
      <FormField label="Survol et focus" htmlFor={`${id}-live`} help="Passez la souris, puis tabulez.">
        {render({ id: `${id}-live`, placeholder: "Essayez ici" })}
      </FormField>
    </div>
  );
}

export function FormsSection() {
  const [iso, setIso] = React.useState("BF");
  const [national, setNational] = React.useState("67006116");
  const [isoError, setIsoError] = React.useState("BF");
  const [nationalError, setNationalError] = React.useState("6700");
  const [time, setTime] = React.useState("10:30");
  const [budget, setBudget] = React.useState(150000);
  const [notify, setNotify] = React.useState(true);

  return (
    <GuideSection
      id="formulaires"
      number="08"
      title="Formulaires"
      intro="Tous les champs partagent la surface des pages de l'équipe: coins rounded-2xl, filet chaud #E2D8CC, texte de 15 px, bordure terracotta et halo léger au focus, rouge en erreur. Un champ par ligne, toujours: le libellé en capitales au-dessus, l'aide ou l'erreur en dessous, jamais à la place de l'indication."
    >
      <GuideSubsection
        title="Surface commune"
        note="Exportée par components/ui/input.tsx sous le nom fieldClassName."
      >
        <Specimen code={fieldClassName}>
          <p className="text-sm text-ink-body">
            Input, Select et Textarea réutilisent exactement cette chaîne. Les
            enveloppes composites (téléphone, fichier, zone de dépôt) reprennent
            les mêmes couleurs de bordure et de focus.
          </p>
        </Specimen>
      </GuideSubsection>

      <GuideSubsection
        title="Un champ par ligne"
        note="Règle de la maison: aucun formulaire ne met deux champs côte à côte, même sur ordinateur."
      >
        <Specimen code='<form className="grid max-w-xl gap-4"> un <FormField> par ligne </form>'>
          <p className="text-sm text-ink-body">
            Sur un téléphone comme sur un grand écran, on lit et on remplit de
            haut en bas. Deux champs sur une même ligne se lisent dans le
            mauvais ordre et se tassent sur mobile. Les exemples ci-dessous
            suivent la règle.
          </p>
        </Specimen>
      </GuideSubsection>

      <GuideSubsection title="Texte" note='<Input type="text" /> dans un <FormField>'>
        <TextStates id="text" render={(props) => <Input type="text" {...props} />} />
      </GuideSubsection>

      <GuideSubsection title="Types natifs" note="Mêmes classes, le navigateur fournit le clavier et le sélecteur.">
        <div className="grid max-w-xl gap-4">
          <FormField label="E-mail" htmlFor="email" help="Jamais obligatoire au Burkina.">
            <Input id="email" type="email" placeholder="nom@exemple.bf" autoComplete="email" />
          </FormField>
          <FormField label="Nombre" htmlFor="number" help="inputMode numeric sur mobile.">
            <Input id="number" type="number" inputMode="numeric" placeholder="0" min={0} step={1000} />
          </FormField>
          <FormField label="Date" htmlFor="date">
            <Input id="date" type="date" defaultValue="2026-10-08" />
          </FormField>
          <FormField label="Recherche" htmlFor="search">
            <Input id="search" type="search" placeholder="Rechercher un bien" />
          </FormField>
        </div>
      </GuideSubsection>

      <GuideSubsection title="Liste déroulante" note="<Select /> natif, caret Phosphor à droite.">
        <div className="grid max-w-xl gap-4">
          <FormField label="Par défaut" htmlFor="select-default">
            <Select id="select-default" defaultValue="">
              <option value="" disabled>
                Choisir un type
              </option>
              <option>Appartement</option>
              <option>Villa</option>
              <option>Boutique</option>
            </Select>
          </FormField>
          <FormField label="Rempli" htmlFor="select-filled">
            <Select id="select-filled" defaultValue="villa">
              <option value="appartement">Appartement</option>
              <option value="villa">Villa</option>
              <option value="boutique">Boutique</option>
            </Select>
          </FormField>
          <FormField label="Désactivé" htmlFor="select-disabled">
            <Select id="select-disabled" defaultValue="villa" disabled>
              <option value="villa">Villa</option>
            </Select>
          </FormField>
          <FormField label="En erreur" htmlFor="select-error" error="Choisissez un type de bien.">
            <Select id="select-error" defaultValue="" invalid>
              <option value="" disabled>
                Choisir un type
              </option>
              <option>Appartement</option>
            </Select>
          </FormField>
        </div>
      </GuideSubsection>

      <GuideSubsection title="Zone de texte" note="<Textarea rows={4} />, redimensionnable en hauteur seulement.">
        <div className="grid max-w-xl gap-4">
          <FormField
            label="Description"
            htmlFor="textarea-default"
            help="Décrivez le quartier, l'accès à l'eau et l'électricité."
          >
            <Textarea id="textarea-default" placeholder="Décrivez le bien en quelques phrases." />
          </FormField>
          <FormField
            label="Description"
            htmlFor="textarea-error"
            error="La description est trop courte (minimum 40 caractères)."
          >
            <Textarea id="textarea-error" defaultValue="Belle villa." invalid />
          </FormField>
          <FormField label="Désactivée" htmlFor="textarea-disabled">
            <Textarea id="textarea-disabled" defaultValue="Contenu verrouillé après publication." disabled rows={2} />
          </FormField>
          <FormField label="Lecture seule" htmlFor="textarea-readonly">
            <Textarea id="textarea-readonly" defaultValue="Note interne visible par le staff uniquement." readOnly rows={2} />
          </FormField>
        </div>
      </GuideSubsection>

      <GuideSubsection title="Fichiers" note="<FileInput /> pour un document, <FileDropzone /> pour des photos.">
        <div className="grid max-w-xl gap-4">
          <div className="space-y-4">
            <FormField label="Pièce d'identité" htmlFor="file-default" help="PDF ou image, 10 Mo maximum.">
              <FileInput id="file-default" accept="image/*,.pdf" />
            </FormField>
            <FormField label="Désactivé" htmlFor="file-disabled">
              <FileInput id="file-disabled" disabled />
            </FormField>
            <FormField label="En erreur" htmlFor="file-error" error="Le fichier dépasse 10 Mo.">
              <FileInput id="file-error" invalid />
            </FormField>
          </div>
          <div className="space-y-4">
            <FormField label="Photos du bien" help="JPEG ou HEIC, converties et compressées avant envoi.">
              <FileDropzone accept="image/*" hint="ou cliquez pour parcourir, JPEG et HEIC acceptés" />
            </FormField>
            <FormField label="Zone désactivée">
              <FileDropzone disabled title="Envoi indisponible" hint="Publiez l'annonce d'abord" />
            </FormField>
          </div>
        </div>
      </GuideSubsection>

      <GuideSubsection title="Curseur" note="<RangeInput /> avec piste remplie en terracotta et valeur formatée.">
        <div className="grid max-w-xl gap-4">
          <FormField label="Budget mensuel" htmlFor="range-live" help="Glissez pour changer la valeur.">
            <RangeInput
              id="range-live"
              min={25000}
              max={500000}
              step={5000}
              value={budget}
              onChange={(event) => setBudget(Number(event.target.value))}
              showValue
              formatValue={(value) => `${formatNumber(value)} F`}
            />
          </FormField>
          <FormField label="Désactivé" htmlFor="range-disabled">
            <RangeInput id="range-disabled" defaultValue={40} disabled showValue formatValue={(v) => `${v} %`} />
          </FormField>
        </div>
      </GuideSubsection>

      <GuideSubsection title="Interrupteur, cases et boutons radio" note="Le libellé est cliquable et fait partie du composant.">
        <SpecimenGrid columns={3}>
          <Specimen label="Interrupteur" code='<Switch checked onCheckedChange /> (components/ui/switch.tsx)'>
            <div className="space-y-3">
              <label className="flex items-center justify-between gap-3 text-sm font-medium text-ink">
                Notifications WhatsApp
                <Switch checked={notify} onCheckedChange={setNotify} aria-label="Notifications WhatsApp" />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm font-medium text-ink-muted">
                Désactivé
                <Switch disabled aria-label="Désactivé" />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm font-medium text-ink-muted">
                Désactivé, actif
                <Switch disabled checked aria-label="Désactivé et actif" />
              </label>
            </div>
          </Specimen>
          <Specimen label="Cases à cocher" code='<Checkbox label description invalid />'>
            <div className="space-y-3">
              <Checkbox label="Eau courante" defaultChecked />
              <Checkbox label="Électricité SONABEL" description="Compteur individuel au nom du locataire" />
              <Checkbox label="Désactivée" disabled />
              <Checkbox label="Désactivée, cochée" disabled defaultChecked />
              <Checkbox label="J'accepte le mandat" invalid />
              <p className="text-xs font-medium text-danger">Vous devez accepter le mandat.</p>
            </div>
          </Specimen>
          <Specimen label="Boutons radio" code='<Radio name="periode" label />'>
            <div className="space-y-3">
              <Radio name="periode" label="Mensuel" defaultChecked />
              <Radio name="periode" label="Journalier" description="Pour les résidences meublées" />
              <Radio name="periode" label="Désactivé" disabled />
              <Radio name="periode-error" label="Option invalide" invalid />
            </div>
          </Specimen>
        </SpecimenGrid>
      </GuideSubsection>

      <GuideSubsection title="Téléphone" note="<PhoneNumberInput /> gère l'indicatif, les chiffres seuls et l'erreur.">
        <div className="grid max-w-xl gap-4">
          <PhoneNumberInput
            label="Numéro WhatsApp"
            iso={iso}
            national={national}
            onIsoChange={setIso}
            onNationalChange={setNational}
            prefixIcon={<WhatsappLogoIcon size={18} weight="fill" className="text-success" />}
          />
          <PhoneNumberInput
            label="En erreur"
            required
            iso={isoError}
            national={nationalError}
            onIsoChange={setIsoError}
            onNationalChange={setNationalError}
            error="Un numéro burkinabè compte 8 chiffres."
          />
          <PhoneNumberInput
            label="Désactivé"
            iso="BF"
            national="53111119"
            onIsoChange={() => undefined}
            onNationalChange={() => undefined}
            disabled
          />
        </div>
      </GuideSubsection>

      <GuideSubsection title="Heure" note="<TimeInput24h /> en 24 h par pas de 5 minutes, avec bornes min et max.">
        <div className="grid max-w-xl gap-4">
          <FormField label="Heure de visite" help="Entre 08:00 et 18:00.">
            <TimeInput24h
              value={time}
              onChange={setTime}
              icon={<ClockIcon size={18} />}
              minTime="08:00"
              maxTime="18:00"
            />
          </FormField>
          <p className="text-sm text-ink-muted">
            Valeur courante: <Mono>{time}</Mono>. Ce composant a déjà les coins
            rounded-2xl de la surface commune; ses couleurs restent celles du
            calendrier des visites.
          </p>
        </div>
      </GuideSubsection>
    </GuideSection>
  );
}
