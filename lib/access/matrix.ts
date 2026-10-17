// Who can do what in the Roogo admin, written EXACTLY as the code enforces it
// on this branch. The page /admin/acces renders from this file, and
// lib/access/matrix.test.mjs checks it against the real helpers
// (lib/team-tasks/core.ts) and against the files it cites, so the page cannot
// silently drift from the code.
//
// Rules of this file:
// - Describe behaviour, never intentions. What the vault proposal plans but
//   the code does not enforce goes in PLANNED, never in AREAS.
// - Every action names how it is enforced and the file that enforces it.
// - When the five staff columns are equal, the title does not matter for that
//   action (titleMatters: false). The test enforces that equivalence.
//
// No runtime imports: the test loads this file directly with Node.

export const LAST_REVIEWED = "2026-10-16";

export type Level = "fondateur" | "directeur" | "assistant" | "conseillere" | "stagiaire";

/** Order of the columns, highest level first. */
export const LEVELS: readonly Level[] = ["fondateur", "directeur", "assistant", "conseillere", "stagiaire"];

/** Must match LEVEL_LABELS in lib/team-tasks/core.ts (checked by the test). */
export const LEVEL_NAMES: Record<Level, string> = {
  fondateur: "Fondateur",
  directeur: "Directeur",
  assistant: "Assistant(e) commercial(e)",
  conseillere: "Conseiller(ère)",
  stagiaire: "Stagiaire",
};

/** Short names for narrow table headers. */
export const LEVEL_SHORT: Record<Level, string> = {
  fondateur: "Fondateur",
  directeur: "Directeur",
  assistant: "Assistant(e)",
  conseillere: "Conseiller(ère)",
  stagiaire: "Stagiaire",
};

export type LevelCard = { level: Level; summary: string; source: string };

export const LEVEL_CARDS: LevelCard[] = [
  {
    level: "fondateur",
    summary:
      "Tout ce que fait le personnel, plus Finances, Paramètres, les titres de l’équipe, le paiement des commissions de parrainage et les réponses aux demandes.",
    source: "Type de compte « founder » dans Clerk. Il ne se donne pas dans l’appli.",
  },
  {
    level: "directeur",
    summary:
      "Comme le personnel, plus le tableau L’équipe, donner des tâches à tout le monde, envoyer des demandes au Fondateur et suivre les visites terrain.",
    source: "Titre donné par le Fondateur dans L’équipe.",
  },
  {
    level: "assistant",
    summary:
      "Aujourd’hui, les mêmes droits qu’un(e) Conseiller(ère). Le titre s’affiche, mais ne change encore rien dans l’appli.",
    source: "Titre donné par le Fondateur dans L’équipe.",
  },
  {
    level: "conseillere",
    summary:
      "Le niveau de tout compte staff qui n’a pas d’autre titre : tout l’espace d’administration, sauf les pages et actions réservées.",
    source: "Niveau par défaut d’un compte staff.",
  },
  {
    level: "stagiaire",
    summary:
      "Aujourd’hui, les mêmes droits qu’un(e) Conseiller(ère). Le titre s’affiche, mais ne change encore rien dans l’appli.",
    source: "Titre donné par le Fondateur dans L’équipe.",
  },
];

/** Oui = can do it. Lecture = can see, not change. Non = cannot. */
export type Access = "oui" | "lecture" | "non";

/**
 * serveur = the server refuses the action (the only real protection).
 * page = the page sends the person elsewhere.
 * menu = the link is hidden from the navigation.
 */
export type Enforcement = "serveur" | "page" | "menu";

export type Rule = {
  id: string;
  action: string;
  access: Record<Level, Access>;
  /** Short precision shown under a cell, e.g. "les siennes seulement". */
  notes?: Partial<Record<Level, string>>;
  /** One plain sentence under the action. */
  detail?: string;
  enforcedBy: Enforcement[];
  /** Files (or folders ending in "/") where the rule is enforced. */
  files: string[];
  /** False when the title changes nothing: the five columns are then equal. */
  titleMatters: boolean;
};

export type Area = { id: string; title: string; intro: string; rules: Rule[] };

const ALL: Record<Level, Access> = { fondateur: "oui", directeur: "oui", assistant: "oui", conseillere: "oui", stagiaire: "oui" };
const FOUNDER_ONLY: Record<Level, Access> = { fondateur: "oui", directeur: "non", assistant: "non", conseillere: "non", stagiaire: "non" };
const DIRECTOR_AND_FOUNDER: Record<Level, Access> = { fondateur: "oui", directeur: "oui", assistant: "non", conseillere: "non", stagiaire: "non" };
const NOBODY: Record<Level, Access> = { fondateur: "non", directeur: "non", assistant: "non", conseillere: "non", stagiaire: "non" };
const ALL_READ: Record<Level, Access> = { fondateur: "lecture", directeur: "lecture", assistant: "lecture", conseillere: "lecture", stagiaire: "lecture" };

export const AREAS: Area[] = [
  {
    id: "entree",
    title: "Entrer dans l’administration",
    intro: "Le serveur vérifie d’abord que la personne est connectée et que son compte est un compte staff ou fondateur.",
    rules: [
      {
        id: "admin-open",
        action: "Ouvrir l’administration et cette page",
        detail: "Un compte propriétaire, agent ou locataire est renvoyé vers l’accueil.",
        access: ALL,
        enforcedBy: ["serveur", "page"],
        files: ["middleware.ts", "app/admin/layout.tsx", "lib/user-types.ts"],
        titleMatters: false,
      },
    ],
  },
  {
    id: "taches",
    title: "Tâches et demandes au Fondateur",
    intro: "Mon espace (le briefing) et L’équipe. C’est la seule partie de l’appli où le titre change déjà les droits.",
    rules: [
      {
        id: "briefing",
        action: "Voir son briefing et s’ajouter une tâche à soi-même",
        access: ALL,
        enforcedBy: ["serveur"],
        files: ["app/api/admin/team-tasks/route.ts", "lib/team-tasks/core.ts", "app/admin/page.tsx"],
        titleMatters: false,
      },
      {
        id: "task-give",
        action: "Donner une tâche à un membre de l’équipe",
        detail: "Hors Fondateur. Les autres titres ne peuvent s’ajouter des tâches qu’à eux-mêmes.",
        access: DIRECTOR_AND_FOUNDER,
        enforcedBy: ["serveur"],
        files: ["lib/team-tasks/core.ts", "lib/team-tasks/server.ts", "app/api/admin/team-tasks/route.ts"],
        titleMatters: true,
      },
      {
        id: "task-founder",
        action: "Donner quelque chose au Fondateur",
        detail: "Le Directeur passe par une demande, avec le pourquoi obligatoire. Personne d’autre ne peut rien donner au Fondateur.",
        access: { fondateur: "oui", directeur: "oui", assistant: "non", conseillere: "non", stagiaire: "non" },
        notes: { fondateur: "à lui-même", directeur: "une demande" },
        enforcedBy: ["serveur"],
        files: ["lib/team-tasks/core.ts", "lib/team-tasks/server.ts"],
        titleMatters: true,
      },
      {
        id: "demande-answer",
        action: "Prendre en charge ou répondre à une demande",
        access: FOUNDER_ONLY,
        notes: { fondateur: "celles qui lui sont adressées" },
        enforcedBy: ["serveur"],
        files: ["lib/team-tasks/server.ts", "app/api/admin/team-tasks/[id]/route.ts"],
        titleMatters: true,
      },
      {
        id: "task-tick",
        action: "Cocher, décocher ou reporter une tâche",
        detail: "Les siennes, ou celles qu’on a créées. Le Directeur et le Fondateur peuvent le faire pour toutes.",
        access: ALL,
        notes: { fondateur: "toutes", directeur: "toutes", assistant: "les siennes", conseillere: "les siennes", stagiaire: "les siennes" },
        enforcedBy: ["serveur"],
        files: ["lib/team-tasks/server.ts", "app/api/admin/team-tasks/[id]/route.ts"],
        titleMatters: true,
      },
      {
        id: "task-delete",
        action: "Supprimer une tâche",
        detail: "Seule la personne qui l’a créée peut la supprimer. Le Fondateur peut supprimer toutes les tâches, le Directeur non.",
        access: ALL,
        notes: { fondateur: "toutes", directeur: "celles qu’il a créées", assistant: "celles qu’il a créées", conseillere: "celles qu’il a créées", stagiaire: "celles qu’il a créées" },
        enforcedBy: ["serveur"],
        files: ["lib/team-tasks/server.ts", "app/api/admin/team-tasks/[id]/route.ts"],
        titleMatters: true,
      },
      {
        id: "auto-assign",
        action: "Attribuer un élément automatique qui n’a pas de responsable",
        access: DIRECTOR_AND_FOUNDER,
        enforcedBy: ["serveur"],
        files: ["lib/team-tasks/server.ts", "app/api/admin/team-tasks/auto/route.ts"],
        titleMatters: true,
      },
      {
        id: "auto-tick",
        action: "Cocher un élément automatique",
        access: ALL,
        notes: { fondateur: "tous", directeur: "tous", assistant: "les siens", conseillere: "les siens", stagiaire: "les siens" },
        enforcedBy: ["serveur"],
        files: ["lib/team-tasks/server.ts", "app/api/admin/team-tasks/auto/route.ts"],
        titleMatters: true,
      },
      {
        id: "board",
        action: "Voir le tableau L’équipe (la semaine de chacun)",
        access: DIRECTOR_AND_FOUNDER,
        enforcedBy: ["serveur", "page"],
        files: ["lib/team-tasks/server.ts", "app/api/admin/team-tasks/team/route.ts", "app/admin/equipe/page.tsx"],
        titleMatters: true,
      },
      {
        id: "titles",
        action: "Changer le titre d’un membre de l’équipe",
        detail: "Le titre de Fondateur ne se change pas ici : il vient du compte.",
        access: FOUNDER_ONLY,
        enforcedBy: ["serveur"],
        files: ["lib/team-tasks/server.ts", "app/api/admin/team-tasks/titles/route.ts"],
        titleMatters: true,
      },
      {
        id: "links-studio",
        action: "Lier une tâche à un projet Studio",
        detail: "Les autres liens (annonce, visite) sont ouverts à tout le personnel.",
        access: ALL,
        notes: { fondateur: "tous les projets", directeur: "ses projets", assistant: "ses projets", conseillere: "ses projets", stagiaire: "ses projets" },
        enforcedBy: ["serveur"],
        files: ["lib/team-tasks/server.ts", "app/api/admin/team-tasks/links/route.ts"],
        titleMatters: true,
      },
    ],
  },
  {
    id: "fiches",
    title: "Fiches de visite",
    intro: "La fiche de tournage remplie sur le terrain, puis envoyée à l’équipe.",
    rules: [
      {
        id: "fiche-fill",
        action: "Commencer, remplir et reprendre une fiche",
        detail: "N’importe quelle fiche, y compris celle commencée par quelqu’un d’autre.",
        access: ALL,
        enforcedBy: ["serveur", "page"],
        files: [
          "app/api/admin/field-visits/route.ts",
          "app/api/admin/field-visits/[id]/route.ts",
          "app/admin/fiche-visite/page.tsx",
          "app/admin/fiche-visite/[id]/page.tsx",
        ],
        titleMatters: false,
      },
      {
        id: "fiche-abandon",
        action: "Recommencer une nouvelle fiche (l’ancienne est abandonnée)",
        access: ALL,
        enforcedBy: ["serveur"],
        files: ["app/api/admin/field-visits/[id]/route.ts", "lib/field-visits/server.ts"],
        titleMatters: false,
      },
      {
        id: "fiche-send",
        action: "Envoyer la fiche à l’équipe (crée les six tâches)",
        detail:
          "Les tâches sont créées pour les personnes choisies, même si celui ou celle qui envoie ne pourrait pas leur donner de tâche autrement.",
        access: ALL,
        enforcedBy: ["serveur"],
        files: ["app/api/admin/field-visits/[id]/complete/route.ts", "lib/field-visits/server.ts"],
        titleMatters: false,
      },
      {
        id: "fiche-files",
        action: "Envoyer les photos et vidéos de la fiche dans le Drive",
        access: ALL,
        enforcedBy: ["serveur"],
        files: ["app/api/admin/studio/media/"],
        titleMatters: false,
      },
      {
        id: "fiche-suivi",
        action: "Suivre les visites terrain (Studio, Visites terrain)",
        access: DIRECTOR_AND_FOUNDER,
        enforcedBy: ["serveur", "page"],
        files: ["app/api/admin/field-visits/route.ts", "app/admin/studio/visites/page.tsx"],
        titleMatters: true,
      },
    ],
  },
  {
    id: "studio",
    title: "Studio",
    intro: "Visuels, voix off, musique et vidéos. Le titre ne change rien dans le Studio aujourd’hui ; seul le Fondateur a deux droits en plus.",
    rules: [
      {
        id: "studio-use",
        action: "Créer des visuels, voix off, sons, musique et vidéos",
        detail:
          "Dans un plafond mensuel par personne : 15 USD pour les visuels, voix, sons et musique, 3 USD pour les vidéos, sauf réglage particulier pour la personne.",
        access: ALL,
        enforcedBy: ["serveur"],
        files: ["app/api/admin/studio/", "lib/studio/server.ts", "lib/studio/budget.ts"],
        titleMatters: false,
      },
      {
        id: "studio-cap",
        action: "Changer un plafond de dépense",
        detail: "Il n’existe aucun écran pour cela. Le réglage se fait directement dans la base de données.",
        access: NOBODY,
        enforcedBy: ["serveur"],
        files: ["lib/studio/server.ts"],
        titleMatters: false,
      },
      {
        id: "studio-read",
        action: "Voir les projets des autres",
        detail: "L’historique du Studio est partagé avec toute l’équipe.",
        access: ALL_READ,
        enforcedBy: ["serveur"],
        files: ["lib/studio/conversations-server.ts", "app/api/admin/studio/conversations/[id]/route.ts"],
        titleMatters: false,
      },
      {
        id: "studio-write",
        action: "Modifier un projet",
        detail: "Seulement l’auteur du projet, Fondateur compris.",
        access: ALL,
        notes: { fondateur: "ses projets", directeur: "ses projets", assistant: "ses projets", conseillere: "ses projets", stagiaire: "ses projets" },
        enforcedBy: ["serveur"],
        files: ["lib/studio/conversations-server.ts", "app/api/admin/studio/artifacts/[id]/route.ts"],
        titleMatters: false,
      },
      {
        id: "glossary-edit",
        action: "Glossaire : modifier ou supprimer une entrée",
        detail: "Tout le monde lit et ajoute des entrées. Modifier ou supprimer : l’auteur, ou le Fondateur pour toutes.",
        access: ALL,
        notes: { fondateur: "toutes", directeur: "les siennes", assistant: "les siennes", conseillere: "les siennes", stagiaire: "les siennes" },
        enforcedBy: ["serveur"],
        files: ["lib/studio/glossary.ts", "app/api/admin/studio/glossary/route.ts"],
        titleMatters: true,
      },
      {
        id: "voice-clone",
        action: "Cloner sa voix (ou celle d’un invité présent)",
        detail:
          "Seulement quand l’interrupteur du clonage est allumé sur le serveur, avec la phrase de consentement lue à voix haute. Une voix par personne.",
        access: ALL,
        enforcedBy: ["serveur"],
        files: ["app/api/admin/studio/voices/clone/route.ts", "lib/studio/flags.ts", "lib/studio/voices.ts"],
        titleMatters: false,
      },
      {
        id: "voice-revoke",
        action: "Retirer une voix",
        detail: "Sa propre voix, ou la voix d’un invité qu’on a enregistrée. Le Fondateur peut retirer toutes les voix.",
        access: ALL,
        notes: { fondateur: "toutes", directeur: "la sienne", assistant: "la sienne", conseillere: "la sienne", stagiaire: "la sienne" },
        enforcedBy: ["serveur"],
        files: ["lib/studio/voices.ts", "app/api/admin/studio/voices/[id]/route.ts"],
        titleMatters: true,
      },
    ],
  },
  {
    id: "annonces",
    title: "Annonces",
    intro: "Tout le personnel a les mêmes droits sur toutes les annonces.",
    rules: [
      {
        id: "listing-edit",
        action: "Voir, créer pour un propriétaire et modifier une annonce",
        access: ALL,
        enforcedBy: ["serveur"],
        files: ["app/api/admin/properties/", "app/api/properties/route.ts", "app/api/properties/[id]/route.ts", "app/admin/annonces/"],
        titleMatters: false,
      },
      {
        id: "listing-status",
        action: "Mettre une annonce en ligne ou changer son statut",
        detail: "Une annonce ne passe en ligne qu’une fois ses documents de propriété validés.",
        access: ALL,
        enforcedBy: ["serveur"],
        files: ["app/api/properties/[id]/status/route.ts"],
        titleMatters: false,
      },
      {
        id: "listing-delete",
        action: "Supprimer une annonce",
        detail: "N’importe quelle annonce.",
        access: ALL,
        enforcedBy: ["serveur"],
        files: ["app/api/properties/[id]/route.ts"],
        titleMatters: false,
      },
      {
        id: "pending-edits",
        action: "Accepter ou refuser les modifications en attente",
        access: ALL,
        enforcedBy: ["serveur"],
        files: ["app/api/admin/pending-edits/"],
        titleMatters: false,
      },
      {
        id: "open-house",
        action: "Créer ou supprimer des créneaux de visite (Calendrier)",
        detail: "Le serveur accepte aussi les comptes propriétaire pour cette action, sans vérifier à qui est le bien.",
        access: ALL,
        enforcedBy: ["serveur"],
        files: ["app/api/admin/open-house-slots/route.ts", "app/admin/calendrier/page.tsx"],
        titleMatters: false,
      },
    ],
  },
  {
    id: "verifications",
    title: "Vérifications",
    intro: "Pièces d’identité (CNIB), titres de propriété et RCCM des hôtels : documents personnels des clients.",
    rules: [
      {
        id: "identity",
        action: "Voir les pièces d’identité et les valider ou refuser",
        access: ALL,
        enforcedBy: ["serveur"],
        files: ["app/api/admin/identity-verifications/", "lib/identity-verifications.ts"],
        titleMatters: false,
      },
      {
        id: "ownership",
        action: "Voir les documents de propriété et les valider ou refuser",
        access: ALL,
        enforcedBy: ["serveur"],
        files: ["app/api/admin/ownership-verifications/"],
        titleMatters: false,
      },
      {
        id: "hotel-rccm",
        action: "Valider le RCCM d’un hôtel",
        access: ALL,
        enforcedBy: ["serveur"],
        files: ["app/api/admin/hotel-verifications/"],
        titleMatters: false,
      },
    ],
  },
  {
    id: "demandes",
    title: "Demandes et visites",
    intro: "Appels à biens, visites, candidatures et événements des hôtels.",
    rules: [
      {
        id: "property-requests",
        action: "Gérer les appels à biens",
        access: ALL,
        enforcedBy: ["serveur"],
        files: ["app/api/property-requests/route.ts", "app/api/property-requests/[id]/route.ts"],
        titleMatters: false,
      },
      {
        id: "visit-requests",
        action: "Voir et confirmer les demandes de visite",
        access: ALL,
        enforcedBy: ["serveur"],
        files: ["app/api/admin/visit-requests/"],
        titleMatters: false,
      },
      {
        id: "applications",
        action: "Voir les candidatures locatives et les candidatures aux offres",
        access: ALL,
        enforcedBy: ["serveur", "page"],
        files: ["app/api/admin/candidatures/", "app/api/admin/careers/", "app/admin/candidatures/page.tsx"],
        titleMatters: false,
      },
      {
        id: "hotel-events",
        action: "Événements des hôtels : créer et suivre",
        access: ALL,
        enforcedBy: ["serveur"],
        files: ["app/api/events/route.ts", "app/api/admin/events/"],
        titleMatters: false,
      },
    ],
  },
  {
    id: "messages",
    title: "Ventes et messages",
    intro: "Les discussions de vente (courtage) et le support.",
    rules: [
      {
        id: "sale-chat",
        action: "Lire et répondre à toutes les discussions de vente",
        detail: "Envoyer un mandat, confirmer une visite et fixer un rendez-vous chez le notaire compris.",
        access: ALL,
        enforcedBy: ["serveur"],
        files: ["lib/sale-chat.ts", "app/api/sale-chat/"],
        titleMatters: false,
      },
      {
        id: "support",
        action: "Lire et répondre aux messages du support",
        access: ALL,
        enforcedBy: ["serveur"],
        files: ["app/api/support/admin/"],
        titleMatters: false,
      },
    ],
  },
  {
    id: "litiges",
    title: "Litiges et incidents",
    intro: "Cautions contestées et incidents des réservations à la journée.",
    rules: [
      {
        id: "disputes",
        action: "Voir et trancher un litige de caution",
        access: ALL,
        enforcedBy: ["serveur", "page"],
        files: ["app/api/admin/disputes/", "app/admin/litiges/"],
        titleMatters: false,
      },
      {
        id: "daily-issues",
        action: "Clôturer un incident de réservation à la journée",
        access: ALL,
        enforcedBy: ["serveur"],
        files: ["app/api/admin/daily-booking-issues/"],
        titleMatters: false,
      },
    ],
  },
  {
    id: "utilisateurs",
    title: "Utilisateurs et baux",
    intro: "Données personnelles de tous les comptes.",
    rules: [
      {
        id: "users-list",
        action: "Voir la liste complète des utilisateurs et leurs données (Analyses)",
        access: ALL,
        enforcedBy: ["serveur"],
        files: ["app/api/users/all/route.ts", "app/admin/utilisateurs/page.tsx"],
        titleMatters: false,
      },
      {
        id: "rental-import",
        action: "Importer un bail existant",
        access: ALL,
        enforcedBy: ["serveur"],
        files: ["app/api/admin/rental-imports/"],
        titleMatters: false,
      },
    ],
  },
  {
    id: "developpement",
    title: "Talent et parrainage",
    intro: "Recrutement et commissions des parrains.",
    rules: [
      {
        id: "talent",
        action: "Voir et traiter les candidatures Talent (recrutement)",
        access: ALL,
        enforcedBy: ["serveur"],
        files: ["app/api/admin/talent/", "app/admin/talent/page.tsx"],
        titleMatters: false,
      },
      {
        id: "referral-approve",
        action: "Parrainage : voir, approuver ou annuler une commission",
        access: ALL,
        enforcedBy: ["serveur"],
        files: ["app/api/admin/referrals/", "lib/referral-auth.ts", "app/admin/parrainage/page.tsx"],
        titleMatters: false,
      },
      {
        id: "referral-paid",
        action: "Parrainage : marquer une commission comme payée",
        access: FOUNDER_ONLY,
        enforcedBy: ["serveur"],
        files: ["app/api/admin/referrals/commissions/[id]/route.ts"],
        titleMatters: true,
      },
    ],
  },
  {
    id: "finances",
    title: "Finances et Paramètres",
    intro: "Les deux pages réservées au Fondateur. Le lien n’apparaît pas dans le menu des autres, et le serveur refuse aussi.",
    rules: [
      {
        id: "finances",
        action: "Voir les finances (transactions, revenus)",
        access: FOUNDER_ONLY,
        enforcedBy: ["serveur", "page", "menu"],
        files: ["app/admin/finances/actions.ts", "app/admin/finances/page.tsx", "lib/navigation/adminNav.ts"],
        titleMatters: true,
      },
      {
        id: "listing-transactions",
        action: "Voir les paiements liés à une annonce (fiche de l’annonce)",
        access: ALL,
        enforcedBy: ["serveur"],
        files: ["app/admin/annonces/[id]/actions.ts"],
        titleMatters: false,
      },
      {
        id: "settings",
        action: "Paramètres : prix des annonces et commissions",
        access: FOUNDER_ONLY,
        enforcedBy: ["serveur", "page", "menu"],
        files: ["app/api/admin/pricing/route.ts", "app/admin/parametres/page.tsx", "lib/navigation/adminNav.ts"],
        titleMatters: true,
      },
    ],
  },
  {
    id: "acces",
    title: "Accès de l’équipe",
    intro: "Qui entre dans l’équipe, et qui en sort.",
    rules: [
      {
        id: "join",
        action: "Donner l’accès staff à une nouvelle personne",
        detail: "Personne ne le fait dans l’appli : la personne entre elle-même le code staff (voir plus bas).",
        access: NOBODY,
        enforcedBy: ["serveur"],
        files: ["app/api/auth/verify-staff-code/route.ts", "app/personnel/rejoindre/page.tsx"],
        titleMatters: false,
      },
      {
        id: "remove",
        action: "Retirer l’accès staff d’un membre",
        detail: "Aucun écran dans l’appli. Cela se fait dans la console Clerk.",
        access: NOBODY,
        enforcedBy: ["serveur"],
        files: ["app/admin/layout.tsx"],
        titleMatters: false,
      },
    ],
  },
];

/** Non-staff app users: what the admin means for them. */
export const APP_USERS: { name: string; text: string }[] = [
  { name: "Propriétaire", text: "Aucun accès à l’administration. Gère ses propres biens depuis l’appli et « Mes biens »." },
  { name: "Agent", text: "Aucun accès à l’administration. Gère les biens qu’il publie, comme un propriétaire." },
  { name: "Locataire", text: "Aucun accès à l’administration." },
];

/** How someone becomes staff today, written for the page. */
export const STAFF_JOIN = {
  steps: [
    "La personne crée un compte Roogo, puis ouvre la page /personnel/rejoindre.",
    "Elle tape le code staff. Le serveur le compare au code secret enregistré sur le serveur (STAFF_REGISTRATION_SECRET).",
    "Si le code est bon, son compte devient un compte staff, au niveau Conseiller(ère). Personne n’a besoin de l’approuver.",
    "Le Fondateur peut ensuite lui donner un autre titre dans L’équipe.",
  ],
  risk:
    "Le code est le même pour tout le monde et ne s’arrête jamais. Si le code fuit, n’importe qui peut se donner l’accès staff : annonces, pièces d’identité, liste des utilisateurs. Le Fondateur ne reçoit aucune alerte. Si cela arrive, il faut changer le code sur le serveur et retirer le compte dans Clerk.",
  files: ["app/api/auth/verify-staff-code/route.ts", "app/personnel/rejoindre/page.tsx"],
};

/** Planned in the vault proposal, NOT enforced by this code. */
export type Planned = { id: string; topic: string; planned: string; today: string };

export const PLANNED_SOURCE =
  "Proposition « Permissions de l’équipe par titre », approuvée par Salif le 2026-10-11 (vault Roogo, 03 Operations).";

export const PLANNED: Planned[] = [
  {
    id: "p-listing-delete",
    topic: "Supprimer une annonce",
    planned: "Fondateur et Directeur seulement. L’Assistant(e) demande.",
    today: "Tout le personnel peut supprimer n’importe quelle annonce.",
  },
  {
    id: "p-listing-publish",
    topic: "Publier une annonce",
    planned: "Le ou la Conseiller(ère) publie sous le contrôle de l’Assistant(e) ou du Directeur. Le ou la Stagiaire voit seulement.",
    today: "Tout le personnel publie sans contrôle.",
  },
  {
    id: "p-documents",
    topic: "Identités et documents de propriété",
    planned: "Le ou la Conseiller(ère) voit seulement le statut. Le ou la Stagiaire n’a pas accès.",
    today: "Tout le personnel voit les documents et décide.",
  },
  {
    id: "p-pending-edits",
    topic: "Modifications en attente",
    planned: "Conseiller(ère) en lecture, Stagiaire sans accès.",
    today: "Tout le personnel accepte ou refuse.",
  },
  {
    id: "p-rental-import",
    topic: "Importer un bail",
    planned: "Fondateur, Directeur et Assistant(e) seulement.",
    today: "Tout le personnel.",
  },
  {
    id: "p-messages",
    topic: "Support et discussions de vente",
    planned: "Stagiaire sans accès. Ventes : le ou la Conseiller(ère) lit et passe la main au Directeur.",
    today: "Tout le personnel lit et répond partout.",
  },
  {
    id: "p-visits",
    topic: "Candidatures et visites",
    planned: "Stagiaire en lecture.",
    today: "Tout le personnel.",
  },
  {
    id: "p-disputes",
    topic: "Litiges et incidents des hôtels",
    planned: "Trancher : Fondateur et Directeur. Assistant(e) et Conseiller(ère) en lecture. Stagiaire sans accès.",
    today: "Tout le personnel tranche.",
  },
  {
    id: "p-users",
    topic: "Liste des utilisateurs",
    planned: "Fondateur et Directeur. L’Assistant(e) voit propriétaires et agents. Conseiller(ère) et Stagiaire sans accès.",
    today: "Tout le personnel voit tous les comptes.",
  },
  {
    id: "p-talent",
    topic: "Recrutement (Talent)",
    planned: "Fondateur et Directeur seulement.",
    today: "Tout le personnel.",
  },
  {
    id: "p-referrals",
    topic: "Commissions de parrainage",
    planned: "Approuver et marquer payée : Fondateur et Directeur seulement.",
    today: "Tout le personnel approuve ; seul le Fondateur marque payée.",
  },
  {
    id: "p-finances",
    topic: "Finances",
    planned: "Fondateur et Directeur.",
    today: "Fondateur seulement.",
  },
  {
    id: "p-studio-caps",
    topic: "Plafonds du Studio par titre",
    planned: "Par mois, vidéos puis visuels et sons : Directeur 3 et 10 USD, Conseiller(ère) 3 et 8, Assistant(e) 1 et 4, Stagiaire 0,50 et 2. Le Fondateur fixe les plafonds.",
    today: "3 et 15 USD pour chaque personne, quel que soit le titre. Aucun écran pour les changer.",
  },
  {
    id: "p-studio-intern",
    topic: "Studio pour le ou la Stagiaire",
    planned: "Ses créations sont validées par le Directeur. Pas de clonage de voix.",
    today: "Mêmes droits que tout le personnel, sans validation.",
  },
  {
    id: "p-glossary",
    topic: "Glossaire du Studio",
    planned: "Le Directeur peut aussi modifier ou supprimer l’entrée d’un autre.",
    today: "Seulement l’auteur, ou le Fondateur.",
  },
  {
    id: "p-grant",
    topic: "Qui donne les accès",
    planned:
      "Le Directeur donne ou retire les niveaux Conseiller(ère), Assistant(e) et Stagiaire, et prévient le Fondateur le jour même. Personne ne change son propre niveau.",
    today: "Seul le Fondateur change les titres. Le code staff partagé donne l’accès à quiconque le connaît.",
  },
  {
    id: "p-invitations",
    topic: "Invitations et journal des accès",
    planned: "Des invitations à la place du code partagé, un journal (qui a donné quoi, à qui, quand), un accès en plus pour 30 jours au maximum.",
    today: "Rien de tout cela sur cette version.",
  },
  {
    id: "p-nav",
    topic: "Menu selon le niveau",
    planned: "Le menu n’affiche que ce que le niveau permet.",
    today: "Le menu cache seulement Finances et Paramètres aux non-fondateurs.",
  },
];

/**
 * Who may give a task to whom, as assignmentKind() decides it for two
 * different people (giving oneself a task is always "manuel"). The test
 * compares every pair with the real function.
 */
export const TASK_ASSIGNMENT: Record<Level, Record<Level, "manuel" | "demande" | null>> = {
  fondateur: { fondateur: "manuel", directeur: "manuel", assistant: "manuel", conseillere: "manuel", stagiaire: "manuel" },
  directeur: { fondateur: "demande", directeur: "manuel", assistant: "manuel", conseillere: "manuel", stagiaire: "manuel" },
  assistant: { fondateur: null, directeur: null, assistant: null, conseillere: null, stagiaire: null },
  conseillere: { fondateur: null, directeur: null, assistant: null, conseillere: null, stagiaire: null },
  stagiaire: { fondateur: null, directeur: null, assistant: null, conseillere: null, stagiaire: null },
};

export function allRules(): Rule[] {
  return AREAS.flatMap((area) => area.rules);
}

export function findRule(id: string): Rule | undefined {
  return allRules().find((rule) => rule.id === id);
}
