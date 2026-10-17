import { NextResponse } from "next/server";
import { searchLinks } from "@/lib/team-tasks/server";
import { requireViewer, serverError } from "../_shared";

// GET ?type=property|visit|studio&q=  options for "Lier à".
export async function GET(req: Request) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { searchParams } = new URL(req.url);
  try {
    const result = await searchLinks(viewer, searchParams.get("type") ?? "", searchParams.get("q") ?? "");
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true, options: result.value });
  } catch (error) {
    return serverError("GET links", error);
  }
}
