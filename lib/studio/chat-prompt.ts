// System prompt and reply parsing for the Studio chat.

export const CONTACT_NUMBER = "+226 67 00 61 16";

/**
 * The pronunciation glossary, told to the script model (council option C,
 * approved 2026-10-10): it writes these words in their normal spelling every
 * time, so the speech rules always find them. It never writes the phonetic form.
 */
export function glossaryPrompt(entries: ReadonlyArray<{ term: string; spoken: string }>): string {
  if (!entries.length) return "";
  const lines = entries.map((e) => `- ${e.term} (la voix dira « ${e.spoken} »)`).join("\n");
  return `Prononciation: la voix corrige automatiquement ces mots. Dans le script, écris-les toujours avec cette orthographe exacte, jamais sous leur forme phonétique:\n${lines}\nÉcris les prix en chiffres suivis de FCFA (exemple: 50 000 000 FCFA) et les numéros de téléphone en chiffres.`;
}

export function buildSystemPrompt(facts: string | null, glossary = ""): string {
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

  return [rules, glossary, property].filter(Boolean).join("\n\n");
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
