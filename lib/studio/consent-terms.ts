// Terms a person accepts before their voice can be used in the Studio.
// Bump TERMS_VERSION whenever the text changes: every acceptance stores the
// version and a hash of the exact text shown.
//
// Draft written for Kazedra Tech. Have counsel review it before staff rely
// on it as a legal record.

export const TERMS_VERSION = "voix-v1-2026-10-06";

export const TERMS_TITLE = "Utilisation de ma voix par Kazedra Tech";

export const TERMS_PARAGRAPHS: ReadonlyArray<string> = [
  "J'autorise Kazedra Tech, qui exploite Roogo, à utiliser ma voix, y compris sa version numérique reproduite par intelligence artificielle, pour créer des contenus de marketing et de communication.",
  "Cette autorisation couvre un usage interne (formation, démonstrations, outils de l'équipe) et un usage externe (vidéos, publicités, réseaux sociaux, site web et application de Roogo).",
  "Elle vaut pour toute la durée où ma voix reste active dans le Studio. Je peux la retirer à tout moment depuis le Studio. Le retrait empêche tout nouvel usage de ma voix et supprime la voix numérique créée à partir de mon enregistrement.",
  "Les contenus déjà publiés avant mon retrait peuvent rester en ligne, mais aucun nouveau contenu ne sera créé avec ma voix après le retrait.",
  "Ma voix ne sera pas utilisée pour me faire dire des propos qui portent atteinte à ma dignité, ni pour usurper mon identité en dehors de Roogo.",
  "Kazedra Tech conserve la preuve de cette acceptation : la date, mon compte, l'adresse réseau utilisée et la version de ce texte.",
];

export function termsFullText(): string {
  return [TERMS_TITLE, ...TERMS_PARAGRAPHS].join("\n\n");
}

export const TERMS_CHECKBOX_LABEL =
  "J'ai lu ces conditions et j'autorise Kazedra Tech à utiliser ma voix comme indiqué.";
