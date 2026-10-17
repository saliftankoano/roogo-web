import { corsOptions, errorResponse } from "@/lib/api-helpers";
import { isStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  OWN_RESPONSE_COLUMNS,
  PUBLIC_REQUEST_COLUMNS,
  propertyRequestSchema,
} from "@/lib/property-requests";
import {
  requestActor,
  requestJson,
  requestFailure,
} from "@/lib/property-request-server";

export const OPTIONS = corsOptions;
export async function GET(req: Request) {
  try {
    const { user, error: authError } = await requestActor(req);
    if (!user) return authError;
    const staff = isStaffOrFounder(user);
    if (staff) {
      const { data, error } = await supabaseAdmin
        .from("property_requests")
        .select("*, property_request_responses(count)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return requestJson(req, {
        requests: (data || []).map(
          ({ property_request_responses, ...request }) => ({
            ...request,
            response_count: property_request_responses?.[0]?.count ?? 0,
          }),
        ),
      });
    }
    const { data: responses, error: responseError } = await supabaseAdmin
      .from("property_request_responses")
      .select(OWN_RESPONSE_COLUMNS)
      .eq("respondent_id", user.id);
    if (responseError) throw responseError;
    const ids = (responses || []).map((r) => r.request_id);
    let query = supabaseAdmin
      .from("property_requests")
      .select(PUBLIC_REQUEST_COLUMNS)
      .order("created_at", { ascending: false });
    // Own responses remain accessible when a call closes or returns to draft.
    query = ids.length
      ? query.or(`status.eq.open,id.in.(${ids.join(",")})`)
      : query.eq("status", "open");
    const { data, error } = await query;
    if (error) throw error;
    return requestJson(req, {
      requests: (data || []).map((request) => ({
        ...request,
        my_response:
          responses?.find((r) => r.request_id === request.id) ?? null,
      })),
    });
  } catch (error) {
    return requestFailure(req, error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, error: authError } = await requestActor(req, true);
    if (!user) return authError;
    const parsed = propertyRequestSchema.safeParse(
      await req.json().catch(() => null),
    );
    if (!parsed.success)
      return errorResponse(parsed.error.issues[0].message, 400, req);
    const { data, error } = await supabaseAdmin
      .from("property_requests")
      .insert({ ...parsed.data, created_by: user.id })
      .select("*")
      .single();
    if (error) throw error;
    return requestJson(req, { request: data }, 201);
  } catch (error) {
    return requestFailure(req, error);
  }
}
