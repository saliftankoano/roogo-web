import { NextResponse } from "next/server";
import { cors, errorResponse } from "@/lib/api-helpers";
import { getAuthenticatedUser, isStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canRespondToPropertyRequest,
  REQUEST_ATTACHMENTS_BUCKET,
  type PropertyResponse,
} from "@/lib/property-requests";

export async function requestActor(req: Request, staffOnly = false) {
  const user = await getAuthenticatedUser(req);
  if (!user)
    return {
      user: null,
      error: errorResponse("Connectez-vous pour continuer.", 401, req),
    };
  if (
    staffOnly
      ? !isStaffOrFounder(user)
      : !isStaffOrFounder(user) && !canRespondToPropertyRequest(user.user_type)
  ) {
    return {
      user: null,
      error: errorResponse("Accès non autorisé.", 403, req),
    };
  }
  return { user, error: null };
}

export function requestJson(req: Request, data: unknown, status = 200) {
  const res = cors(NextResponse.json(data, { status }), req);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

export function requestFailure(req: Request, error: unknown) {
  console.error("Property requests:", error);
  return errorResponse(
    "Impossible de traiter la demande. Veuillez réessayer.",
    500,
    req,
  );
}

export async function signedResponseFiles(response: PropertyResponse) {
  return {
    ...response,
    attachments: await Promise.all(
      (response.attachments || []).map(async (file) => {
        const { data } = await supabaseAdmin.storage
          .from(REQUEST_ATTACHMENTS_BUCKET)
          .createSignedUrl(file.path, 600);
        return { ...file, url: data?.signedUrl ?? null };
      }),
    ),
  };
}
