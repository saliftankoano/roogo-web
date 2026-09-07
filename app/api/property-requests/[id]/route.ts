import { z } from "zod";
import { corsOptions, errorResponse } from "@/lib/api-helpers";
import { isStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  OWN_RESPONSE_COLUMNS,
  PUBLIC_REQUEST_COLUMNS,
  propertyRequestSchema,
  matchesResponseTransaction,
  type PropertyResponse,
  type PropertyRequest,
} from "@/lib/property-requests";
import {
  requestActor,
  requestJson,
  requestFailure,
  signedResponseFiles,
} from "@/lib/property-request-server";

type Context = { params: Promise<{ id: string }> };
export const OPTIONS = corsOptions;
export async function GET(req: Request, context: Context) {
  try {
    const { user, error: authError } = await requestActor(req);
    if (!user) return authError;
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      return errorResponse("Appel introuvable.", 404, req);
    const staff = isStaffOrFounder(user);
    const { data: request, error } = await supabaseAdmin
      .from("property_requests")
      .select(staff ? "*" : PUBLIC_REQUEST_COLUMNS)
      .eq("id", id)
      .maybeSingle<PropertyRequest>();
    if (error) throw error;
    if (!request) return errorResponse("Appel introuvable.", 404, req);
    let query = supabaseAdmin
      .from("property_request_responses")
      .select(
        staff
          ? "*, respondent:users!respondent_id(id,full_name,phone,whatsapp,email,company_name)"
          : OWN_RESPONSE_COLUMNS,
      )
      .eq("request_id", id)
      .order("created_at", { ascending: false });
    if (!staff) query = query.eq("respondent_id", user.id);
    const { data: responses, error: responseError } = await query;
    if (responseError) throw responseError;
    if (!staff && request.status !== "open" && !responses?.length)
      return errorResponse("Appel introuvable.", 404, req);
    const rows = (responses || []) as unknown as PropertyResponse[];
    if (staff && rows.length) {
      const { data, error: propertyError } = await supabaseAdmin
        .from("properties")
        .select("id,title,city,status,listing_type,agent_id,frequence,period")
        .in("agent_id", [
          ...new Set(
            rows.flatMap((row) =>
              row.respondent_id ? [row.respondent_id] : [],
            ),
          ),
        ]);
      if (propertyError) throw propertyError;
      const properties = data || [];
      for (const row of rows)
        row.properties = properties.filter(
          (property) =>
            property.agent_id === row.respondent_id &&
            matchesResponseTransaction(property, row.commission_basis),
        );
    }
    return requestJson(req, {
      request,
      responses: await Promise.all(rows.map(signedResponseFiles)),
    });
  } catch (error) {
    return requestFailure(req, error);
  }
}

export async function PUT(req: Request, context: Context) {
  try {
    const { user, error: authError } = await requestActor(req, true);
    if (!user) return authError;
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      return errorResponse("Appel introuvable.", 404, req);
    const body = await req.json().catch(() => null);
    const parsed = propertyRequestSchema.safeParse(body);
    const version = z.iso
      .datetime({ offset: true })
      .safeParse(body?.updated_at);
    if (!parsed.success || !version.success)
      return errorResponse("Vérifiez les champs de l'appel.", 400, req);
    const { data, error } = await supabaseAdmin
      .from("property_requests")
      .update(parsed.data)
      .eq("id", id)
      .eq("updated_at", version.data)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return errorResponse(
        "Cet appel a changé. Actualisez avant de le modifier.",
        409,
        req,
      );
    return requestJson(req, { request: data });
  } catch (error) {
    return requestFailure(req, error);
  }
}
