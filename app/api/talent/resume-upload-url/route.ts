import { NextResponse } from "next/server";
import { resolveClerkId } from "@/lib/request-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { TALENT_DOCUMENTS_BUCKET } from "@/lib/talent";

export async function POST(req: Request) {
  try {
    const clerkId = await resolveClerkId(req);
    if (!clerkId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const user = await getOrSyncUserByClerkId(clerkId);
    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      filename?: string;
      contentType?: string;
    };

    if (body.contentType !== "application/pdf") {
      return NextResponse.json(
        { success: false, error: "Seuls les CV au format PDF sont acceptés." },
        { status: 400 },
      );
    }

    const safeFilename = (body.filename || "cv.pdf")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .slice(0, 120);
    const path = `${user.id}/${crypto.randomUUID()}-${safeFilename || "cv.pdf"}`;

    const { data, error } = await supabaseAdmin.storage
      .from(TALENT_DOCUMENTS_BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data) throw error ?? new Error("Upload URL failed");

    return NextResponse.json({
      success: true,
      upload: {
        path: data.path,
        signedUrl: data.signedUrl,
        token: data.token,
      },
    });
  } catch (error) {
    console.error("POST /api/talent/resume-upload-url:", error);
    return NextResponse.json(
      { success: false, error: "Impossible de préparer l'envoi du CV." },
      { status: 500 },
    );
  }
}
