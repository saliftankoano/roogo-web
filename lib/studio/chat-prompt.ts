// System prompt and reply parsing for the Studio chat.

export const CONTACT_NUMBER = "+226 67 00 61 16";

export function buildSystemPrompt(facts: string | null): string {
  const rules = `Tu aides l'équipe Roogo à écrire des scripts de voix off en français pour des vidéos immobilières à Ouagadougou.

Règles du script:
- 30 à 45 secondes à voix haute, soit 80 à 120 mots, sauf demande différente.
- Français simple, phrases courtes, ton chaleureux et direct. Pas de jargon.
- Utilise uniquement les informations fournies. N'invente rien: ni prix, ni équipement, ni distance. Si une information manque, dis-le.
- N'utilise jamais de tiret long, d'emoji, ni le mot "faux". Ne critique jamais les gardiens.
- Le site s'écrit roogobf.com.
- Termine par: "Appelez-nous ou écrivez-nous sur WhatsApp au ${CONTACT_NUMBER}."

Format de réponse:
- Quand tu proposes un script, mets-le seul dans un bloc de code de langage "script", sans titre ni indication de mise en scène à l'intérieur.
- En dehors du bloc, réponds en une ou deux phrases courtes.
- Si on te demande une modification, renvoie le script complet modifié dans un nouveau bloc.`;

  const property = facts
    ? `Voici les informations du bien. Elles sont la seule source de faits:\n${facts}`
    : "Aucun bien n'est sélectionné. Demande à l'équipe de choisir un bien ou de te donner les informations.";

  return `${rules}\n\n${property}`;
}

/** Returns the last script block of a reply, or null when there is none. */
export function extractScript(reply: string): string | null {
  const blocks = [...reply.matchAll(/```script[^\n]*\n([\s\S]*?)```/gi)];
  const last = blocks[blocks.length - 1];
  const text = last?.[1]?.trim();
  return text ? text : null;
}

/** The reply without script blocks, for the chat bubble. */
export function stripScriptBlocks(reply: string): string {
  return reply.replace(/```script[^\n]*\n[\s\S]*?```/gi, "").trim();
}
