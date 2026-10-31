import { after, NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  CONTENT_FIELDS,
  canChangeStatus,
  canRetry,
  canReturn,
  cleanReturnInput,
  isNetwork,
  retryResults,
  submitProblems,
  statusAfterEdit,
  type PublicationStatus,
} from "@/lib/studio/publishing";
import { scheduledAtOnApproval } from "@/lib/studio/publish-everywhere";
import {
  PUBLICATION_COLUMNS,
  approvalProblems,
  parsePostInput,
  roleOf,
  runPublishingWorker,
  toDtos,
  videoDurationOf,
  type PublicationRow,
} from "@/lib/studio/publishing-server";
import { creatorInfoNow, saveTikTokSettings, tiktokDemo, tiktokPanelRequired } from "@/lib/social/tiktok-settings-server";
import { COPY as TIKTOK_COPY, choiceProblems, parseChoices, toSettings } from "@/lib/social/tiktok-post-settings";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// « Valider » on « Dès que Salif valide » starts the publisher right away (after the answer).
export const maxDuration = 300;

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
  let startNow = false;

  if (action === "return") {
    // "Renvoyer" (founder): back to the team with a required comment. The
    // post no longer holds its slot until it is sent again.
    if (!canReturn(role, row.status)) return errorResponse("Seul un fondateur peut renvoyer une publication en attente.", 403, req);
    const input = cleanReturnInput(body.comment, body.tags);
    if (input.error) return errorResponse(input.error, 400, req);
    update = {
      status: "a_faire",
      approved_by: null,
      approved_at: null,
      returned_by: staff.id,
      returned_at: nowIso,
      review_comment: input.comment,
      review_tags: input.tags,
    };
  } else if (action === "retry") {
    if (!canRetry(role, row.status, Boolean(row.approved_by))) return errorResponse("Seule une publication en échec peut être relancée.", 409, req);
    // « Réessayer » on one network (PRD 2.7) or on every network that failed.
    const only = body.network === undefined || body.network === null ? null : body.network;
    if (only !== null && !isNetwork(only)) return errorResponse("Réseau inconnu", 400, req);
    const plan = retryResults(row.networks, row.results ?? {}, only);
    if (plan.error) return errorResponse(plan.error, 409, req);
    update = { status: "valide", last_error: null, claimed_at: null, results: plan.results };
    startNow = true;
  } else if (action) {
    const target = ACTION_TARGET[action];
    if (!target) return errorResponse("Action inconnue", 400, req);
    if (!canChangeStatus(role, row.status, target)) {
      return errorResponse(target === "valide" ? "Seul un fondateur peut valider une publication." : "Changement de statut impossible.", 403, req);
    }
    if (target === "valide") {
      const problems = await approvalProblems(row);
      if (problems.length) return cors(NextResponse.json({ error: problems[0].message, problems }, { status: 422 }), req);
      // TikTok panel (PRD « TikTok posting screen for the audit »): in direct
      // mode the founder's choices are checked against fresh creator info and
      // saved before the post is approved; the publisher sends exactly them.
      if (row.networks.includes("tiktok") && row.media_type === "video" && (await tiktokPanelRequired())) {
        if (tiktokDemo()) return errorResponse("Mode démo local : la validation est désactivée, rien n'est envoyé.", 422, req);
        const choices = parseChoices(body.tiktok);
        if (!choices) return errorResponse(TIKTOK_COPY.pickPrivacy, 422, req);
        const creator = await creatorInfoNow();
        if (!creator.ok) return errorResponse(creator.error, 422, req);
        const tiktokProblems = choiceProblems(choices, creator.creator, await videoDurationOf(row));
        if (tiktokProblems.length) return errorResponse(tiktokProblems[0], 422, req);
        const saved = await saveTikTokSettings(id, row.status, toSettings(choices, creator.creator, staff.id, nowIso));
        if (!saved.ok) return errorResponse(saved.error, 409, req);
      }
      update = {
        status: "valide",
        approved_by: staff.id,
        approved_at: nowIso,
        last_error: null,
        scheduled_at: scheduledAtOnApproval(row, new Date(nowIso)),
      };
      startNow = Boolean(row.publish_on_approval);
    } else {
      if (target === "a_valider" && row.status === "a_faire") {
        const problems = submitProblems(row.caption);
        if (problems.length) return errorResponse(problems[0].message, 400, req);
        update = { status: target, approved_by: null, approved_at: null, submitted_by: staff.id, submitted_at: nowIso };
      } else {
        update = { status: target, approved_by: null, approved_at: null };
      }
    }
    // Any other move ends a "sent back" state.
    update.returned_at = null;
  } else {
    const { values, error } = await parsePostInput(body, row);
    if (error) return errorResponse(error, 400, req);
    const changed = CONTENT_FIELDS.some((field) => field in values && !same(field, values[field as keyof typeof values], row[field]));
    const next = statusAfterEdit(row.status, changed);
    update = { ...values };
    if (["caption", "hashtags"].some((field) => field in values && !same(field, values[field as keyof typeof values], row[field as keyof PublicationRow]))) {
      Object.assign(update, { caption_edited_by: staff.id, caption_edited_at: nowIso });
    }
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
  if (startNow) {
    // The cron (every 10 minutes) stays the safety net; the claim makes a double run harmless.
    after(async () => {
      try {
        await runPublishingWorker({ onlyId: id, limit: 1, budgetMs: 240_000 });
      } catch (error) {
        console.error("Studio: immediate publish failed", id, error instanceof Error ? error.message : "unknown");
      }
    });
  }
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
