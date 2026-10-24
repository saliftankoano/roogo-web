import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { copyFactsFor, loadFinalVideo } from "@/lib/studio/final-videos-server";
import { requestNetworkCopy, type CopyNetwork } from "@/lib/studio/publication-ai";
import { COPY_RULES, finalizeNetworkCopy, isDestination, type CopyFacts, type FinalCopy } from "@/lib/studio/publish-everywhere";

export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

function publicFacts(facts: Awaited<ReturnType<typeof copyFactsFor>>): CopyFacts & { reference: string | null } {
  return {
    listingType: facts.listingType,
    price: facts.price,
    priceLabel: facts.priceLabel,
    place: facts.place,
    city: facts.city ?? null,
    propertyType: facts.propertyType ?? null,
    reference: facts.reference,
  };
}

// The facts the code inserts for a listing (price, place), so the page can
// run the same checks live while the team edits (lib/studio/publish-everywhere).
export async function GET(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const propertyId = new URL(req.url).searchParams.get("propertyId");
  const facts = await copyFactsFor(propertyId && UUID.test(propertyId) ? propertyId : null);
  return cors(NextResponse.json({ facts: publicFacts(facts) }), req);
}

// « Préparer les textes » and « Régénérer » (PRD 3.1, 3.6): one model call
// returns a base and a version per ticked network; every version is then
// finalized by code with the listing's facts and the house rules.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const { id } = await params;
  const video = await loadFinalVideo(id);
  if (!video) return errorResponse("Vidéo introuvable.", 404, req);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return errorResponse("Requête invalide", 400, req);
  const asked = Array.isArray(body.networks) ? body.networks.filter(isDestination) : [];
  const only = isDestination(body.only) ? body.only : null;
  // One call for every ticked network, YouTube Shorts included (title on the first line).
  const networks: CopyNetwork[] = only ? [only] : asked;
  if (!networks.length) return errorResponse("Choisissez au moins un réseau.", 400, req);
  const propertyId = typeof body.propertyId === "string" && UUID.test(body.propertyId) ? body.propertyId : video.property_id;
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 160) : video.title;
  const note = typeof body.note === "string" ? body.note.slice(0, 1000) : "";
  const existingBase = typeof body.existingBase === "string" ? body.existingBase : null;

  const facts = await copyFactsFor(propertyId);
  const briefs: Partial<Record<CopyNetwork | "base", string>> = { base: COPY_RULES.base.brief };
  for (const n of networks) briefs[n] = COPY_RULES[n].brief;

  try {
    const out = await requestNetworkCopy(
      { fetch: (url, init) => fetch(url, init), apiKey: process.env.OPENAI_API_KEY, model: process.env.STUDIO_CAPTION_MODEL },
      {
        property: facts.summary
          ? {
              title: facts.summary.title,
              offer: facts.summary.offer,
              place: facts.summary.place,
              price: facts.summary.price,
              reference: facts.reference,
            }
          : null,
        title,
        note,
        networks,
        briefs,
        existingBase: only ? existingBase : null,
      },
    );
    const base = finalizeNetworkCopy("base", out.base, facts);
    const versions: Partial<Record<CopyNetwork, FinalCopy>> = {};
    for (const n of networks) versions[n] = finalizeNetworkCopy(n, out.versions[n] ?? out.base, facts);
    return cors(
      NextResponse.json({ base: only ? null : base, versions, model: out.model, generatedAt: new Date().toISOString(), facts: publicFacts(facts) }),
      req,
    );
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "La génération a échoué.", 502, req);
  }
}
