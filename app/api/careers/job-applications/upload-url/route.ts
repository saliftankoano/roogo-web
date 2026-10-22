import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  APPLICATIONS_CLOSED_MESSAGE,
  buildUploadPath,
  getJobRole,
  isApplicationOpen,
  resolveUploadMime,
  uploadSizeError,
  type UploadKind,
} from "@/lib/job-applications";
import { JOB_APPLICATIONS_BUCKET } from "@/lib/job-applications-server";
import {
  checkRateLimit,
  jobApplicationUploadLimiter,
  requestIp,
} from "@/lib/rate-limit";

// Public: a signed upload URL into the PRIVATE bucket `candidatures` for a CV
// or the sales video. The browser PUTs the bytes straight to Supabase, so
// nothing large goes through Vercel. The bucket allowlist and size limit
// (migration 104) are what really enforce type and size at PUT time; the
// checks here only give a clear French message earlier.
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      role?: string;
      kind?: string;
      contentType?: string;
      fileName?: string;
      size?: number;
    };

    const role = getJobRole(body.role);
    if (!role) {
      return NextResponse.json({ success: false, error: "Offre introuvable." }, { status: 404 });
    }
    if (!isApplicationOpen(role)) {
      return NextResponse.json({ success: false, error: APPLICATIONS_CLOSED_MESSAGE, closed: true }, { status: 410 });
    }

    const kind: UploadKind | null = body.kind === "cv" || body.kind === "video" ? body.kind : null;
    if (!kind) {
      return NextResponse.json({ success: false, error: "Type de fichier inconnu." }, { status: 400 });
    }

    const mime = resolveUploadMime(kind, body.contentType, body.fileName);
    if (!mime) {
      return NextResponse.json(
        {
          success: false,
          error:
            kind === "cv"
              ? "CV : PDF ou photo (JPEG, PNG, WebP) seulement."
              : "Vidéo : MP4, MOV ou WebM seulement. Sinon, colle un lien.",
        },
        { status: 400 },
      );
    }
    const sizeError = uploadSizeError(kind, Number(body.size));
    if (sizeError) {
      return NextResponse.json({ success: false, error: sizeError }, { status: 400 });
    }

    const limit = await checkRateLimit(jobApplicationUploadLimiter, requestIp(req));
    if (!limit.success) {
      return NextResponse.json(
        { success: false, error: "Trop d'envois depuis cette connexion. Réessaie dans une heure." },
        { status: 429, headers: limit.headers },
      );
    }

    const path = buildUploadPath(role.slug, kind, crypto.randomUUID(), mime);
    const { data, error } = await supabaseAdmin.storage
      .from(JOB_APPLICATIONS_BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data) {
      console.error("POST /api/careers/job-applications/upload-url: sign failed", error?.message);
      return NextResponse.json(
        { success: false, error: "Impossible de préparer l'envoi. Réessaie dans un instant." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      path: data.path,
      signedUrl: data.signedUrl,
      contentType: mime,
    });
  } catch (error) {
    console.error("POST /api/careers/job-applications/upload-url:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Erreur interne du serveur." }, { status: 500 });
  }
}
