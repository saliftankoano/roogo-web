// House copy rules for scripts written in the Studio.
// Source: vault note "04 Marketing/Creative production standards".
// Em dashes are fixed automatically; everything else is a warning the
// writer decides on, because a wrong silent rewrite is worse than a flag.

export type CopyWarning = {
  code: string;
  message: string;
};

const EM_DASH = /—/g;
// Common emoji ranges plus the variation selector and joiner.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/u;

export function normalizeScript(text: string): string {
  return text.replace(EM_DASH, ",").replace(/ ,/g, ",");
}

export function checkScript(text: string): CopyWarning[] {
  const warnings: CopyWarning[] = [];

  if (EMOJI.test(text)) {
    warnings.push({
      code: "emoji",
      message: "Retirez les emojis : ils ne se lisent pas à voix haute.",
    });
  }
  if (/roogo\.bf/i.test(text)) {
    warnings.push({
      code: "wrong-domain",
      message: "Le site est roogobf.com, jamais roogo.bf.",
    });
  }
  if (/\bfaux(?:\s|-)?(?:plafond|carrelage|marbre|bois|\w+)?/i.test(text)) {
    warnings.push({
      code: "faux",
      message:
        "Évitez le mot « faux » pour un bien ou un élément de construction : il déprécie la valeur.",
    });
  }
  if (/\badd-?ons?\b/i.test(text)) {
    warnings.push({
      code: "add-ons",
      message: "Dites « options supplémentaires », pas « add-ons ».",
    });
  }
  if (/\d\s?%/.test(text) && /commission|frais/i.test(text)) {
    warnings.push({
      code: "fee-wording",
      message:
        "Si vous parlez des frais, dites « 7% sur chaque loyer collecté via Roogo ».",
    });
  }
  if (/\bgardiens?\b/i.test(text) && /\b(vol|voleur|arnaque|escroc)/i.test(text)) {
    warnings.push({
      code: "gardiens",
      message: "Ne critiquez pas les gardiens.",
    });
  }

  return warnings;
}
