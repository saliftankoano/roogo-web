import { NextResponse } from "next/server";
import { requireStaffSupabaseUser } from "@/lib/identity-verifications";
import {
  type OwnershipDocument,
  OWNERSHIP_DOCUMENT_EXTENSIONS,
  OWNERSHIP_DOCUMENT_MAX_BYTES,
  OWNERSHIP_DOCUMENT_MAX_FILES_PER_SUBMISSION,
  OWNERSHIP_DOCUMENT_MAX_FILES_PER_UPLOAD,
  withSignedOwnershipDocUrls,
} from "@/lib/property-ownership";
import { supabaseAdmin } from "@/lib/supabase-admin";

type DocumentInput = {
  label?: unknown;
  storage_path?: unknown;
  file_name?: unknown;
  mime_type?: unknown;
  size_bytes?: unknown;
};

function safeText(value: unknown, fallback: string, maxLength = 180) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().replace(/[\\/\u0000-\u001f]/g, "-");
  return normalized.slice(0, maxLength) || fallback;
}

function labelFromFileName(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "").trim();
  return withoutExtension || "Document";
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
      documents?: DocumentInput[];
    } | null;
    const rawDocuments = Array.isArray(body?.documents) ? body.documents : [];

    if (
      rawDocuments.length < 1 ||
      rawDocuments.length > OWNERSHIP_DOCUMENT_MAX_FILES_PER_UPLOAD
    ) {
      return NextResponse.json(
        { error: "Sélectionnez entre 1 et 10 fichiers." },
        { status: 400 },
      );
    }

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

    const staffPrefix = `${submission.user_id}/${submission.property_id}/staff/${authResult.supabaseUser.id}/`;
    const documents: OwnershipDocument[] = rawDocuments.map((document) => {
      const storagePath =
        typeof document.storage_path === "string" ? document.storage_path : "";
      const mimeType =
        typeof document.mime_type === "string"
          ? document.mime_type.toLowerCase()
          : "";
      const sizeBytes =
        typeof document.size_bytes === "number"
          ? Math.floor(document.size_bytes)
          : 0;

      if (!storagePath.startsWith(staffPrefix)) {
        throw new Error("INVALID_STORAGE_PATH");
      }
      if (!OWNERSHIP_DOCUMENT_EXTENSIONS[mimeType]) {
        throw new Error("UNSUPPORTED_FILE_TYPE");
      }
      if (sizeBytes < 1 || sizeBytes > OWNERSHIP_DOCUMENT_MAX_BYTES) {
        throw new Error("INVALID_FILE_SIZE");
      }

      const fileName = safeText(document.file_name, "Document");
      return {
        label: safeText(document.label, labelFromFileName(fileName), 120),
        storage_path: storagePath,
        file_name: fileName,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        source: "staff",
        uploaded_by: authResult.supabaseUser.id,
      };
    });

    const existingDocuments = Array.isArray(submission.documents)
      ? (submission.documents as OwnershipDocument[])
      : [];
    if (
      existingDocuments.length + documents.length >
      OWNERSHIP_DOCUMENT_MAX_FILES_PER_SUBMISSION
    ) {
      return NextResponse.json(
        { error: "Une soumission ne peut pas contenir plus de 20 fichiers." },
        { status: 400 },
      );
    }

    const existingPaths = new Set(existingDocuments.map((doc) => doc.storage_path));
    const uniqueDocuments = documents.filter(
      (document) => !existingPaths.has(document.storage_path),
    );
    const nextDocuments = [...existingDocuments, ...uniqueDocuments];

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("property_ownership_submissions")
      .update({ documents: nextDocuments })
      .eq("id", id)
      .eq("status", "pending")
      .select("documents")
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updated) {
      return NextResponse.json(
        { error: "La soumission a déjà été traitée." },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      documents: await withSignedOwnershipDocUrls(
        (updated.documents as OwnershipDocument[]) ?? [],
      ),
    });
  } catch (error) {
    const validationErrors: Record<string, string> = {
      INVALID_STORAGE_PATH: "Chemin de fichier invalide.",
      UNSUPPORTED_FILE_TYPE:
        "Format non pris en charge. Utilisez PDF, JPG, PNG ou WebP.",
      INVALID_FILE_SIZE: "Chaque fichier doit faire moins de 10 Mo.",
    };
    if (error instanceof Error && validationErrors[error.message]) {
      return NextResponse.json(
        { error: validationErrors[error.message] },
        { status: 400 },
      );
    }

    console.error(
      "POST /api/admin/ownership-verifications/[id]/documents:",
      error,
    );
    return NextResponse.json(
      { error: "Impossible d'ajouter les fichiers à la soumission." },
      { status: 500 },
    );
  }
}
