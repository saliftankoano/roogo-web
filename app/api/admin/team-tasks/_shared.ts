import { NextResponse } from "next/server";
import { getViewer, type ServiceResult, type Viewer } from "@/lib/team-tasks/server";
import { staffLevelCan, type EffectiveStaffLevel, type StaffCapability } from "@/lib/staff-access";
import type { StaffLevel } from "@/lib/team-tasks/core";

const ACCESS_LEVEL: Record<StaffLevel, EffectiveStaffLevel> = {
  fondateur: "founder",
  directeur: "director",
  assistant: "assistant",
  conseillere: "advisor",
  stagiaire: "intern",
};

export async function requireViewer(): Promise<Viewer | NextResponse> {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Accès réservé à l’équipe Roogo." }, { status: 403 });
  return viewer;
}

/**
 * A staff member whose level holds `capability` (lib/staff-access.ts). A staff
 * account without a level counts as Conseiller(ère) in the team tools.
 */
export async function requireViewerCan(capability: StaffCapability): Promise<Viewer | NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  if (!staffLevelCan(ACCESS_LEVEL[viewer.level], capability)) {
    return NextResponse.json({ error: "Votre niveau ne permet pas cette action." }, { status: 403 });
  }
  return viewer;
}

export function respond<T>(result: ServiceResult<T>) {
  if (result.ok) return NextResponse.json({ success: true, ...result.value });
  return NextResponse.json({ error: result.error }, { status: result.status });
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function serverError(context: string, error: unknown) {
  const e = error as { code?: string; message?: string; name?: string } | undefined;
  console.error(`[team-tasks] ${context}`, { name: e?.name, code: e?.code, message: e?.message });
  return NextResponse.json({ error: "Le chargement a échoué. Réessayez dans un instant." }, { status: 500 });
}
