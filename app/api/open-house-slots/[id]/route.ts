import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseClient, getUserByClerkId } from "@/lib/user-sync";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

async function requireStaff() {
  const { userId } = await auth();
  if (!userId) return { ok: false as const, res: json({ error: "Unauthorized" }, 401) };

  const user = await getUserByClerkId(userId);
  if (!user || user.user_type !== "staff") {
    return { ok: false as const, res: json({ error: "Forbidden" }, 403) };
  }

  return { ok: true as const };
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff();
  if (!staff.ok) return staff.res;

  const { id } = await params;
  if (!id) return json({ error: "Missing id" }, 400);

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from("open_house_slots").delete().eq("id", id);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "An unexpected error occurred" },
      500
    );
  }
}

