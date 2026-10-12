import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  CONTENT_FIELDS,
  canChangeStatus,
  canRetry,
  statusAfterEdit,
  type PublicationStatus,
} from "@/lib/studio/publishing";
import {
  PUBLICATION_COLUMNS,
  approvalProblems,
  parsePostInput,
  roleOf,
  toDtos,
  type PublicationRow,
} from "@/lib/studio/publishing-server";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

type Ctx = { params: Promise<{ id: string }> };

async function loadRow(id: string): Promise<PublicationRow | null> {
  const { data } = await supabaseAdmin.from("studio_publications").select(PUBLICATION_COLUMNS).eq("id", id).maybeSingle();
  return (data as PublicationRow | null) ?? null;
}

function same(field: string, a: unknown, b: unknown) {
  // The database returns "2026-10-14T19:00:00+00:00"; the editor sends "...000Z".
  if (field === "scheduled_at") return new Date(String(a)).getTime() === new Date(String(b)).getTime();
  if (field === "networks") return JSON.stringify([...((a as string[]) ?? [])].sort()) === JSON.stringify([...((b as string[]) ?? [])].sort());
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

const ACTION_TARGET: Record<string, PublicationStatus> = {
  submit: "a_valider",
  approve: "valide",
  unapprove: "a_valider",
  back: "a_faire",
};

// Edit a post, or move it: submit (staff), approve (founder only), unapprove,
// back to "à faire", retry a failed post. Every write is conditional on the
// status we read and on the post not being claimed by the publisher.
export async function PATCH(req: Request, { params }: Ctx) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const { id } = await params;
  const row = await loadRow(id);
  if (!row) return errorResponse("Publication introuvable", 404, req);
  if (row.claimed_at) return errorResponse("Publication en cours : attendez la fin avant de modifier.", 409, req);
  if (row.status === "publie") return errorResponse("Cette publication est déjà en ligne.", 409, req);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return errorResponse("Requête invalide", 400, req);
  const role = roleOf(staff);
  const action = typeof body.action === "string" ? body.action : null;
  const nowIso = new Date().toISOString();
  let update: Record<string, unknown> = {};

  if (action === "retry") {
    if (!canRetry(role, row.status, Boolean(row.approved_by))) return errorResponse("Seule une publication en échec peut être relancée.", 409, req);
    update = { status: "valide", last_error: null, claimed_at: null };
  } else if (action) {
    const target = ACTION_TARGET[action];
    if (!target) return errorResponse("Action inconnue", 400, req);
    if (!canChangeStatus(role, row.status, target)) {
      return errorResponse(target === "valide" ? "Seul un fondateur peut valider une publication." : "Changement de statut impossible.", 403, req);
    }
    if (target === "valide") {
      const problems = await approvalProblems(row);
      if (problems.length) return cors(NextResponse.json({ error: problems[0].message, problems }, { status: 422 }), req);
      update = { status: "valide", approved_by: staff.id, approved_at: nowIso, last_error: null };
    } else {
      update = { status: target, approved_by: null, approved_at: null };
    }
  } else {
    const { values, error } = await parsePostInput(body, row);
    if (error) return errorResponse(error, 400, req);
    const changed = CONTENT_FIELDS.some((field) => field in values && !same(field, values[field as keyof typeof values], row[field]));
    const next = statusAfterEdit(row.status, changed);
    update = { ...values };
    if (next !== row.status) Object.assign(update, { status: next, approved_by: null, approved_at: null });
  }

  const { data, error } = await supabaseAdmin
    .from("studio_publications")
    .update({ ...update, updated_at: nowIso })
    .eq("id", id)
    .eq("status", row.status)
    .is("claimed_at", null)
    .select(PUBLICATION_COLUMNS);
  if (error) {
    console.error("Studio calendar: update failed", error.code);
    return errorResponse("Mise à jour impossible", 500, req);
  }
  if (!data?.length) return errorResponse("La publication a changé entre-temps. Rechargez la page.", 409, req);
  const [post] = await toDtos(data as PublicationRow[]);
  return cors(NextResponse.json({ post }), req);
}

// Remove a planned post. Never a published one, never one being published.
export async function DELETE(req: Request, { params }: Ctx) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const { id } = await params;
  const row = await loadRow(id);
  if (!row) return errorResponse("Publication introuvable", 404, req);
  if (row.status === "publie" || row.claimed_at) return errorResponse("Une publication en ligne ou en cours ne peut pas être supprimée.", 409, req);
  if (roleOf(staff) !== "founder" && row.created_by !== staff.id) {
    return errorResponse("Seul l'auteur ou un fondateur peut supprimer cette publication.", 403, req);
  }
  const { data, error } = await supabaseAdmin
    .from("studio_publications")
    .delete()
    .eq("id", id)
    .neq("status", "publie")
    .is("claimed_at", null)
    .select("id");
  if (error) return errorResponse("Suppression impossible", 500, req);
  if (!data?.length) return errorResponse("La publication a changé entre-temps. Rechargez la page.", 409, req);
  return cors(NextResponse.json({ ok: true }), req);
}
