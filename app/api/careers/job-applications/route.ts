import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchPropertyById } from "@/lib/data";
import {
  APPLICATIONS_CLOSED_MESSAGE,
  DUPLICATE_APPLICATION_MESSAGE,
  buildApplicationSchema,
  firstIssueMessage,
  getJobRole,
  isApplicationOpen,
  isDuplicateApplicationError,
} from "@/lib/job-applications";
import {
  storageObjectExists,
  toVideoTestListing,
} from "@/lib/job-applications-server";
import {
  checkRateLimit,
  jobApplicationIpLimiter,
  jobApplicationPhoneLimiter,
  requestIp,
} from "@/lib/rate-limit";

// Public: submit one application (/carrieres/<slug>). Order of checks:
// honeypot, role and deadline, rate limit per IP, validation, rate limit per
// phone, duplicate (one per phone and role), files really uploaded, listing
// shown is a sale listing, insert. Never logs the candidate's details.
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ success: false, error: "Données invalides." }, { status: 400 });
    }

    // Honeypot: a hidden field people never fill. Answer like a success so
    // bots do not learn anything.
    if (typeof body.website === "string" && body.website.trim() !== "") {
      return NextResponse.json({ success: true });
    }

    const role = getJobRole(typeof body.role === "string" ? body.role : null);
    if (!role) {
      return NextResponse.json({ success: false, error: "Offre introuvable." }, { status: 404 });
    }
    if (!isApplicationOpen(role)) {
      return NextResponse.json(
        { success: false, error: `${APPLICATIONS_CLOSED_MESSAGE} Merci de ton intérêt pour Roogo.`, closed: true },
        { status: 410 },
      );
    }

    const ipLimit = await checkRateLimit(jobApplicationIpLimiter, requestIp(req));
    if (!ipLimit.success) {
      return NextResponse.json(
        { success: false, error: "Trop de tentatives depuis cette connexion. Réessaie dans une heure." },
        { status: 429, headers: ipLimit.headers },
      );
    }

    const parsed = buildApplicationSchema(role).safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: firstIssueMessage(parsed.error), field: parsed.error.issues[0]?.path.join(".") },
        { status: 400 },
      );
    }
    const input = parsed.data;

    const phoneLimit = await checkRateLimit(jobApplicationPhoneLimiter, `${role.slug}:${input.phone}`);
    if (!phoneLimit.success) {
      return NextResponse.json(
        { success: false, error: "Trop de tentatives avec ce numéro. Réessaie demain." },
        { status: 429, headers: phoneLimit.headers },
      );
    }

    // A GET, not a HEAD count: supabase-js reports no error on a HEAD
    // against a missing table, which would hide a missing migration.
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("job_applications")
      .select("id")
      .eq("role_slug", role.slug)
      .eq("phone", input.phone)
      .limit(1);
    if (existingError) throw new Error(`duplicate check failed: ${existingError.code} ${existingError.message}`);
    if ((existing ?? []).length > 0) {
      return NextResponse.json({ success: false, error: DUPLICATE_APPLICATION_MESSAGE, duplicate: true }, { status: 409 });
    }

    const [cvOk, videoOk] = await Promise.all([
      storageObjectExists(input.cvPath),
      input.videoPath ? storageObjectExists(input.videoPath) : Promise.resolve(true),
    ]);
    if (!cvOk) {
      return NextResponse.json(
        { success: false, error: "Ton CV n'est pas arrivé jusqu'à nous. Envoie-le à nouveau à l'étape 1.", field: "cvPath" },
        { status: 400 },
      );
    }
    if (!videoOk) {
      return NextResponse.json(
        { success: false, error: "Ta vidéo n'est pas arrivée jusqu'à nous. Envoie-la à nouveau ou colle un lien.", field: "videoPath" },
        { status: 400 },
      );
    }

    const listing = input.listingId ? await fetchPropertyById(input.listingId) : null;
    if (input.listingId && (!listing || listing.listingType !== "vendre")) {
      return NextResponse.json(
        { success: false, error: "Le bien de la vidéo n'est plus disponible. Recharge la page.", field: "listingId" },
        { status: 400 },
      );
    }

    const { error: insertError } = await supabaseAdmin.from("job_applications").insert({
      role_slug: role.slug,
      full_name: input.fullName,
      phone: input.phone,
      quartier: input.quartier,
      email: input.email,
      cv_path: input.cvPath,
      sales: input.sales,
      reference: input.reference,
      video_path: input.videoPath || null,
      video_url: input.videoPath ? null : input.videoUrl || null,
      listing_id: listing?.id ?? null,
      listing_snapshot: listing ? toVideoTestListing(listing) : null,
      answers: input.answers,
      can_start_on_date: input.canStartOnDate,
      available_from: input.canStartOnDate ? null : input.availableFrom,
      consent_at: new Date().toISOString(),
    });

    if (insertError) {
      if (isDuplicateApplicationError(insertError)) {
        return NextResponse.json({ success: false, error: DUPLICATE_APPLICATION_MESSAGE, duplicate: true }, { status: 409 });
      }
      throw new Error(`insert failed: ${insertError.code} ${insertError.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/careers/job-applications:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "Ta candidature n'a pas pu être enregistrée. Réessaie dans un instant." },
      { status: 500 },
    );
  }
}
