import { z } from "zod";
import { corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canRespondToPropertyRequest,
  REQUEST_ATTACHMENTS_BUCKET,
  REQUEST_FILE_MIMES,
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
      return errorResponse("Accès non autorisé.", 403, req);
    const { id } = await params;
    if (!z.uuid().safeParse(id).success)
      return errorResponse("Appel introuvable.", 404, req);
    const parsed = z
      .object({
        mime_type: z.enum([
          "image/jpeg",
          "image/png",
          "image/webp",
          "application/pdf",
        ]),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success)
      return errorResponse(
        "Formats acceptés : JPG, PNG, WebP et PDF (10 Mo maximum).",
        400,
        req,
      );
    const { data: request, error } = await supabaseAdmin
      .from("property_requests")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!request || request.status !== "open")
      return errorResponse("Cet appel n'est plus ouvert.", 409, req);
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("property_request_responses")
      .select("id")
      .eq("request_id", id)
      .eq("respondent_id", user.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing)
      return errorResponse("Vous avez déjà répondu à cet appel.", 409, req);
    const path = `${user.id}/${id}/${crypto.randomUUID()}.${REQUEST_FILE_MIMES[parsed.data.mime_type]}`;
    const { data, error: uploadError } = await supabaseAdmin.storage
      .from(REQUEST_ATTACHMENTS_BUCKET)
      .createSignedUploadUrl(path);
    if (uploadError || !data) throw uploadError;
    return requestJson(req, {
      upload: { path: data.path, signedUrl: data.signedUrl },
    });
  } catch (error) {
    return requestFailure(req, error);
  }
}
