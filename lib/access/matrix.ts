// Who can do what in the Roogo admin, written EXACTLY as the code enforces it
// on this branch. The page /admin/acces (tab « Qui peut faire quoi ») renders from this file, and
// lib/access/matrix.test.mjs checks it against the real helpers
// (lib/team-tasks/core.ts and the capability matrix of lib/staff-access.ts)
// and against the files it cites, so the page cannot silently drift from the
// code.
//
// Rules of this file:
// - Describe behaviour, never intentions. What the vault proposal plans but
//   the code does not enforce goes in PLANNED, never in AREAS.
// - Every action names how it is enforced and the file that enforces it.
// - When the five staff columns are equal, the title does not matter for that
//   action (titleMatters: false). The test enforces that equivalence.
// - A rule that names a `capability` (and, for "lecture" cells, a
//   `readCapability`) must match STAFF_CAPABILITY_MATRIX column for column,
//   and one of its files must use that capability.
//
// No runtime imports: the test loads this file directly with Node.

export const LAST_REVIEWED = "2026-10-18";

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
      "Tout, y compris les Paramètres, la nomination d’un Directeur, les réponses aux demandes, la validation des publications du Studio, les objectifs de l’équipe (objectifs et leviers) et la connexion du compte TikTok.",
    source: "Type de compte « founder » dans Clerk. Il ne se donne pas dans l’appli.",
  },
  {
    level: "directeur",
    summary:
      "Le tableau L’équipe, des tâches pour tout le monde, des demandes au Fondateur, le suivi des visites terrain, toutes les notes d’appels, les chiffres des objectifs, le statut « Vendu », les Finances en lecture, la suppression d’annonces, les litiges, le recrutement, le parrainage. Donne les niveaux Assistant(e), Conseiller(ère) et Stagiaire.",
    source: "Niveau donné par le Fondateur (Accès, onglet Niveaux et invitations, ou L’équipe).",
  },
  {
    level: "assistant",
    summary:
      "Met les annonces en ligne, valide les identités et les documents de propriété, accepte les modifications, importe les baux, répond dans les discussions de vente, voit propriétaires et agents.",
    source: "Niveau donné par le Fondateur ou un Directeur.",
  },
  {
    level: "conseillere",
    summary:
      "Crée et modifie les annonces sans les mettre en ligne, voit le statut des vérifications, répond au support, lit les discussions de vente, gère les visites et les candidatures.",
    source: "Niveau donné par le Fondateur ou un Directeur. Dans les tâches, un compte staff sans niveau compte comme Conseiller(ère).",
  },
  {
    level: "stagiaire",
    summary:
      "Voit les annonces, les candidatures et les visites, utilise le Studio dans un petit plafond, sans cloner de voix.",
    source: "Niveau donné par le Fondateur ou un Directeur, ou par le code staff partagé.",
  },
];

/**
 * A staff account with no level yet. While the server switch
 * STAFF_LEVELS_ENFORCED is off it keeps the access staff had before levels
 * (the "legacy" level of lib/staff-access.ts); once it is on, it acts as
 * Conseiller(ère). The test checks LEGACY_MISSING against the code.
 */
export const LEGACY_MISSING = ["finances.view", "settings.manage", "studio.moderateGlossary", "team.manage"];

export const UNLEVELED = {
  title: "Compte staff sans niveau",
  whileOff:
    "Tant que l’interrupteur des niveaux (STAFF_LEVELS_ENFORCED) n’est pas activé sur le serveur, un compte staff sans niveau garde l’accès d’avant les niveaux : tout sauf Finances, Paramètres et l’onglet Niveaux et invitations. Les colonnes ci-dessous s’appliquent dès qu’une personne a un niveau.",
  whenOn:
    "L’interrupteur des niveaux est activé : un compte staff sans niveau a les droits d’un(e) Conseiller(ère).",
};

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
  /** StaffCapability (lib/staff-access.ts) behind the "oui" cells. */
  capability?: string;
  /** StaffCapability behind the "lecture" cells, when they differ. */
  readCapability?: string;
};

export type Area = { id: string; title: string; intro: string; rules: Rule[] };

const ALL: Record<Level, Access> = { fondateur: "oui", directeur: "oui", assistant: "oui", conseillere: "oui", stagiaire: "oui" };
const FOUNDER_ONLY: Record<Level, Access> = { fondateur: "oui", directeur: "non", assistant: "non", conseillere: "non", stagiaire: "non" };
const DIRECTOR_AND_FOUNDER: Record<Level, Access> = { fondateur: "oui", directeur: "oui", assistant: "non", conseillere: "non", stagiaire: "non" };
const UP_TO_ASSISTANT: Record<Level, Access> = { fondateur: "oui", directeur: "oui", assistant: "oui", conseillere: "non", stagiaire: "non" };
const UP_TO_ADVISOR: Record<Level, Access> = { fondateur: "oui", directeur: "oui", assistant: "oui", conseillere: "oui", stagiaire: "non" };
const NOBODY: Record<Level, Access> = { fondateur: "non", directeur: "non", assistant: "non", conseillere: "non", stagiaire: "non" };
const ALL_READ: Record<Level, Access> = { fondateur: "lecture", directeur: "lecture", assistant: "lecture", conseillere: "lecture", stagiaire: "lecture" };

export const AREAS: Area[] = [
  {
    id: "entree",
    title: "Entrer dans l’administration",
    intro: "Le serveur vérifie d’abord que la personne est connectée et que son compte est un compte staff ou fondateur. Le menu n’affiche ensuite que ce que le niveau permet.",
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
    intro: "Accueil (le briefing) et L’équipe. Le titre de chacun est son niveau d’accès.",
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
        detail: "Hors Fondateur. Les autres niveaux ne peuvent s’ajouter des tâches qu’à eux-mêmes.",
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
        action: "Répondre à une demande : « Je m’en occupe », « Oui, vas-y » ou « Pas maintenant »",
        detail: "« Pas maintenant » cache la demande jusqu’au jour choisi, puis elle revient en attente.",
        access: FOUNDER_ONLY,
        notes: { fondateur: "celles qui lui sont adressées" },
        enforcedBy: ["serveur"],
        files: ["lib/team-tasks/server.ts", "lib/team-tasks/core.ts", "app/api/admin/team-tasks/[id]/route.ts"],
        titleMatters: true,
      },
      {
        id: "demande-thread",
        action: "Écrire une réponse sur une demande et la marquer « Réglé »",
        detail: "Seuls le Fondateur à qui la demande est adressée et le Directeur qui l’a envoyée écrivent. Le Fondateur commence la discussion.",
        access: { fondateur: "oui", directeur: "oui", assistant: "non", conseillere: "non", stagiaire: "non" },
        notes: { fondateur: "celles qui lui sont adressées", directeur: "celles qu’il a envoyées" },
        enforcedBy: ["serveur"],
        files: ["lib/team-tasks/core.ts", "lib/team-tasks/server.ts", "app/api/admin/team-tasks/[id]/route.ts"],
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
        id: "call-tick",
        action: "Cocher une tâche d’appel",
        detail: "Seulement une fois le résultat noté avec « Appeler et noter ». Règle validée par Salif le 2026-10-16.",
        access: ALL,
        notes: { fondateur: "après la note", directeur: "après la note", assistant: "après la note", conseillere: "après la note", stagiaire: "après la note" },
        enforcedBy: ["serveur"],
        files: ["lib/team-tasks/core.ts", "lib/team-tasks/server.ts", "app/api/admin/team-tasks/[id]/route.ts"],
        titleMatters: false,
      },
      {
        id: "call-note",
        action: "Noter un appel (résultat, notes, suite)",
        detail: "Sur ses tâches d’appel, ou celles qu’on a données. La suite crée la tâche qui va avec (rappel, visite à confirmer, passer au Directeur).",
        access: ALL,
        notes: { fondateur: "toutes", directeur: "toutes", assistant: "les siennes", conseillere: "les siennes", stagiaire: "les siennes" },
        enforcedBy: ["serveur"],
        files: ["app/api/admin/call-notes/route.ts", "lib/team-tasks/calls-server.ts"],
        titleMatters: true,
      },
      {
        id: "call-read",
        action: "Lire les notes d’appel",
        detail: "Une note est visible par la personne qui a appelé, le Directeur et le Fondateur.",
        access: ALL,
        notes: { fondateur: "toutes", directeur: "toutes", assistant: "les siennes", conseillere: "les siennes", stagiaire: "les siennes" },
        enforcedBy: ["serveur"],
        files: ["lib/team-tasks/calls-server.ts", "lib/team-tasks/core.ts"],
        titleMatters: true,
      },
      {
        id: "call-log",
        action: "Voir la page Notes d’appels",
        access: DIRECTOR_AND_FOUNDER,
        enforcedBy: ["serveur", "page"],
        files: ["lib/team-tasks/calls-server.ts", "app/admin/notes-appels/page.tsx", "app/api/admin/call-notes/route.ts"],
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
        files: ["lib/team-tasks/server.ts", "app/api/admin/team-tasks/team/route.ts", "app/admin/equipe/page.tsx", "app/admin/equipe/layout.tsx"],
        titleMatters: true,
      },
      {
        id: "titles",
        action: "Changer le titre d’un membre depuis L’équipe",
        detail: "Le titre est le niveau d’accès : le changer ici change aussi ses droits, et le changement est inscrit au journal des accès.",
        access: FOUNDER_ONLY,
        enforcedBy: ["serveur"],
        files: ["lib/team-tasks/server.ts", "app/api/admin/team-tasks/titles/route.ts", "lib/staff-team-server.ts"],
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
    id: "objectifs",
    title: "Nos objectifs",
    intro: "Les objectifs de l’équipe, leurs leviers et leurs preuves. Tout le monde voit tout ; chaque chiffre vient d’un enregistrement.",
    rules: [
      {
        id: "goals-view",
        action: "Voir les objectifs, les leviers et les preuves",
        detail: "Les preuves sur les utilisateurs ne montrent que des nombres par semaine, jamais un nom, un e-mail ou un téléphone.",
        access: ALL,
        enforcedBy: ["serveur", "page"],
        files: ["app/api/admin/goals/route.ts", "app/admin/objectifs/page.tsx", "lib/team-goals/server.ts"],
        titleMatters: false,
      },
      {
        id: "goals-manage",
        action: "Créer, modifier ou retirer un objectif et ses leviers",
        detail: "Ajouter un objectif, changer la cible, le retirer (avec « Annuler »), ajouter ou modifier un levier. Les ventes se comptent avec le statut « Vendu » de l’annonce.",
        access: FOUNDER_ONLY,
        enforcedBy: ["serveur"],
        files: [
          "lib/team-goals/server.ts",
          "app/api/admin/goals/route.ts",
          "app/api/admin/goals/[id]/route.ts",
          "app/api/admin/goals/levers/route.ts",
        ],
        titleMatters: true,
      },
      {
        id: "social-connect",
        action: "Connecter ou déconnecter le compte TikTok (abonnés lus chaque nuit)",
        detail: "Une seule fois, avec le compte @roogo.226 sur TikTok. Les jetons restent chiffrés sur le serveur ; personne ne les voit.",
        access: FOUNDER_ONLY,
        enforcedBy: ["serveur"],
        files: [
          "app/api/admin/social/tiktok/_shared.ts",
          "app/api/admin/social/tiktok/connect/route.ts",
          "app/api/admin/social/tiktok/callback/route.ts",
          "app/api/admin/social/tiktok/disconnect/route.ts",
          "app/api/admin/social/tiktok/status/route.ts",
        ],
        titleMatters: true,
      },
      {
        id: "goal-reading",
        action: "Saisir un chiffre à la main (abonnés), avec sa capture d’écran",
        access: DIRECTOR_AND_FOUNDER,
        enforcedBy: ["serveur"],
        files: ["lib/team-goals/core.ts", "lib/team-goals/server.ts", "app/api/admin/goals/readings/route.ts"],
        titleMatters: true,
      },
      {
        id: "lever-tick",
        action: "Compter un levier fait cette semaine (+1)",
        access: ALL,
        notes: { fondateur: "tous", directeur: "tous", assistant: "les siens", conseillere: "les siens", stagiaire: "les siens" },
        enforcedBy: ["serveur"],
        files: ["lib/team-goals/core.ts", "app/api/admin/goals/levers/[id]/route.ts"],
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
    intro: "Visuels, voix off, musique et vidéos, dans un plafond mensuel par personne.",
    rules: [
      {
        id: "studio-use",
        action: "Créer des visuels, voix off, sons, musique et vidéos",
        detail:
          "Le plafond mensuel est fixé quand le niveau est donné (vidéos, puis visuels et sons) : Directeur 3 et 10 USD, Conseiller(ère) 3 et 8, Assistant(e) 1 et 4, Stagiaire 0,5 et 2. Sans niveau : 15 USD pour les visuels, voix, sons et musique, 3 USD pour les vidéos.",
        access: ALL,
        capability: "studio.use",
        enforcedBy: ["serveur", "page", "menu"],
        files: ["app/api/admin/studio/", "lib/studio/server.ts", "lib/studio/budget.ts", "lib/staff-team.ts", "app/admin/studio/layout.tsx"],
        titleMatters: false,
      },
      {
        id: "studio-cap",
        action: "Changer un plafond de dépense à la main",
        detail: "Il n’existe aucun écran pour cela. Donner un niveau fixe le plafond du niveau ; un autre réglage se fait directement dans la base de données.",
        access: NOBODY,
        enforcedBy: ["serveur"],
        files: ["lib/studio/server.ts", "lib/staff-team-server.ts"],
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
        access: UP_TO_ADVISOR,
        capability: "studio.cloneVoice",
        enforcedBy: ["serveur"],
        files: ["app/api/admin/studio/voices/clone/route.ts", "app/api/admin/studio/voices/challenge/route.ts", "lib/studio/flags.ts", "lib/studio/voices.ts"],
        titleMatters: true,
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
      {
        id: "publish-plan",
        action: "Calendrier de publication : planifier, rédiger et envoyer une publication à valider",
        detail:
          "Toute l’équipe voit le calendrier, crée les publications d’une visite, demande la description et les hashtags à l’IA, modifie et envoie à valider. Modifier une publication validée lui retire la validation.",
        access: ALL,
        enforcedBy: ["serveur"],
        files: [
          "app/api/admin/studio/publications/route.ts",
          "app/api/admin/studio/publications/visit/route.ts",
          "app/api/admin/studio/publications/propose/route.ts",
          "app/api/admin/studio/publications/description/route.ts",
          "app/api/admin/studio/publications/caption/route.ts",
          "app/api/admin/studio/publications/media/route.ts",
          "app/api/admin/studio/publications/for-artifact/route.ts",
          "app/api/admin/studio/publications/[id]/route.ts",
          "lib/studio/publishing.ts",
        ],
        titleMatters: false,
      },
      {
        id: "publish-approve",
        action: "Valider une publication, ou la renvoyer à l’équipe avec un commentaire",
        detail:
          "Rien ne part sur Facebook ou Instagram sans cette validation. Une publication validée part seule à l’heure prévue. Le nombre de publications à valider n’est montré qu’au Fondateur. TikTok se publie encore à la main.",
        access: FOUNDER_ONLY,
        enforcedBy: ["serveur"],
        files: [
          "app/api/admin/studio/publications/[id]/route.ts",
          "app/api/admin/studio/publications/waiting/route.ts",
          "lib/studio/publishing.ts",
          "lib/studio/publishing-server.ts",
        ],
        titleMatters: true,
      },
      {
        id: "publish-retry",
        action: "Relancer une publication en échec",
        detail: "Seulement une publication déjà validée par le Fondateur. Seuls les réseaux en échec sont relancés.",
        access: ALL,
        enforcedBy: ["serveur"],
        files: ["app/api/admin/studio/publications/[id]/route.ts", "lib/studio/publishing.ts"],
        titleMatters: false,
      },
      {
        id: "publish-delete",
        action: "Supprimer une publication planifiée",
        detail: "Jamais une publication en ligne ou en cours d’envoi.",
        access: ALL,
        notes: { fondateur: "toutes", directeur: "les siennes", assistant: "les siennes", conseillere: "les siennes", stagiaire: "les siennes" },
        enforcedBy: ["serveur"],
        files: ["app/api/admin/studio/publications/[id]/route.ts"],
        titleMatters: true,
      },
    ],
  },
  {
    id: "annonces",
    title: "Annonces",
    intro: "Tout le personnel voit toutes les annonces. Mettre en ligne, supprimer et « Vendu » dépendent du niveau.",
    rules: [
      {
        id: "listing-edit",
        action: "Voir, créer pour un propriétaire et modifier une annonce",
        detail: "Le ou la Stagiaire ouvre les annonces, mais ne peut pas chercher le propriétaire ou le locataire d’une annonce.",
        access: ALL,
        notes: { stagiaire: "sans recherche de propriétaire" },
        capability: "listings.view",
        enforcedBy: ["serveur", "page"],
        files: [
          "app/api/admin/properties/",
          "app/api/properties/route.ts",
          "app/api/properties/[id]/route.ts",
          "app/api/users/owners-agents/route.ts",
          "app/api/users/renters/route.ts",
          "app/admin/annonces/",
        ],
        titleMatters: true,
      },
      {
        id: "listing-status",
        action: "Mettre une annonce en ligne",
        detail: "Une annonce ne passe en ligne qu’une fois ses documents de propriété validés. Le ou la Conseiller(ère) prépare, l’Assistant(e) ou le Directeur met en ligne. Les autres statuts, « Vendu » à part, restent ouverts à tout le personnel.",
        access: UP_TO_ASSISTANT,
        capability: "listings.publish",
        enforcedBy: ["serveur"],
        files: ["app/api/properties/[id]/status/route.ts", "app/api/properties/route.ts"],
        titleMatters: true,
      },
      {
        id: "listing-sold",
        action: "Marquer une annonce de vente comme vendue, ou retirer « Vendu »",
        detail: "Avec la date de signature chez le notaire et le prix de vente. Seulement une annonce de vente, jamais une annonce de test. C’est ce statut qui compte les ventes dans Nos objectifs.",
        access: DIRECTOR_AND_FOUNDER,
        enforcedBy: ["serveur"],
        files: ["app/api/properties/[id]/status/route.ts", "lib/property-status.ts"],
        titleMatters: true,
      },
      {
        id: "listing-delete",
        action: "Supprimer une annonce",
        access: DIRECTOR_AND_FOUNDER,
        capability: "listings.delete",
        enforcedBy: ["serveur"],
        files: ["app/api/properties/[id]/route.ts"],
        titleMatters: true,
      },
      {
        id: "pending-edits",
        action: "Accepter ou refuser les modifications en attente",
        access: { fondateur: "oui", directeur: "oui", assistant: "oui", conseillere: "lecture", stagiaire: "non" },
        capability: "pendingEdits.act",
        readCapability: "pendingEdits.view",
        enforcedBy: ["serveur", "page"],
        files: ["app/api/admin/pending-edits/", "app/admin/modifications/layout.tsx"],
        titleMatters: true,
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
        access: { fondateur: "oui", directeur: "oui", assistant: "oui", conseillere: "lecture", stagiaire: "non" },
        notes: { conseillere: "le statut seulement" },
        capability: "identity.review",
        readCapability: "identity.status",
        enforcedBy: ["serveur", "page"],
        files: ["app/api/admin/identity-verifications/", "lib/identity-verifications.ts", "app/admin/verifications/layout.tsx"],
        titleMatters: true,
      },
      {
        id: "ownership",
        action: "Voir les documents de propriété et les valider ou refuser",
        access: { fondateur: "oui", directeur: "oui", assistant: "oui", conseillere: "lecture", stagiaire: "non" },
        notes: { conseillere: "le statut seulement" },
        capability: "ownership.review",
        readCapability: "ownership.status",
        enforcedBy: ["serveur", "page"],
        files: ["app/api/admin/ownership-verifications/", "app/admin/verifications-propriete/layout.tsx"],
        titleMatters: true,
      },
      {
        id: "hotel-rccm",
        action: "Valider le RCCM d’un hôtel",
        access: { fondateur: "oui", directeur: "oui", assistant: "oui", conseillere: "lecture", stagiaire: "non" },
        notes: { conseillere: "le statut seulement" },
        capability: "identity.review",
        readCapability: "identity.status",
        enforcedBy: ["serveur", "page"],
        files: ["app/api/admin/hotel-verifications/", "app/admin/verifications-hotels/layout.tsx"],
        titleMatters: true,
      },
    ],
  },
  {
    id: "demandes",
    title: "Demandes et visites",
    intro: "Appels à biens, visites, candidatures locatives et événements des hôtels.",
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
        access: { fondateur: "oui", directeur: "oui", assistant: "oui", conseillere: "oui", stagiaire: "lecture" },
        capability: "applications.manage",
        readCapability: "applications.view",
        enforcedBy: ["serveur"],
        files: ["app/api/admin/visit-requests/"],
        titleMatters: true,
      },
      {
        id: "applications",
        action: "Voir les candidatures locatives",
        access: ALL,
        capability: "applications.view",
        enforcedBy: ["serveur", "page"],
        files: ["app/api/admin/candidatures/applications/route.ts", "app/api/admin/candidatures/locks/route.ts", "app/admin/candidatures/page.tsx"],
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
        access: { fondateur: "oui", directeur: "oui", assistant: "oui", conseillere: "lecture", stagiaire: "non" },
        capability: "saleChat.reply",
        readCapability: "saleChat.view",
        enforcedBy: ["serveur"],
        files: ["lib/sale-chat.ts", "app/api/sale-chat/"],
        titleMatters: true,
      },
      {
        id: "support",
        action: "Lire et répondre aux messages du support",
        access: UP_TO_ADVISOR,
        capability: "support.reply",
        enforcedBy: ["serveur", "page"],
        files: ["app/api/support/admin/", "app/admin/assistance/layout.tsx"],
        titleMatters: true,
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
        access: { fondateur: "oui", directeur: "oui", assistant: "lecture", conseillere: "lecture", stagiaire: "non" },
        capability: "disputes.resolve",
        readCapability: "disputes.view",
        enforcedBy: ["serveur", "page"],
        files: ["app/api/admin/disputes/", "app/admin/litiges/"],
        titleMatters: true,
      },
      {
        id: "daily-issues",
        action: "Clôturer un incident de réservation à la journée",
        access: { fondateur: "oui", directeur: "oui", assistant: "lecture", conseillere: "lecture", stagiaire: "non" },
        capability: "disputes.resolve",
        readCapability: "disputes.view",
        enforcedBy: ["serveur"],
        files: ["app/api/admin/daily-booking-issues/"],
        titleMatters: true,
      },
    ],
  },
  {
    id: "utilisateurs",
    title: "Utilisateurs et baux",
    intro: "Données personnelles des comptes.",
    rules: [
      {
        id: "users-list",
        action: "Voir la liste complète des utilisateurs et leurs données (Analyses)",
        access: { fondateur: "oui", directeur: "oui", assistant: "lecture", conseillere: "non", stagiaire: "non" },
        notes: { assistant: "propriétaires et agents" },
        capability: "users.listAll",
        readCapability: "users.listOwnersAgents",
        enforcedBy: ["serveur", "page"],
        files: ["app/api/users/all/route.ts", "app/admin/utilisateurs/page.tsx", "app/admin/utilisateurs/layout.tsx"],
        titleMatters: true,
      },
      {
        id: "rental-import",
        action: "Importer un bail existant",
        access: UP_TO_ASSISTANT,
        capability: "rentalImports.manage",
        enforcedBy: ["serveur"],
        files: ["app/api/admin/rental-imports/", "app/api/rental-agreements/[id]/import-documents/route.ts"],
        titleMatters: true,
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
        action: "Voir et traiter les candidatures Talent et les candidatures aux offres",
        access: DIRECTOR_AND_FOUNDER,
        capability: "talent.manage",
        enforcedBy: ["serveur", "page"],
        files: ["app/api/admin/talent/", "app/api/admin/careers/", "app/api/admin/candidatures/spontanees/route.ts", "app/admin/talent/page.tsx"],
        titleMatters: true,
      },
      {
        id: "referral-approve",
        action: "Parrainage : voir, approuver, annuler ou marquer payée une commission",
        access: DIRECTOR_AND_FOUNDER,
        capability: "referrals.validate",
        enforcedBy: ["serveur", "page"],
        files: ["app/api/admin/referrals/", "lib/referral-auth.ts", "app/admin/parrainage/page.tsx"],
        titleMatters: true,
      },
    ],
  },
  {
    id: "finances",
    title: "Finances et Paramètres",
    intro: "Le lien n’apparaît pas dans le menu de ceux qui n’y ont pas droit, et le serveur refuse aussi.",
    rules: [
      {
        id: "finances",
        action: "Voir les finances (transactions, revenus)",
        detail: "La page ne fait que montrer : personne ne modifie un paiement ici.",
        access: DIRECTOR_AND_FOUNDER,
        capability: "finances.view",
        enforcedBy: ["serveur", "page", "menu"],
        files: ["app/admin/finances/actions.ts", "app/admin/finances/page.tsx", "lib/navigation/adminNav.ts"],
        titleMatters: true,
      },
      {
        id: "listing-transactions",
        action: "Voir les paiements liés à une annonce (fiche de l’annonce)",
        access: DIRECTOR_AND_FOUNDER,
        capability: "finances.view",
        enforcedBy: ["serveur"],
        files: ["app/admin/annonces/[id]/actions.ts"],
        titleMatters: true,
      },
      {
        id: "settings",
        action: "Paramètres : prix des annonces et commissions",
        access: FOUNDER_ONLY,
        capability: "settings.manage",
        enforcedBy: ["serveur", "page", "menu"],
        files: ["app/api/admin/pricing/route.ts", "app/admin/parametres/page.tsx", "lib/navigation/adminNav.ts"],
        titleMatters: true,
      },
    ],
  },
  {
    id: "acces",
    title: "Accès de l’équipe",
    intro: "Qui entre dans l’équipe, avec quel niveau, et qui en sort. Page Accès, onglet « Niveaux et invitations ».",
    rules: [
      {
        id: "join",
        action: "Inviter une nouvelle personne avec un niveau",
        detail: "Lien d’invitation valable 7 jours, lié à une adresse e-mail. Le Directeur invite en Assistant(e), Conseiller(ère) ou Stagiaire, jamais en Directeur.",
        access: DIRECTOR_AND_FOUNDER,
        notes: { directeur: "sauf Directeur" },
        capability: "team.manage",
        enforcedBy: ["serveur", "page"],
        files: [
          "app/api/admin/team/route.ts",
          "app/api/admin/team/invitations/route.ts",
          "app/api/admin/team/invitations/[id]/route.ts",
          "lib/staff-team-server.ts",
          "app/admin/acces/niveaux/page.tsx",
          "app/admin/acces/niveaux/layout.tsx",
          "components/admin/access/AccessTabs.tsx",
        ],
        titleMatters: true,
      },
      {
        id: "remove",
        action: "Changer le niveau d’un membre ou lui retirer l’accès staff",
        detail: "Personne ne change son propre niveau. Le Directeur ne touche pas à un autre Directeur. Chaque changement va au journal des accès.",
        access: DIRECTOR_AND_FOUNDER,
        notes: { directeur: "sauf Directeur" },
        capability: "team.manage",
        enforcedBy: ["serveur"],
        files: ["app/api/admin/team/members/[id]/route.ts", "lib/staff-team-server.ts", "lib/staff-access.ts"],
        titleMatters: true,
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
    "Le Fondateur ou un Directeur invite l’adresse e-mail de la personne avec un niveau, dans Accès, onglet Niveaux et invitations.",
    "La personne crée un compte Roogo avec cette adresse et ouvre le lien d’invitation (valable 7 jours) sur /personnel/rejoindre.",
    "Le serveur vérifie à nouveau le droit de celui qui a invité, puis donne le niveau. L’invitation, l’acceptation et chaque changement de niveau vont au journal des accès.",
    "Le code staff partagé marche encore, mais il ne donne plus que le niveau Stagiaire, et ne baisse jamais le niveau de quelqu’un qui en a déjà un.",
  ],
  risk:
    "Tant que le code staff partagé (STAFF_REGISTRATION_SECRET) existe sur le serveur, toute personne qui le connaît peut entrer comme Stagiaire : annonces, candidatures et Studio en lecture ou en petit plafond. Le Fondateur ne reçoit pas d’alerte. Supprimer le code sur le serveur ferme cette porte ; les invitations restent.",
  files: ["app/api/auth/verify-staff-code/route.ts", "app/personnel/rejoindre/page.tsx", "lib/staff-team-server.ts"],
};

/** Planned in the vault proposal, NOT enforced by this code. */
export type Planned = { id: string; topic: string; planned: string; today: string };

export const PLANNED_SOURCE =
  "Proposition « Permissions de l’équipe par titre », approuvée par Salif le 2026-10-11 (vault Roogo, 03 Operations).";

export const PLANNED: Planned[] = [
  {
    id: "p-enforced",
    topic: "Niveaux pour tous les comptes staff",
    planned: "Chaque membre de l’équipe a un niveau, puis l’interrupteur STAFF_LEVELS_ENFORCED est activé : un compte sans niveau a alors les droits d’un(e) Conseiller(ère).",
    today: "Un compte staff sans niveau garde l’accès d’avant les niveaux tant que l’interrupteur n’est pas activé.",
  },
  {
    id: "p-studio-intern",
    topic: "Studio pour le ou la Stagiaire",
    planned: "Ses créations sont validées par le Directeur.",
    today: "Pas de validation. Le clonage de voix lui est déjà fermé et son plafond est petit.",
  },
  {
    id: "p-glossary",
    topic: "Glossaire du Studio",
    planned: "Le Directeur peut aussi modifier ou supprimer l’entrée d’un autre.",
    today: "Seulement l’auteur, ou le Fondateur.",
  },
  {
    id: "p-temporary",
    topic: "Accès en plus pour un temps",
    planned: "Un accès en plus pour 30 jours au maximum, puis retour au niveau.",
    today: "Rien de tel : on change le niveau, puis on le remet à la main.",
  },
  {
    id: "p-alert",
    topic: "Prévenir le Fondateur",
    planned: "Le Directeur prévient le Fondateur le jour même quand il donne ou retire un niveau.",
    today: "Le changement est au journal des accès, que le Fondateur lit, sans alerte automatique.",
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
