import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { loadPropertyRow, propertyLabels } from "@/lib/studio/conversations-server";
import { toPropertySummary } from "@/lib/studio/property-context";
import { CAPTION_CONTACT, captionChecks, finalizeCaption } from "@/lib/studio/publishing";
import { requestDescription } from "@/lib/studio/publication-ai";
import { loadArtifactInfo, projectTexts } from "@/lib/studio/publishing-server";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export const maxDuration = 60;

// "Générer la description": the model writes from the listing, the script and
// the voice-over; the house rules are then enforced here, not trusted.
export async function POST(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const body = (await req.json().catch(() => null)) as { artifactId?: unknown } | null;
  const artifactId = typeof body?.artifactId === "string" ? body.artifactId : "";
  if (!artifactId) return errorResponse("Vidéo manquante", 400, req);
  const artifact = await loadArtifactInfo(artifactId);
  if (!artifact || artifact.kind !== "video") return errorResponse("Vidéo introuvable", 404, req);

  const [property, texts] = await Promise.all([
    artifact.property_id ? loadPropertyRow(artifact.property_id) : Promise.resolve(null),
    projectTexts(artifact.conversation_id),
  ]);
  const summary = property ? toPropertySummary(property, propertyLabels) : null;
  try {
    const out = await requestDescription(
      { fetch: (url, init) => fetch(url, init), apiKey: process.env.OPENAI_API_KEY, model: process.env.STUDIO_CAPTION_MODEL },
      {
        property: summary
          ? {
              title: summary.title,
              offer: summary.offer,
              place: summary.place,
              price: summary.price,
              bedrooms: property?.bedrooms ?? null,
              bathrooms: property?.bathrooms ?? null,
              area: property?.area ?? null,
              amenities: property?.amenities ?? [],
              description: property?.description ?? null,
            }
          : null,
        template: [artifact.title, typeof artifact.meta.mode === "string" ? `mode ${artifact.meta.mode}` : null].filter(Boolean).join(", "),
        script: texts.script,
        voiceover: texts.voiceover,
        contactLine: CAPTION_CONTACT,
      },
    );
    const clean = finalizeCaption({ caption: out.caption, hashtags: out.hashtags });
    return cors(
      NextResponse.json({
        caption: clean.caption,
        hashtags: clean.hashtags,
        model: out.model,
        generatedAt: new Date().toISOString(),
        checks: captionChecks(clean.caption, clean.hashtags),
      }),
      req,
    );
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "La génération a échoué.", 502, req);
  }
}
