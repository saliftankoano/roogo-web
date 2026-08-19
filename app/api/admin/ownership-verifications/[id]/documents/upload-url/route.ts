import { NextResponse } from "next/server";
import { requireStaffSupabaseUser } from "@/lib/identity-verifications";
import {
  OWNERSHIP_DOCUMENT_EXTENSIONS,
  OWNERSHIP_DOCUMENT_MAX_BYTES,
  OWNERSHIP_DOCUMENT_MAX_FILES_PER_SUBMISSION,
  OWNERSHIP_DOCUMENT_MAX_FILES_PER_UPLOAD,
  OWNERSHIP_DOCUMENTS_BUCKET,
} from "@/lib/property-ownership";
import { supabaseAdmin } from "@/lib/supabase-admin";

type UploadRequest = {
  file_name?: unknown;
  mime_type?: unknown;
  size_bytes?: unknown;
};

function safeFileName(value: unknown) {
  if (typeof value !== "string") return "document";
  const normalized = value.trim().replace(/[\\/\u0000-\u001f]/g, "-");
  return normalized.slice(0, 180) || "document";
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireStaffSupabaseUser();
    if ("error" in authResult) return authResult.error;

    const { id } = await params;
    const body = (await req.json().catch(() => null)) as {
      files?: UploadRequest[];
    } | null;
    const files = Array.isArray(body?.files) ? body.files : [];

    if (
      files.length < 1 ||
      files.length > OWNERSHIP_DOCUMENT_MAX_FILES_PER_UPLOAD
    ) {
      return NextResponse.json(
        { error: "Sélectionnez entre 1 et 10 fichiers." },
        { status: 400 },
      );
    }

    const normalizedFiles = files.map((file) => {
      const mimeType =
        typeof file.mime_type === "string" ? file.mime_type.toLowerCase() : "";
      const sizeBytes =
        typeof file.size_bytes === "number" ? Math.floor(file.size_bytes) : 0;

      if (!OWNERSHIP_DOCUMENT_EXTENSIONS[mimeType]) {
        throw new Error("UNSUPPORTED_FILE_TYPE");
      }
      if (sizeBytes < 1 || sizeBytes > OWNERSHIP_DOCUMENT_MAX_BYTES) {
        throw new Error("INVALID_FILE_SIZE");
      }

      return {
        fileName: safeFileName(file.file_name),
        mimeType,
        sizeBytes,
      };
    });

    const { data: submission, error: submissionError } = await supabaseAdmin
      .from("property_ownership_submissions")
      .select("id, property_id, user_id, documents, status")
      .eq("id", id)
      .maybeSingle();

    if (submissionError) throw submissionError;
    if (!submission) {
      return NextResponse.json({ error: "Soumission introuvable." }, { status: 404 });
    }
    if (submission.status !== "pending") {
      return NextResponse.json(
        { error: "Seule une soumission en attente peut recevoir des fichiers." },
        { status: 409 },
      );
    }
    const currentDocumentCount = Array.isArray(submission.documents)
      ? submission.documents.length
      : 0;
    if (
      currentDocumentCount + normalizedFiles.length >
      OWNERSHIP_DOCUMENT_MAX_FILES_PER_SUBMISSION
    ) {
      return NextResponse.json(
        { error: "Une soumission ne peut pas contenir plus de 20 fichiers." },
        { status: 400 },
      );
    }

    const uploads = await Promise.all(
      normalizedFiles.map(async (file) => {
        const extension = OWNERSHIP_DOCUMENT_EXTENSIONS[file.mimeType];
        const path = `${submission.user_id}/${submission.property_id}/staff/${authResult.supabaseUser.id}/${crypto.randomUUID()}.${extension}`;
        const { data, error } = await supabaseAdmin.storage
          .from(OWNERSHIP_DOCUMENTS_BUCKET)
          .createSignedUploadUrl(path);

        if (error || !data) {
          throw error ?? new Error("Unable to create signed upload URL");
        }

        return {
          path: data.path,
          signed_url: data.signedUrl,
          token: data.token,
          file_name: file.fileName,
          mime_type: file.mimeType,
          size_bytes: file.sizeBytes,
        };
      }),
    );

    return NextResponse.json({ success: true, uploads });
  } catch (error) {
    if (error instanceof Error && error.message === "UNSUPPORTED_FILE_TYPE") {
      return NextResponse.json(
        { error: "Format non pris en charge. Utilisez PDF, JPG, PNG ou WebP." },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "INVALID_FILE_SIZE") {
      return NextResponse.json(
        { error: "Chaque fichier doit faire moins de 10 Mo." },
        { status: 400 },
      );
    }

    console.error(
      "POST /api/admin/ownership-verifications/[id]/documents/upload-url:",
      error,
    );
    return NextResponse.json(
      { error: "Impossible de préparer le téléversement." },
      { status: 500 },
    );
  }
}
