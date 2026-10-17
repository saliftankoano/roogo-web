import { NextResponse } from "next/server";
import { dayKey } from "@/lib/team-tasks/core";
import { parseReading } from "@/lib/team-goals/core";
import { addReading } from "@/lib/team-goals/server";
import { readJson, requireViewer, respond, serverError } from "../../team-tasks/_shared";

// POST { metric, value, measuredOn?, note?, proof?: { data, ext } }: a manual
// reading (followers), with an optional screenshot already compressed by
// lib/clientImageCompression.ts. Founder and Directeur only (checked in addReading).
export async function POST(req: Request) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const body = await readJson(req);
  const parsed = parseReading(body, dayKey(new Date()));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const raw = body?.proof as { data?: unknown; ext?: unknown } | null | undefined;
  const proof = raw && typeof raw.data === "string" && typeof raw.ext === "string" ? { data: raw.data, ext: raw.ext } : null;
  try {
    return respond(await addReading(viewer, parsed.value, proof));
  } catch (error) {
    return serverError("POST reading", error);
  }
}
