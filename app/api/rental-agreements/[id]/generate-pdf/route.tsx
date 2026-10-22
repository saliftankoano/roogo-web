import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getUserByClerkId } from "@/lib/user-sync";
import { convertIdsToLabels } from "@/lib/interdictions";
import { getCityLabel } from "@/lib/property-url";
import { pdf, type DocumentProps } from "@react-pdf/renderer";
import { OfficialLeasePdf } from "@/lib/rental-agreement-pdf/official-lease";
import { DailyAgreementPdf } from "@/lib/rental-agreement-pdf/daily-agreement";
import { formatLeaseDate } from "@/lib/rental-agreement-pdf/official-lease-fields";
import {
  SIGNATURE_BUCKET,
  parseSignaturePng,
} from "@/lib/rental-agreement-pdf/signature-image";
import type {
  AgreementPdfData,
  AgreementPdfProperty,
  AgreementPdfSignatureImage,
} from "@/lib/rental-agreement-pdf/types";
import fs from "fs";
import path from "path";
import React from "react";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

type RawProperty = Omit<AgreementPdfProperty, "amenities"> & { id?: string };

/** Supabase embeds the FK as `properties`; mobile uses `property`. Normalize here. */
function normalizeAgreementForPdf(
  raw: Record<string, unknown>,
  amenities: string[],
): AgreementPdfData {
  const prop =
    (raw.property as RawProperty | undefined) ??
    (raw.properties as RawProperty | undefined);
  const interdictionIds = Array.isArray(raw.interdictions)
    ? (raw.interdictions as string[])
    : [];
  return {
    ...(raw as unknown as AgreementPdfData),
    property: prop
      ? {
          ...prop,
          // properties.city stores the picker id ("ouaga"); print the name.
          city: prop.city ? getCityLabel(prop.city) : null,
          amenities,
        }
      : null,
    dos_and_donts: Array.isArray(raw.dos_and_donts)
      ? (raw.dos_and_donts as string[])
      : [],
    interdictions: convertIdsToLabels(interdictionIds) ?? [],
  };
}

/**
 * Downloads a drawn signature from the private bucket. Non-fatal: without it
 * the PDF keeps the text-only signature block.
 */
async function loadSignatureImage(
  path: unknown,
): Promise<AgreementPdfSignatureImage | null> {
  if (typeof path !== "string" || !path) return null;
  const { data, error } = await supabaseAdmin.storage
    .from(SIGNATURE_BUCKET)
    .download(path);
  if (error || !data) {
    console.error("Agreement PDF: signature download failed:", {
      path,
      message: error?.message,
    });
    return null;
  }
  const bytes = Buffer.from(await data.arrayBuffer());
  const parsed = parseSignaturePng(bytes.toString("base64"));
  if (!parsed.ok) {
    console.error("Agreement PDF: stored signature rejected:", {
      path,
      reason: parsed.error,
    });
    return null;
  }
  return {
    dataUri: `data:image/png;base64,${bytes.toString("base64")}`,
    width: parsed.width,
    height: parsed.height,
  };
}

async function loadAmenityNames(propertyId: string | undefined) {
  if (!propertyId) return [];
  const { data, error } = await supabaseAdmin
    .from("property_amenities")
    .select("amenities(name)")
    .eq("property_id", propertyId);
  if (error) {
    // Non-fatal: the lease then leaves "Autres équipements" to fill by hand.
    console.error("Agreement PDF: amenities lookup failed:", error.message);
    return [];
  }
  return (
    data
      ?.map((row) => {
        const joined = row.amenities as
          { name?: unknown } | { name?: unknown }[] | null;
        return Array.isArray(joined) ? joined[0]?.name : joined?.name;
      })
      .filter((name): name is string => typeof name === "string") ?? []
  );
}

// ─── Route handler ────────────────────────────────────────────────────────────

/**
 * POST /api/rental-agreements/:id/generate-pdf
 * Generates a PDF for a rental agreement, uploads it to Supabase Storage,
 * persists the URL on the agreement record, and returns { pdfUrl }.
 * Accessible by either the owner or the renter of the agreement.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: agreementId } = await params;

    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return errorResponse("Unauthorized", 401, req);

    let clerkUserId: string;
    try {
      const { sub } = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
      clerkUserId = sub;
    } catch {
      return errorResponse("Invalid token", 401, req);
    }

    const user = await getUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);

    // ── Fetch agreement with all joined data ──────────────────────────────
    const { data: agreement, error } = await supabaseAdmin
      .from("rental_agreements")
      .select(
        `
        *,
        property_frequence,
        properties(id, address, price, quartier, city, property_type, area, bedrooms, bathrooms),
        owner:users!rental_agreements_owner_id_fkey(id, full_name, phone, email),
        renter:users!rental_agreements_renter_id_fkey(id, full_name, phone, email)
      `,
      )
      .eq("id", agreementId)
      .single();

    if (error || !agreement) {
      return errorResponse("Agreement not found", 404, req);
    }

    // ── Access control: owner or renter only ──────────────────────────────
    if (agreement.owner_id !== user.id && agreement.renter_id !== user.id) {
      return errorResponse("Forbidden", 403, req);
    }

    let paymentMetadata: Record<string, unknown> | null = null;
    if (agreement.transaction_id) {
      const { data: transaction } = await supabaseAdmin
        .from("transactions")
        .select("metadata")
        .eq("id", agreement.transaction_id)
        .maybeSingle();
      paymentMetadata =
        (transaction?.metadata as Record<string, unknown> | null) || null;
    }

    // ── Generate PDF buffer ───────────────────────────────────────────────
    const embeddedProperty = (agreement as { properties?: { id?: string } })
      .properties;
    const amenities = await loadAmenityNames(
      embeddedProperty?.id ?? agreement.property_id,
    );
    // Columns from migration 102; undefined before it runs.
    const signaturePaths = agreement as {
      owner_signature_path?: string | null;
      renter_signature_path?: string | null;
    };
    const [ownerSignature, renterSignature] = await Promise.all([
      loadSignatureImage(signaturePaths.owner_signature_path),
      loadSignatureImage(signaturePaths.renter_signature_path),
    ]);
    const pdfData = normalizeAgreementForPdf(
      {
        ...(agreement as unknown as Record<string, unknown>),
        payment_metadata: paymentMetadata,
        owner_signature: ownerSignature,
        renter_signature: renterSignature,
      },
      amenities,
    );
    const logoBase64 = fs
      .readFileSync(path.join(process.cwd(), "public", "logo.png"))
      .toString("base64");
    const logoDataUri = `data:image/png;base64,${logoBase64}`;
    // Monthly leases follow the official Burkina Faso template; daily stays
    // keep the short-stay layout (the template has no nightly terms).
    const element = (
      pdfData.property_frequence === "journalier" ? (
        <DailyAgreementPdf data={pdfData} logoDataUri={logoDataUri} />
      ) : (
        <OfficialLeasePdf
          data={pdfData}
          logoDataUri={logoDataUri}
          generatedOn={formatLeaseDate(new Date().toISOString()) ?? ""}
        />
      )
    ) as React.ReactElement<DocumentProps>;
    const buffer = await pdf(element).toBuffer();

    // ── Upload to Supabase Storage (reuse the existing "listing" bucket) ──
    const fileName = `agreements/${agreementId}.pdf`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("listing")
      .upload(fileName, buffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return errorResponse("Failed to store PDF", 500, req);
    }

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from("listing").getPublicUrl(fileName);

    // ── Persist pdf_url on the agreement row ─────────────────────────────
    await supabaseAdmin
      .from("rental_agreements")
      .update({ pdf_url: publicUrl })
      .eq("id", agreementId);

    return cors(NextResponse.json({ pdfUrl: publicUrl }), req);
  } catch (err) {
    console.error(
      "Error in POST /api/rental-agreements/[id]/generate-pdf:",
      err,
    );
    return errorResponse("Internal server error", 500, req);
  }
}
