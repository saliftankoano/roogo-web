import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { checkRateLimit, studioLimiter } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkScript, normalizeScript } from "@/lib/studio/copy-rules";

export const maxDuration = 60;

const CONTACT_NUMBER = "+226 67 00 61 16";

const SYSTEM_PROMPT = `Tu écris des scripts de voix off en français pour des vidéos immobilières Roogo à Ouagadougou.
Règles:
- 30 à 45 secondes à voix haute, soit 80 à 120 mots.
- Français simple, phrases courtes, ton chaleureux et direct. Pas de jargon.
- Utilise uniquement les informations données. N'invente rien: ni prix, ni équipement, ni distance.
- N'utilise jamais de tiret long, d'emoji, ni le mot "faux". Ne critique jamais les gardiens.
- Le site s'écrit roogobf.com.
- Termine par: "Appelez-nous ou écrivez-nous sur WhatsApp au ${CONTACT_NUMBER}."
- Réponds avec le script seul, sans titre ni commentaire.`;

type Brief = {
  type?: unknown;
  quartier?: unknown;
  prix?: unknown;
  points?: unknown;
};

function clean(value: unknown, max = 400): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function POST(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const limit = await checkRateLimit(studioLimiter, staff.id);
  if (!limit.success) {
    return errorResponse(
      "Trop de demandes. Réessayez dans quelques minutes.",
      429,
      req,
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.STUDIO_SCRIPT_MODEL;
  if (!apiKey || !model) {
    console.error("Studio: script helper env is not configured");
    return errorResponse("L'aide à l'écriture n'est pas configurée.", 503, req);
  }

  const body = (await req.json().catch(() => null)) as Brief | null;
  const brief = {
    type: clean(body?.type, 80),
    quartier: clean(body?.quartier, 80),
    prix: clean(body?.prix, 80),
    points: clean(body?.points, 600),
  };
  if (!brief.type || !brief.quartier) {
    return errorResponse("Indiquez au moins le type de bien et le quartier.", 400, req);
  }

  const userPrompt = [
    `Type de bien: ${brief.type}`,
    `Quartier: ${brief.quartier}`,
    brief.prix ? `Prix: ${brief.prix}` : null,
    brief.points ? `Points forts: ${brief.points}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    console.error("Studio: script model returned", response.status);
    return errorResponse("Le script n'a pas pu être écrit. Réessayez.", 502, req);
  }

  const payload = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
  } | null;
  const raw = payload?.choices?.[0]?.message?.content?.trim();
  if (!raw) {
    return errorResponse("Le script n'a pas pu être écrit. Réessayez.", 502, req);
  }

  const script = normalizeScript(raw);

  await supabaseAdmin.from("studio_generations").insert({
    user_id: staff.id,
    kind: "script",
    provider: "openai",
    model,
    input: { brief },
    est_cost_usd: 0,
    status: "done",
  });

  return cors(
    NextResponse.json({ script, warnings: checkScript(script) }),
    req,
  );
}
