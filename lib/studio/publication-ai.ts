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

export function outputText(response: unknown): string {
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

// ---------------------------------------------------------------------------
// « Publier une vidéo » (PRD 3): one call returns a base text and one version
// per ticked network. The model writes words only: price, place, phone and
// roogobf.com are added and checked afterwards by finalizeNetworkCopy in
// ./publish-everywhere, whatever the model wrote.
// ---------------------------------------------------------------------------

export type CopyNetwork = "facebook" | "instagram" | "tiktok" | "youtube";

export type NetworkCopyInput = {
  property: (NonNullable<DescriptionInput["property"]> & { reference?: string | null }) | null;
  /** What the team called the video. */
  title: string;
  /** One or two sentences from the team on what the video shows (optional). */
  note: string;
  networks: CopyNetwork[];
  /** Per network, the brief from COPY_RULES (passed in so this file has no value imports). */
  briefs: Partial<Record<CopyNetwork | "base", string>>;
  /** « Régénérer »: the base already shown to the team, kept as the reference. */
  existingBase?: string | null;
};

export type CopyDraftOut = { text: string; hashtags: string[] };

export type NetworkCopyOutput = {
  base: CopyDraftOut;
  versions: Partial<Record<CopyNetwork, CopyDraftOut>>;
  model: string;
};

export const NETWORK_COPY_INSTRUCTIONS = [
  "Tu écris les textes d'une vidéo verticale que Roogo, la plateforme immobilière du Burkina Faso, publie sur plusieurs réseaux.",
  "Tu rends un texte de base, puis une version par réseau demandé, chacune écrite pour ce réseau selon sa consigne.",
  "Écris en français simple, positif et inspirant : montre ce que le bien rend possible (une famille installée, un projet lancé), sans exagérer.",
  "Les seules références culturelles permises sont celles que le public burkinabè connaît (Ouaga, les quartiers, le maquis, le barrage, la saison des pluies...). Jamais de référence étrangère.",
  "N'invente aucun fait : prix, pièces, quartier et équipements viennent uniquement des données fournies.",
  "N'écris aucun numéro de téléphone, ni roogobf.com, ni ligne « Prix : » : le code les ajoute lui-même à la fin.",
  "Tu peux citer le prix dans une phrase, seulement exactement comme fourni.",
  "Pour une vente, ne parle jamais de crédit, de financement, de mensualités ni de paiement échelonné : les ventes Roogo se font au comptant.",
  "N'utilise jamais de tiret long ni de tiret moyen. Utilise des virgules ou deux phrases.",
  "Au plus 3 emoji par texte, ou aucun.",
  "N'utilise jamais le mot « faux » pour un élément du bien. Ne critique pas les gardiens.",
  "Les hashtags vont dans la liste à part, jamais dans le texte, sans accents ni espaces, en commençant par #Roogo.",
  "Si un texte de base existant est fourni, garde-le comme référence et écris seulement les versions demandées dans le même esprit.",
].join("\n");

export function buildNetworkCopyRequest(input: NetworkCopyInput, model: string) {
  const networks = [...new Set(input.networks)];
  const draft = {
    type: "object",
    additionalProperties: false,
    properties: { text: { type: "string" }, hashtags: { type: "array", items: { type: "string" } } },
    required: ["text", "hashtags"],
  };
  return {
    model,
    max_output_tokens: 4000,
    reasoning: { effort: "low" },
    input: [
      { role: "system", content: NETWORK_COPY_INSTRUCTIONS },
      {
        role: "user",
        content: JSON.stringify({
          bien: input.property,
          titre_video: input.title.slice(0, 160),
          ce_que_montre_la_video: input.note.slice(0, 1000),
          consigne_base: input.briefs.base ?? "",
          reseaux: networks.map((n) => ({ reseau: n, consigne: input.briefs[n] ?? "" })),
          texte_de_base_existant: input.existingBase ? input.existingBase.slice(0, 3000) : null,
        }),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "roogo_network_copy",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            base: draft,
            versions: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  network: { type: "string", enum: networks.length ? networks : ["facebook"] },
                  text: { type: "string" },
                  hashtags: { type: "array", items: { type: "string" } },
                },
                required: ["network", "text", "hashtags"],
              },
            },
          },
          required: ["base", "versions"],
        },
      },
    },
  };
}

function draftOf(value: unknown): CopyDraftOut | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { text?: unknown; hashtags?: unknown };
  const text = typeof v.text === "string" ? v.text.trim() : "";
  if (!text) return null;
  const hashtags = Array.isArray(v.hashtags) ? v.hashtags.filter((t): t is string => typeof t === "string") : [];
  return { text, hashtags };
}

/**
 * The model's JSON, checked. A network the model skipped gets the base, so
 * every ticked network always has a text the team can edit.
 */
export function parseNetworkCopyOutput(response: unknown, networks: CopyNetwork[]): Omit<NetworkCopyOutput, "model"> {
  const text = outputText(response);
  if (!text) throw new Error("La réponse ne contient pas de texte.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("La réponse n'est pas lisible.");
  }
  const obj = parsed as { base?: unknown; versions?: unknown };
  const base = draftOf(obj.base);
  if (!base) throw new Error("Le texte de base généré est vide.");
  const versions: NetworkCopyOutput["versions"] = {};
  for (const item of Array.isArray(obj.versions) ? obj.versions : []) {
    const network = (item as { network?: unknown } | null)?.network;
    const one = draftOf(item);
    if (typeof network === "string" && (networks as string[]).includes(network) && one && !versions[network as CopyNetwork]) {
      versions[network as CopyNetwork] = one;
    }
  }
  for (const n of networks) if (!versions[n]) versions[n] = { text: base.text, hashtags: [...base.hashtags] };
  return { base, versions };
}

/** One Responses call, same timeout and French errors as requestDescription. */
export async function requestNetworkCopy(deps: DescriptionDeps, input: NetworkCopyInput): Promise<NetworkCopyOutput> {
  if (!deps.apiKey) throw new Error("La génération n'est pas configurée (OPENAI_API_KEY).");
  if (!input.networks.length) throw new Error("Choisissez au moins un réseau.");
  const model = deps.model || DEFAULT_CAPTION_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await deps.fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${deps.apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(buildNetworkCopyRequest(input, model)),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const message = (json as { error?: { message?: unknown } } | null)?.error?.message;
      console.error("Studio network copy: OpenAI error", res.status, typeof message === "string" ? message.slice(0, 200) : "");
      throw new Error(`La génération a échoué (HTTP ${res.status}). Réessayez.`);
    }
    return { ...parseNetworkCopyOutput(json, input.networks), model };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("La génération a pris trop de temps. Réessayez.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
