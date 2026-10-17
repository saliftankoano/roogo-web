import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { checkRateLimit, studioJobLimiter } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  FAL_ENDPOINTS,
  isAllowedEndpoint,
  toolKind,
  type JobTool,
} from "@/lib/studio/ai-tools";
import { acknowledgedCoversServerPrice, startOfMonthIso } from "@/lib/studio/budget";
import {
  canWriteConversation,
  loadConversation,
} from "@/lib/studio/conversations-server";
import { falConfigured, submitFal } from "@/lib/studio/fal-server";
import { prepareJob } from "@/lib/studio/jobs-server";
import { getMonthlyCapUsd } from "@/lib/studio/server";

export const maxDuration = 30;

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// Starts a fal job (poster, greeting poster, cutout, subtitles). The price was
// shown before; pressing the button is the confirmation, as for voice-overs.
export async function POST(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const limit = await checkRateLimit(studioJobLimiter, staff.id);
  if (!limit.success) {
    return errorResponse("Trop de demandes. Réessayez dans quelques minutes.", 429, req);
  }
  if (!falConfigured()) {
    console.error("Studio: FAL_STUDIO_KEY is not configured");
    return errorResponse("Cet outil n'est pas encore configuré.", 503, req);
  }

  const body = await req.json().catch(() => null);
  const tool = body?.tool as JobTool;
  if (!tool || !(tool in FAL_ENDPOINTS)) return errorResponse("Outil inconnu", 400, req);
  const acknowledged = Number(body?.acknowledged_cost_usd);
  if (!Number.isFinite(acknowledged)) return errorResponse("Prix non confirmé", 400, req);

  const conversation =
    typeof body?.conversation_id === "string" ? await loadConversation(body.conversation_id) : null;
  if (!conversation || !canWriteConversation(staff, conversation)) {
    return errorResponse("Conversation introuvable", 404, req);
  }

  const prepared = await prepareJob(tool, (body?.params ?? {}) as Record<string, unknown>, conversation);
  if (!prepared.ok) return errorResponse(prepared.error, prepared.status, req);
  const { job } = prepared;
  if (!isAllowedEndpoint(job.endpoint)) return errorResponse("Modèle non autorisé", 400, req);

  if (!acknowledgedCoversServerPrice(acknowledged, job.estimateUsd)) {
    return cors(
      NextResponse.json(
        { error: "Le prix a changé.", code: "price_changed", estimateUsd: job.estimateUsd },
        { status: 409 },
      ),
      req,
    );
  }

  const { data: id, error: reserveError } = await supabaseAdmin.rpc("reserve_studio_spend", {
    p_user_id: staff.id,
    p_kind: toolKind(tool),
    p_voice: null,
    p_model: job.endpoint,
    p_input: { context: job.context, endpoint: job.endpoint },
    p_est_cost_usd: job.estimateUsd,
    p_cap_usd: await getMonthlyCapUsd(staff.id),
    p_month_start: startOfMonthIso(),
  });
  if (reserveError) {
    console.error("Studio: job reserve failed", reserveError.code);
    return errorResponse("Erreur du Studio", 500, req);
  }
  if (!id) {
    return errorResponse("Plafond mensuel atteint. Demandez à Salif de le relever.", 402, req);
  }

  await supabaseAdmin
    .from("studio_generations")
    .update({
      conversation_id: conversation.id,
      property_id: conversation.property_id,
    })
    .eq("id", id);

  const submitted = await submitFal(job.endpoint, job.input);
  if (!submitted.ok) {
    await supabaseAdmin
      .from("studio_generations")
      .update({ status: "failed", error: `fal ${submitted.status}` })
      .eq("id", id);
    return errorResponse(
      submitted.status === 403 || submitted.status === 402
        ? "Le compte fal n'a plus de crédit ou la clé est refusée. Prévenez Salif."
        : "La création n'a pas pu démarrer. Réessayez.",
      502,
      req,
    );
  }

  await supabaseAdmin
    .from("studio_generations")
    .update({
      provider_request_id: submitted.requestId,
      input: {
        context: job.context,
        endpoint: job.endpoint,
        status_url: submitted.statusUrl,
        response_url: submitted.responseUrl,
      },
    })
    .eq("id", id);

  return cors(NextResponse.json({ id, tool }, { status: 202 }), req);
}
