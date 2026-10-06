import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { FAL_ENDPOINTS, type JobTool } from "@/lib/studio/ai-tools";
import {
  canWriteConversation,
  loadConversation,
  loadPropertyRow,
} from "@/lib/studio/conversations-server";
import { fcfaPerUsd } from "@/lib/studio/currency";
import { posterDefaults, prepareJob } from "@/lib/studio/jobs-server";
import { getMonthlyCapUsd, getUsedThisMonthUsd } from "@/lib/studio/server";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// Price preview for a tool, plus the defaults the form is filled with.
// Writes nothing.
export async function POST(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const body = await req.json().catch(() => null);
  const tool = body?.tool as JobTool;
  if (!tool || !(tool in FAL_ENDPOINTS)) return errorResponse("Outil inconnu", 400, req);

  const conversation =
    typeof body?.conversation_id === "string" ? await loadConversation(body.conversation_id) : null;
  if (!conversation || !canWriteConversation(staff, conversation)) {
    return errorResponse("Conversation introuvable", 404, req);
  }

  const [capUsd, usedUsd] = await Promise.all([
    getMonthlyCapUsd(staff.id),
    getUsedThisMonthUsd(staff.id),
  ]);

  const prepared = await prepareJob(tool, (body?.params ?? {}) as Record<string, unknown>, conversation);
  // A tool that cannot run yet (no property, no voice) still returns its state so
  // the page can show the button as unavailable with the reason.
  const defaults =
    (tool === "poster" || tool === "cutout") && conversation.property_id
      ? await loadPropertyRow(conversation.property_id).then((row) =>
          row ? posterDefaults(row) : null,
        )
      : null;

  return cors(
    NextResponse.json({
      available: prepared.ok,
      reason: prepared.ok ? null : prepared.error,
      estimateUsd: prepared.ok ? prepared.job.estimateUsd : null,
      capUsd,
      usedUsd,
      remainingUsd: Math.max(0, capUsd - usedUsd),
      fcfaPerUsd: fcfaPerUsd(process.env.STUDIO_FCFA_PER_USD),
      defaults,
    }),
    req,
  );
}
