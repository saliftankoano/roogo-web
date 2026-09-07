import { z } from "zod";
import { corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canRespondToPropertyRequest,
  isRequestAttachmentPath,
  OWN_RESPONSE_COLUMNS,
  propertyResponseSchema,
  REQUEST_ATTACHMENTS_BUCKET,
} from "@/lib/property-requests";
import {
  requestActor,
  requestJson,
  requestFailure,
} from "@/lib/property-request-server";

export const OPTIONS = corsOptions;
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, error: authError } = await requestActor(req);
    if (!user) return authError;
    if (!canRespondToPropertyRequest(user.user_type))
      return errorResponse("Réservé aux propriétaires et agents.", 403, req);
    const { id } = await params;
    if (!z.uuid().safeParse(id).success)
      return errorResponse("Appel introuvable.", 404, req);
    const parsed = propertyResponseSchema.safeParse(
      await req.json().catch(() => null),
    );
    if (!parsed.success)
      return errorResponse(parsed.error.issues[0].message, 400, req);
    for (const file of parsed.data.attachments) {
      if (!isRequestAttachmentPath(file.path, user.id, id))
        return errorResponse("Pièce jointe invalide.", 400, req);
      const { data, error } = await supabaseAdmin.storage
        .from(REQUEST_ATTACHMENTS_BUCKET)
        .info(file.path);
      if (error || !data)
        return errorResponse(
          "Une pièce jointe manque. Relancez son envoi.",
          400,
          req,
        );
    }
    const { data: result, error } = await supabaseAdmin.rpc(
      "submit_property_request_response",
      { p_request_id: id, p_user_id: user.id, p_input: parsed.data },
    );
    if (error) throw error;
    if (result.error) {
      const messages: Record<string, string> = {
        forbidden: "Accès non autorisé.",
        not_found: "Appel introuvable.",
        closed: "Cet appel est fermé.",
        terms_changed:
          "Cet appel a changé. Actualisez pour lire les nouvelles conditions.",
        terms_required: "Acceptez les conditions pour continuer.",
      };
      return errorResponse(
        messages[result.error] || "Envoi impossible.",
        result.error === "forbidden"
          ? 403
          : result.error === "not_found"
            ? 404
            : 409,
        req,
      );
    }
    const { data: response, error: readError } = await supabaseAdmin
      .from("property_request_responses")
      .select(OWN_RESPONSE_COLUMNS)
      .eq("id", result.id)
      .eq("respondent_id", user.id)
      .single();
    if (readError) throw readError;
    return requestJson(
      req,
      { response, existing: result.existing },
      result.existing ? 200 : 201,
    );
  } catch (error) {
    return requestFailure(req, error);
  }
}
