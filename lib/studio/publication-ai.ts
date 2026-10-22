// "Générer la description": one OpenAI Responses call (same pattern as
// lib/property-translations.ts) that returns { caption, hashtags } as JSON.
// No value imports, so the request and the parsing are testable with a mocked
// fetch. The house rules (site line, phone, no em dash, hashtags) are enforced
// afterwards by finalizeCaption in ./publishing, whatever the model wrote.

export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
export const DEFAULT_CAPTION_MODEL = "gpt-5-mini";
const REQUEST_TIMEOUT_MS = 45_000;

export type DescriptionInput = {
  property: {
    title: string;
    offer: string;
    place: string;
    price: string;
    bedrooms?: number | null;
    bathrooms?: number | null;
    area?: number | string | null;
    amenities?: string[];
    description?: string | null;
  } | null;
  /** Video kind as the Studio names it, e.g. "Vidéo du bien (Visite POV)". */
  template: string;
  script: string;
  voiceover: string;
  /** The contact line the caption must carry. */
  contactLine: string;
};

export type DescriptionOutput = { caption: string; hashtags: string[]; model: string };

export type DescriptionDeps = {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  apiKey: string | undefined;
  model?: string | null;
};

export const DESCRIPTION_INSTRUCTIONS = [
  "Tu écris la description d'une publication Facebook et Instagram pour Roogo, la plateforme immobilière du Burkina Faso.",
  "Écris en français simple et chaleureux, comme un voisin qui donne un bon plan. Une petite touche d'humour est bienvenue, sans moquerie.",
  "Les seules références culturelles permises sont celles que le public burkinabè connaît (Ouaga, les quartiers, le maquis, le barrage, la saison des pluies, le poulet bicyclette...). Jamais de référence étrangère.",
  "Structure: une première ligne accrocheuse, puis deux ou trois phrases courtes sur le bien et la vidéo, puis une invitation à regarder ou à appeler.",
  "N'invente aucun fait: prix, pièces, quartier et équipements viennent uniquement des données fournies. Pas de prix si aucun n'est fourni.",
  "N'utilise jamais de tiret long ni de tiret moyen. Utilise des virgules ou deux phrases.",
  "Au plus un ou deux emoji dans tout le texte, ou aucun.",
  "N'utilise jamais le mot « faux » pour un élément du bien. Ne critique pas les gardiens. Le site s'écrit roogobf.com.",
  "Termine la description par la ligne de contact fournie, exactement, puis roogobf.com seul sur la ligne suivante.",
  "Ne mets pas les hashtags dans la description. Donne entre 3 et 5 hashtags à part, sans accents ni espaces, en commençant par #Roogo.",
  "Reste sous 900 caractères.",
].join("\n");

export function buildDescriptionRequest(input: DescriptionInput, model: string) {
  return {
    model,
    max_output_tokens: 2500,
    reasoning: { effort: "low" },
    input: [
      { role: "system", content: DESCRIPTION_INSTRUCTIONS },
      {
        role: "user",
        content: JSON.stringify({
          bien: input.property,
          type_de_video: input.template,
          script: input.script.slice(0, 4000),
          voix_off: input.voiceover.slice(0, 4000),
          ligne_contact: input.contactLine,
        }),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "roogo_post_description",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            caption: { type: "string" },
            hashtags: { type: "array", items: { type: "string" } },
          },
          required: ["caption", "hashtags"],
        },
      },
    },
  };
}

function outputText(response: unknown): string {
  if (response && typeof response === "object" && "output_text" in response && typeof response.output_text === "string") {
    return response.output_text;
  }
  const output = response && typeof response === "object" && "output" in response ? (response as { output: unknown }).output : null;
  if (!Array.isArray(output)) return "";
  for (const item of output) {
    const content = item && typeof item === "object" && "content" in item ? (item as { content: unknown }).content : null;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === "object" && "text" in part && typeof (part as { text: unknown }).text === "string") return (part as { text: string }).text;
    }
  }
  return "";
}

/** The model's JSON, checked. Throws a French message the team can read. */
export function parseDescriptionOutput(response: unknown): { caption: string; hashtags: string[] } {
  const text = outputText(response);
  if (!text) throw new Error("La réponse ne contient pas de description.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("La réponse n'est pas lisible.");
  }
  const obj = parsed as { caption?: unknown; hashtags?: unknown };
  const caption = typeof obj.caption === "string" ? obj.caption.trim() : "";
  if (!caption) throw new Error("La description générée est vide.");
  const hashtags = Array.isArray(obj.hashtags) ? obj.hashtags.filter((t): t is string => typeof t === "string") : [];
  return { caption, hashtags };
}

export async function requestDescription(deps: DescriptionDeps, input: DescriptionInput): Promise<DescriptionOutput> {
  if (!deps.apiKey) throw new Error("La génération n'est pas configurée (OPENAI_API_KEY).");
  const model = deps.model || DEFAULT_CAPTION_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await deps.fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${deps.apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(buildDescriptionRequest(input, model)),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const message = (json as { error?: { message?: unknown } } | null)?.error?.message;
      console.error("Studio description: OpenAI error", res.status, typeof message === "string" ? message.slice(0, 200) : "");
      throw new Error(`La génération a échoué (HTTP ${res.status}). Réessayez.`);
    }
    return { ...parseDescriptionOutput(json), model };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("La génération a pris trop de temps. Réessayez.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
