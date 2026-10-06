import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canDeleteGlossaryEntry,
  MAX_GLOSSARY_ENTRIES,
  validateGlossaryEntry,
} from "@/lib/studio/glossary";
import { BUILTIN_RESPELLINGS } from "@/lib/studio/tts-prepare";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// Shared by the whole team: everyone on staff reads and adds entries.
export async function GET(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const { data, error } = await supabaseAdmin
    .from("studio_glossary")
    .select("id, term, spoken, created_by, created_at, updated_at, users(full_name)")
    .order("term", { ascending: true });
  if (error) return errorResponse("Glossaire indisponible", 500, req);

  const entries = (data ?? []).map((row) => {
    const author = Array.isArray(row.users) ? row.users[0] : row.users;
    return {
      id: row.id,
      term: row.term,
      spoken: row.spoken,
      author: author?.full_name ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isMine: row.created_by === staff.id,
      // Editing follows the same rule as removing: the author or a founder.
      canEdit: canDeleteGlossaryEntry(staff, row),
      canDelete: canDeleteGlossaryEntry(staff, row),
    };
  });

  return cors(
    NextResponse.json({ entries, builtins: BUILTIN_RESPELLINGS }),
    req,
  );
}

export async function POST(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const body = await req.json().catch(() => null);
  const parsed = validateGlossaryEntry({ term: body?.term, spoken: body?.spoken });
  if (!parsed.ok) return errorResponse(parsed.error, 400, req);

  const { count } = await supabaseAdmin
    .from("studio_glossary")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_GLOSSARY_ENTRIES) {
    return errorResponse("Le glossaire est plein.", 400, req);
  }

  const { error } = await supabaseAdmin.from("studio_glossary").insert({
    term: parsed.value.term,
    spoken: parsed.value.spoken,
    created_by: staff.id,
  });
  if (error) {
    // 23505 = unique violation on lower(term)
    if (error.code === "23505") {
      return errorResponse("Ce mot est déjà dans le glossaire.", 409, req);
    }
    console.error("Studio: glossary insert failed", error.code);
    return errorResponse("Le mot n'a pas pu être ajouté.", 500, req);
  }

  return cors(NextResponse.json({ ok: true }, { status: 201 }), req);
}

export async function DELETE(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return errorResponse("Entrée manquante", 400, req);

  const { data: entry } = await supabaseAdmin
    .from("studio_glossary")
    .select("id, created_by")
    .eq("id", id)
    .maybeSingle();
  if (!entry) return errorResponse("Entrée introuvable", 404, req);

  // The author or a founder only. Checked here, not just hidden in the UI.
  if (!canDeleteGlossaryEntry(staff, entry)) {
    return errorResponse(
      "Vous ne pouvez supprimer que les mots que vous avez ajoutés.",
      403,
      req,
    );
  }

  const { error } = await supabaseAdmin
    .from("studio_glossary")
    .delete()
    .eq("id", id);
  if (error) return errorResponse("Suppression impossible", 500, req);

  return cors(NextResponse.json({ ok: true }), req);
}

// Edit an entry's wording. Only the author or a founder, enforced here.
export async function PATCH(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return errorResponse("Entrée manquante", 400, req);

  const body = await req.json().catch(() => null);
  const parsed = validateGlossaryEntry({ term: body?.term, spoken: body?.spoken });
  if (!parsed.ok) return errorResponse(parsed.error, 400, req);

  const { data: entry } = await supabaseAdmin
    .from("studio_glossary")
    .select("id, created_by")
    .eq("id", id)
    .maybeSingle();
  if (!entry) return errorResponse("Entrée introuvable", 404, req);
  if (!canDeleteGlossaryEntry(staff, entry)) {
    return errorResponse(
      "Vous ne pouvez modifier que les mots que vous avez ajoutés.",
      403,
      req,
    );
  }

  const { error } = await supabaseAdmin
    .from("studio_glossary")
    .update({
      term: parsed.value.term,
      spoken: parsed.value.spoken,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return errorResponse("Ce mot est déjà dans le glossaire.", 409, req);
    }
    console.error("Studio: glossary update failed", error.code);
    return errorResponse("La modification a échoué.", 500, req);
  }

  return cors(NextResponse.json({ ok: true }), req);
}
