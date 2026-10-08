"use client";

import * as React from "react";
import { ChatCircleTextIcon, TrashIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/dialog";
import { Alert, type AlertTone } from "@/components/ui/alert";
import { Toast, useToast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  GuideSection,
  GuideSubsection,
  Mono,
  Specimen,
  SpecimenGrid,
} from "./primitives";

const tones: { tone: AlertTone; title: string; body: string }[] = [
  { tone: "neutral", title: "Note interne", body: "Visible uniquement par le staff, jamais par le propriétaire." },
  { tone: "info", title: "Nouveau depuis hier", body: "3 annonces ont été importées depuis l'application mobile." },
  { tone: "success", title: "Paiement reçu", body: "50 000 FCFA encaissés par Orange Money le 8 octobre 2026." },
  { tone: "warning", title: "Pièce manquante", body: "Le propriétaire n'a pas encore envoyé son titre foncier." },
  { tone: "danger", title: "Échec de l'envoi", body: "La photo dépasse 10 Mo. Compressez-la puis réessayez." },
];

export function FeedbackSection() {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [infoOpen, setInfoOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [toastOpen, showToast] = useToast();
  const [deletedToast, showDeletedToast] = useToast();

  const confirmDelete = () => {
    setDeleting(true);
    setTimeout(() => {
      setDeleting(false);
      setConfirmOpen(false);
      showDeletedToast();
    }, 1200);
  };

  return (
    <GuideSection
      id="dialogues"
      number="10"
      title="Dialogues et retours"
      intro="Ce que l'écran répond à une action: un dialogue pour confirmer, une alerte pour contextualiser, un toast pour acquitter, un squelette pendant l'attente, un état vide quand il n'y a rien. Chaque retour est spécifique et dit quoi faire ensuite."
    >
      <GuideSubsection title="Dialogue" note="<Dialog open onClose title description actions>. Échap et clic sur le fond ferment; feuille basse sur mobile.">
        <SpecimenGrid columns={2}>
          <Specimen label="Confirmation destructive" code='<Dialog size="sm" actions={<><Button variant="ghost">Annuler</Button><Button variant="destructive" loading>Supprimer</Button></>}>'>
            <Button variant="outline" onClick={() => setConfirmOpen(true)}>
              Ouvrir la confirmation
            </Button>
          </Specimen>
          <Specimen label="Contenu long" code='<Dialog size="lg">...</Dialog> (le corps défile, le titre et les actions restent)'>
            <Button variant="secondary" onClick={() => setInfoOpen(true)}>
              Ouvrir le détail
            </Button>
          </Specimen>
        </SpecimenGrid>

        <Dialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          size="sm"
          title="Supprimer cette annonce ?"
          description="Villa 4 pièces à Ouaga 2000, référence RG-00417."
          actions={
            <>
              <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={deleting}>
                Annuler
              </Button>
              <Button
                variant="destructive"
                loading={deleting}
                onClick={confirmDelete}
                leftIcon={<TrashIcon size={18} weight="bold" />}
              >
                Supprimer
              </Button>
            </>
          }
        >
          Les photos et les candidatures liées seront supprimées. Le propriétaire
          sera prévenu par WhatsApp. Cette action ne peut pas être annulée.
        </Dialog>

        <Dialog
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
          size="lg"
          title="Conditions de location"
          description="Résumé envoyé au locataire avant la signature."
          actions={
            <Button onClick={() => setInfoOpen(false)}>J&apos;ai compris</Button>
          }
        >
          <div className="space-y-3 leading-relaxed">
            <p>
              Le loyer de 350 000 FCFA est payable d&apos;avance le 1er de chaque
              mois par Orange Money ou Moov Money sur le numéro Roogo. Roogo
              reverse au propriétaire le jour même, moins 7 % de frais de
              service.
            </p>
            <p>
              La caution correspond à deux mois de loyer. Elle est restituée
              dans les 30 jours suivant l&apos;état des lieux de sortie, déduction
              faite des réparations constatées.
            </p>
            <p>
              Le locataire s&apos;engage à ne pas sous-louer le bien et à
              signaler tout dégât dans les 48 heures. Le propriétaire
              s&apos;engage à ne pas entrer dans le logement sans prévenir 24
              heures à l&apos;avance.
            </p>
            <p>
              Les deux parties acceptent que Roogo serve de premier
              interlocuteur en cas de désaccord, avant tout recours.
            </p>
          </div>
        </Dialog>
      </GuideSubsection>

      <GuideSubsection title="Alertes" note='<Alert tone="..." title action>. Le ton danger porte role="alert".'>
        <div className="space-y-3">
          {tones.map((item) => (
            <Alert key={item.tone} tone={item.tone} title={item.title}>
              {item.body}
            </Alert>
          ))}
          <Alert
            tone="warning"
            title="Avec action"
            action={
              <Button size="sm" variant="outline">
                Relancer
              </Button>
            }
          >
            Le propriétaire n&apos;a pas répondu depuis 5 jours.
          </Alert>
        </div>
        <p className="text-xs text-neutral-500">
          Code: <Mono>{'<Alert tone="success" title="Paiement reçu">…</Alert>'}</Mono>
        </p>
      </GuideSubsection>

      <GuideSubsection title="Toast" note="Pilule sombre en bas d'écran, 2,2 s, pour acquitter une action courte (copie, sauvegarde).">
        <SpecimenGrid columns={2}>
          <Specimen label="Déclencher" code="const [open, show] = useToast(); <Toast open={open}>Numéro copié</Toast>">
            <Button variant="secondary" onClick={showToast}>
              Afficher le toast
            </Button>
          </Specimen>
          <Specimen label="Aperçu statique" code='<Toast open position="inline" tone="success">'>
            <div className="flex flex-wrap gap-2">
              <Toast open position="inline">
                Numéro copié dans le presse-papiers
              </Toast>
              <Toast open position="inline" tone="danger">
                Envoi impossible, réessayez
              </Toast>
            </div>
          </Specimen>
        </SpecimenGrid>
        <Toast open={toastOpen}>Numéro copié dans le presse-papiers</Toast>
        <Toast open={deletedToast}>Annonce supprimée</Toast>
      </GuideSubsection>

      <GuideSubsection title="Squelette" note="<Skeleton /> (components/ui/skeleton.tsx) reproduit la forme du contenu attendu, pas un spinner.">
        <SpecimenGrid columns={2}>
          <Specimen label="Carte d'annonce" code='<Skeleton className="h-40 rounded-xl" /> puis des lignes h-4'>
            <div className="space-y-3">
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            </div>
          </Specimen>
          <Specimen label="Ligne de liste" code='<Skeleton className="h-12 w-12 rounded-full" /> + deux lignes'>
            <div className="space-y-4">
              {[0, 1, 2].map((index) => (
                <div key={index} className="flex items-center gap-3">
                  <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          </Specimen>
        </SpecimenGrid>
      </GuideSubsection>

      <GuideSubsection title="État vide" note="<EmptyState icon title description action>. Toujours une explication et un pas suivant.">
        <EmptyState
          icon={<ChatCircleTextIcon size={40} />}
          title="Aucune conversation"
          description="Les messages des propriétaires apparaîtront ici dès qu'un premier contact sera établi."
          action={<Button size="sm">Démarrer une conversation</Button>}
        />
      </GuideSubsection>
    </GuideSection>
  );
}
