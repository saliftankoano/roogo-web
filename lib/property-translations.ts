import { createHash } from "node:crypto";
import validator from "validator";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type PropertyTranslationLocale = "fr" | "en";
export type PropertyTranslationStatus =
  | "not_requested"
  | "translated"
  | "failed"
  | "skipped";

export type PropertyTranslatedContent = {
  description: string;
  dos_and_donts: string[];
  source_hash?: string;
};

export type PropertyTranslations = Partial<
  Record<PropertyTranslationLocale, PropertyTranslatedContent>
>;

export type PropertyTranslationUpdate = {
  translation_source_locale: PropertyTranslationLocale;
  translation_status: PropertyTranslationStatus;
  translations: PropertyTranslations;
  translation_source_hash: string | null;
  translation_last_attempted_at: string | null;
  translated_at: string | null;
  translation_error: string | null;
};

type BuildPropertyTranslationUpdateInput = {
  sourceLocale?: string | null;
  description?: string | null;
  dosAndDonts?: string[] | null;
};

type OpenAITranslationPayload = {
  description: string;
  dos_and_donts: string[];
};

type TranslationSource = {
  sourceLocale: PropertyTranslationLocale;
  description: string;
  dosAndDonts: string[];
  sourceHash: string;
};

type PropertyTranslationRow = {
  id: string;
  status: string | null;
  is_test: boolean | null;
  description: string | null;
  dos_and_donts: string[] | null;
  translation_source_locale: string | null;
  translation_status: string | null;
  translation_source_hash: string | null;
  translations: PropertyTranslations | null;
};

const TARGET_LOCALE: PropertyTranslationLocale = "en";
const DEFAULT_SOURCE_LOCALE: PropertyTranslationLocale = "fr";
const DEFAULT_MODEL = "gpt-5-mini";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const REQUEST_TIMEOUT_MS = 12000;

function normalizeLocale(locale?: string | null): PropertyTranslationLocale {
  return locale === "en" ? "en" : DEFAULT_SOURCE_LOCALE;
}

function cleanInputText(value?: string | null) {
  if (!value) return "";
  return validator.unescape(validator.trim(value));
}

function buildTranslationSource(input: {
  sourceLocale?: string | null;
  description?: string | null;
  dosAndDonts?: string[] | null;
}): TranslationSource {
  const sourceLocale = normalizeLocale(input.sourceLocale);
  const description = cleanInputText(input.description);
  const dosAndDonts = (input.dosAndDonts || [])
    .map(cleanInputText)
    .filter((rule) => rule.length > 0);
  const sourceHash = createHash("sha256")
    .update(
      JSON.stringify({
        source_locale: sourceLocale,
        description,
        dos_and_donts: dosAndDonts,
      }),
    )
    .digest("hex");

  return {
    sourceLocale,
    description,
    dosAndDonts,
    sourceHash,
  };
}

function hasSourceText(source: TranslationSource) {
  return source.description.length > 0 || source.dosAndDonts.length > 0;
}

function sanitizeOutputText(value: unknown) {
  if (typeof value !== "string") return "";
  // Strip HTML tags only — do not HTML-encode, as translated text is stored
  // and served in plain-text contexts (push notifications, React Native, PDFs).
  // Regex targets real tags only, so bare < > operators in prose are preserved.
  return validator.trim(value).replace(/<\/?[a-zA-Z][^>]*>/g, "");
}

function sanitizeOutputRules(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(sanitizeOutputText).filter(Boolean);
}

function failureUpdate(
  sourceLocale: PropertyTranslationLocale,
  sourceHash: string,
  error: unknown,
): PropertyTranslationUpdate {
  const message =
    error instanceof Error
      ? error.message
      : String(error || "Translation failed");

  return {
    translation_source_locale: sourceLocale,
    translation_status: "failed",
    translations: {},
    translation_source_hash: sourceHash,
    translation_last_attempted_at: new Date().toISOString(),
    translated_at: null,
    translation_error: message.slice(0, 500),
  };
}

function skippedUpdate(
  sourceLocale: PropertyTranslationLocale,
  sourceHash: string,
): PropertyTranslationUpdate {
  return {
    translation_source_locale: sourceLocale,
    translation_status: "skipped",
    translations: {},
    translation_source_hash: sourceHash,
    translation_last_attempted_at: new Date().toISOString(),
    translated_at: new Date().toISOString(),
    translation_error: null,
  };
}

function translatedUpdate(
  sourceLocale: PropertyTranslationLocale,
  sourceHash: string,
  content: PropertyTranslatedContent,
): PropertyTranslationUpdate {
  return {
    translation_source_locale: sourceLocale,
    translation_status: "translated",
    translations: {
      [TARGET_LOCALE]: {
        ...content,
        source_hash: sourceHash,
      },
    },
    translation_source_hash: sourceHash,
    translation_last_attempted_at: new Date().toISOString(),
    translated_at: new Date().toISOString(),
    translation_error: null,
  };
}

export function buildStalePropertyTranslationUpdate() {
  return {
    translation_status: "not_requested" as const,
    translations: {},
    translation_source_hash: null,
    translation_last_attempted_at: null,
    translated_at: null,
    translation_error: null,
  };
}

export function getPropertyTranslationSourceHash(input: {
  sourceLocale?: string | null;
  description?: string | null;
  dosAndDonts?: string[] | null;
}) {
  return buildTranslationSource(input).sourceHash;
}

function getStoredEnglishTranslationHash(
  translations: PropertyTranslations | null,
) {
  const english = translations?.en;
  if (!english || typeof english !== "object") return null;
  const sourceHash = (english as Record<string, unknown>).source_hash;
  return typeof sourceHash === "string" ? sourceHash : null;
}

function hasStoredEnglishTranslation(
  translations: PropertyTranslations | null,
) {
  const english = translations?.en;
  return Boolean(
    english &&
    typeof english.description === "string" &&
    Array.isArray(english.dos_and_donts),
  );
}

function extractOutputText(response: unknown): string {
  if (
    response &&
    typeof response === "object" &&
    "output_text" in response &&
    typeof response.output_text === "string"
  ) {
    return response.output_text;
  }

  const output =
    response && typeof response === "object" && "output" in response
      ? response.output
      : null;

  if (!Array.isArray(output)) return "";

  for (const item of output) {
    const content =
      item && typeof item === "object" && "content" in item
        ? item.content
        : null;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      if (
        part &&
        typeof part === "object" &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        return part.text;
      }
    }
  }

  return "";
}

async function requestOpenAITranslation(
  payload: OpenAITranslationPayload,
): Promise<PropertyTranslatedContent> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.PROPERTY_TRANSLATION_MODEL || DEFAULT_MODEL,
        max_output_tokens: 900,
        input: [
          {
            role: "system",
            content:
              "Translate owner-provided Burkina Faso real estate listing text from French to natural English. Preserve place names, proper names, numbers, currency, punctuation meaning, and item count. Do not add, remove, summarize, moderate, or rewrite facts. Return JSON only.",
          },
          {
            role: "user",
            content: JSON.stringify({
              source_locale: "fr",
              target_locale: TARGET_LOCALE,
              description: payload.description,
              dos_and_donts: payload.dos_and_donts,
            }),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "property_listing_translation",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                description: { type: "string" },
                dos_and_donts: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["description", "dos_and_donts"],
            },
          },
        },
      }),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        result &&
        typeof result === "object" &&
        "error" in result &&
        result.error &&
        typeof result.error === "object" &&
        "message" in result.error &&
        typeof result.error.message === "string"
          ? result.error.message
          : `OpenAI translation failed with HTTP ${response.status}`;
      throw new Error(message);
    }

    const outputText = extractOutputText(result);
    if (!outputText) {
      throw new Error(
        "OpenAI translation response did not include output text.",
      );
    }

    const parsed = JSON.parse(outputText) as Partial<OpenAITranslationPayload>;
    const description = sanitizeOutputText(parsed.description);
    const dosAndDonts = sanitizeOutputRules(parsed.dos_and_donts);

    if (payload.description && !description) {
      throw new Error("OpenAI translation response omitted the description.");
    }

    if (dosAndDonts.length !== payload.dos_and_donts.length) {
      throw new Error("OpenAI translation response changed the rule count.");
    }

    return {
      description,
      dos_and_donts: dosAndDonts,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("OpenAI translation timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function buildPropertyTranslationUpdate({
  sourceLocale,
  description,
  dosAndDonts,
}: BuildPropertyTranslationUpdateInput): Promise<PropertyTranslationUpdate> {
  const source = buildTranslationSource({
    sourceLocale,
    description,
    dosAndDonts,
  });

  if (!hasSourceText(source)) {
    return skippedUpdate(source.sourceLocale, source.sourceHash);
  }

  if (source.sourceLocale === TARGET_LOCALE) {
    return skippedUpdate(source.sourceLocale, source.sourceHash);
  }

  try {
    const translated = await requestOpenAITranslation({
      description: source.description,
      dos_and_donts: source.dosAndDonts,
    });
    return translatedUpdate(source.sourceLocale, source.sourceHash, translated);
  } catch (error) {
    console.warn("Property translation failed:", error);
    return failureUpdate(source.sourceLocale, source.sourceHash, error);
  }
}

export async function translatePropertyIfNeeded(propertyId: string) {
  const { data, error } = await supabaseAdmin
    .from("properties")
    .select(
      "id, status, is_test, description, dos_and_donts, translation_source_locale, translation_status, translation_source_hash, translations",
    )
    .eq("id", propertyId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { status: "missing" as const };

  const property = data as PropertyTranslationRow;
  const source = buildTranslationSource({
    sourceLocale: property.translation_source_locale,
    description: property.description,
    dosAndDonts: property.dos_and_donts,
  });
  const storedEnglishHash =
    getStoredEnglishTranslationHash(property.translations) ||
    property.translation_source_hash;

  if (
    property.status === "en_ligne" &&
    storedEnglishHash === source.sourceHash &&
    property.translation_status !== "not_requested"
  ) {
    return { status: "unchanged" as const, sourceHash: source.sourceHash };
  }

  if (
    property.status === "en_ligne" &&
    property.translation_status === "translated" &&
    !property.translation_source_hash &&
    hasStoredEnglishTranslation(property.translations)
  ) {
    const translations = {
      ...(property.translations || {}),
      en: {
        ...property.translations?.en,
        source_hash: source.sourceHash,
      },
    };

    const { error: updateError } = await supabaseAdmin
      .from("properties")
      .update({
        translations,
        translation_source_hash: source.sourceHash,
        translation_error: null,
      })
      .eq("id", propertyId);

    if (updateError) throw updateError;
    return { status: "unchanged" as const, sourceHash: source.sourceHash };
  }

  if (property.status !== "en_ligne" || property.is_test) {
    return { status: "skipped" as const, sourceHash: source.sourceHash };
  }

  const translationUpdate = await buildPropertyTranslationUpdate({
    sourceLocale: source.sourceLocale,
    description: source.description,
    dosAndDonts: source.dosAndDonts,
  });

  const { error: updateError } = await supabaseAdmin
    .from("properties")
    .update(translationUpdate)
    .eq("id", propertyId);

  if (updateError) throw updateError;
  return {
    status: translationUpdate.translation_status,
    sourceHash: translationUpdate.translation_source_hash,
  };
}
