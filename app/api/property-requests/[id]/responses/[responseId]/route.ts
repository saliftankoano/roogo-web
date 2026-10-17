import { z } from "zod";
import { corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  responseReviewSchema,
  matchesResponseTransaction,
} from "@/lib/property-requests";
import {
  requestActor,
  requestJson,
  requestFailure,
} from "@/lib/property-request-server";

export const OPTIONS = corsOptions;
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; responseId: string }> },
) {
  try {
    const { user, error: authError } = await requestActor(req, true);
    if (!user) return authError;
    const { id, responseId } = await params;
    if (
      !z.uuid().safeParse(id).success ||
      !z.uuid().safeParse(responseId).success
    )
      return errorResponse("Réponse introuvable.", 404, req);
    const parsed = responseReviewSchema.safeParse(
      await req.json().catch(() => null),
    );
    if (!parsed.success)
      return errorResponse(parsed.error.issues[0].message, 400, req);
    const { data: existing, error: readError } = await supabaseAdmin
      .from("property_request_responses")
      .select(
        "respondent_id,respondent_role,commission_confirmed_at,commission_basis",
      )
      .eq("id", responseId)
      .eq("request_id", id)
      .maybeSingle();
    if (readError) throw readError;
    if (!existing) return errorResponse("Réponse introuvable.", 404, req);
    if (!existing.respondent_id)
      return errorResponse(
        "Ce compte a été supprimé. La réponse est archivée.",
        409,
        req,
      );
    if (parsed.data.property_id) {
      const { data: property, error } = await supabaseAdmin
        .from("properties")
        .select("id,agent_id,status,listing_type,frequence,period")
        .eq("id", parsed.data.property_id)
        .maybeSingle();
      if (error) throw error;
      if (!property || property.agent_id !== existing.respondent_id)
        return errorResponse(
          "L'annonce doit appartenir à cet agent ou propriétaire.",
          400,
          req,
        );
      if (!matchesResponseTransaction(property, existing.commission_basis))
        return errorResponse(
          "L'annonce doit correspondre aux conditions acceptées : vente ou location mensuelle.",
          400,
          req,
        );
      if (parsed.data.status === "listed" && property.status !== "en_ligne")
        return errorResponse(
          "Publiez l'annonce avant de marquer ce bien comme publié.",
          400,
          req,
        );
    }
    const confirmsCommission =
      existing.respondent_role === "agent" &&
      ["accepted", "listed"].includes(parsed.data.status) &&
      !existing.commission_confirmed_at;
    const { updated_at, ...updates } = parsed.data;
    const { data, error } = await supabaseAdmin
      .from("property_request_responses")
      .update({
        ...updates,
        ...(updates.property_id ? { property_deleted_at: null } : {}),
        ...(confirmsCommission
          ? {
              commission_confirmed_at: new Date().toISOString(),
              commission_confirmed_by: user.id,
            }
          : {}),
      })
      .eq("id", responseId)
      .eq("request_id", id)
      .eq("updated_at", updated_at)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return errorResponse(
        "Ce suivi a changé. Actualisez avant de réessayer ; vos notes sont conservées.",
        409,
        req,
      );
    return requestJson(req, { response: data });
  } catch (error) {
    return requestFailure(req, error);
  }
}
