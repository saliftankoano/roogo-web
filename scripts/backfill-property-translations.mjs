#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import validator from "validator";

const TARGET_LOCALE = "en";
const DEFAULT_SOURCE_LOCALE = "fr";
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.PROPERTY_TRANSLATION_MODEL || "gpt-5-mini";
const BATCH_SIZE = Number(process.env.PROPERTY_TRANSLATION_BATCH_SIZE || 25);
const MAX_ROWS = Number(process.env.PROPERTY_TRANSLATION_MAX_ROWS || 0);
const FORCE_RETRY = process.env.PROPERTY_TRANSLATION_FORCE_RETRY === "1";
const REQUEST_TIMEOUT_MS = 12000;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
  );
}

if (!OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function cleanInputText(value) {
  if (!value) return "";
  return validator.unescape(validator.trim(value));
}

function normalizeLocale(locale) {
  return locale === TARGET_LOCALE ? TARGET_LOCALE : DEFAULT_SOURCE_LOCALE;
}

function buildSourceHash(sourceLocale, description, rules) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        source_locale: sourceLocale,
        description,
        dos_and_donts: rules,
      }),
    )
    .digest("hex");
}

function getStoredEnglishTranslationHash(translations) {
  const english =
    translations && typeof translations === "object" ? translations.en : null;
  const sourceHash =
    english && typeof english === "object" ? english.source_hash : null;
  return typeof sourceHash === "string" ? sourceHash : null;
}

function hasStoredEnglishTranslation(translations) {
  const english =
    translations && typeof translations === "object" ? translations.en : null;
  return Boolean(
    english &&
    typeof english.description === "string" &&
    Array.isArray(english.dos_and_donts),
  );
}

function sanitizeOutputText(value) {
  if (typeof value !== "string") return "";
  return validator.trim(value).replace(/<\/?[a-zA-Z][^>]*>/g, "");
}

function sanitizeOutputRules(value) {
  if (!Array.isArray(value)) return [];
  return value.map(sanitizeOutputText).filter(Boolean);
}

function extractOutputText(response) {
  if (typeof response?.output_text === "string") return response.output_text;
  const output = Array.isArray(response?.output) ? response.output : [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === "string") return part.text;
    }
  }

  return "";
}

async function translate(description, rules) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
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
              target_locale: "en",
              description,
              dos_and_donts: rules,
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
        typeof result?.error?.message === "string"
          ? result.error.message
          : `OpenAI translation failed with HTTP ${response.status}`;
      throw new Error(message);
    }

    const outputText = extractOutputText(result);
    if (!outputText) throw new Error("OpenAI response did not include text.");

    const parsed = JSON.parse(outputText);
    const translatedDescription = sanitizeOutputText(parsed.description);
    const translatedRules = sanitizeOutputRules(parsed.dos_and_donts);

    if (description && !translatedDescription) {
      throw new Error("Translation omitted description.");
    }
    if (translatedRules.length !== rules.length) {
      throw new Error("Translation changed rule count.");
    }

    return {
      description: translatedDescription,
      dos_and_donts: translatedRules,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("OpenAI translation timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function updateProperty(id, update) {
  const { error } = await supabase
    .from("properties")
    .update(update)
    .eq("id", id);
  if (error) throw error;
}

async function backfillProperty(property) {
  if (property.status !== "en_ligne" || property.is_test === true) {
    return "skipped";
  }

  const sourceLocale = normalizeLocale(property.translation_source_locale);
  const description = cleanInputText(property.description);
  const rules = Array.isArray(property.dos_and_donts)
    ? property.dos_and_donts.map(cleanInputText).filter(Boolean)
    : [];
  const sourceHash = buildSourceHash(sourceLocale, description, rules);
  const storedHash =
    getStoredEnglishTranslationHash(property.translations) ||
    property.translation_source_hash;

  if (!FORCE_RETRY && hasStoredEnglishTranslation(property.translations)) {
    if (storedHash !== sourceHash) {
      await updateProperty(property.id, {
        translation_status: "translated",
        translations: {
          ...property.translations,
          en: {
            ...property.translations.en,
            source_hash: sourceHash,
          },
        },
        translation_source_hash: sourceHash,
        translation_error: null,
      });
    }
    return "unchanged";
  }

  if (!FORCE_RETRY && storedHash === sourceHash) {
    return "unchanged";
  }

  if (!description && rules.length === 0) {
    await updateProperty(property.id, {
      translation_source_locale: sourceLocale,
      translation_status: "skipped",
      translations: {},
      translation_source_hash: sourceHash,
      translation_last_attempted_at: new Date().toISOString(),
      translated_at: new Date().toISOString(),
      translation_error: null,
    });
    return "skipped";
  }

  if (sourceLocale === "en") {
    await updateProperty(property.id, {
      translation_source_locale: sourceLocale,
      translation_status: "skipped",
      translations: {},
      translation_source_hash: sourceHash,
      translation_last_attempted_at: new Date().toISOString(),
      translated_at: new Date().toISOString(),
      translation_error: null,
    });
    return "skipped";
  }

  try {
    const translated = await translate(description, rules);
    await updateProperty(property.id, {
      translation_source_locale: sourceLocale,
      translation_status: "translated",
      translations: {
        ...(property.translations && typeof property.translations === "object"
          ? property.translations
          : {}),
        en: {
          ...translated,
          source_hash: sourceHash,
        },
      },
      translation_source_hash: sourceHash,
      translation_last_attempted_at: new Date().toISOString(),
      translated_at: new Date().toISOString(),
      translation_error: null,
    });
    return "translated";
  } catch (error) {
    await updateProperty(property.id, {
      translation_source_locale: sourceLocale,
      translation_status: "failed",
      translations: {},
      translation_source_hash: sourceHash,
      translation_last_attempted_at: new Date().toISOString(),
      translated_at: null,
      translation_error: String(error?.message || error).slice(0, 500),
    });
    throw error;
  }
}

async function main() {
  let processed = 0;
  let translated = 0;
  let skipped = 0;
  let unchanged = 0;
  const failed = [];
  let cursorCreatedAt = null;
  let cursorId = null;

  while (!MAX_ROWS || processed < MAX_ROWS) {
    const remaining = MAX_ROWS
      ? Math.min(BATCH_SIZE, MAX_ROWS - processed)
      : BATCH_SIZE;
    let query = supabase
      .from("properties")
      .select(
        "id, created_at, status, is_test, description, dos_and_donts, translation_source_locale, translation_status, translation_source_hash, translations",
      )
      .eq("status", "en_ligne")
      .eq("is_test", false)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(remaining);

    if (cursorCreatedAt && cursorId) {
      query = query.or(
        `created_at.gt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.gt.${cursorId})`,
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const property of data) {
      processed += 1;
      cursorCreatedAt = property.created_at;
      cursorId = property.id;

      try {
        const status = await backfillProperty(property);
        if (status === "translated") translated += 1;
        if (status === "skipped") skipped += 1;
        if (status === "unchanged") unchanged += 1;
        console.log(`${status}: ${property.id}`);
      } catch (error) {
        failed.push(property.id);
        console.error(`failed: ${property.id}`, error?.message || error);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        processed,
        translated,
        skipped,
        unchanged,
        failedCount: failed.length,
        failed,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
