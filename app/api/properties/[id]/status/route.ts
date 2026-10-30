import { NextRequest, NextResponse } from "next/server";
import { captureServerEvent } from "@/lib/posthog-server";
import { notifyRentersOfNewMatchingProperty } from "@/lib/matching-property-notifications";
import { notifyUserWithTemplate } from "@/lib/push-notifications";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getStaffOrFounder, userCan } from "@/lib/api-auth";
import { translatePropertyIfNeeded } from "@/lib/property-translations";
import { soldTransition } from "@/lib/property-status";
import { checkListingQuality, listingQualityError } from "@/lib/listing-quality";
import { saleGoLiveDecision, type SaleCheck } from "@/lib/sale-go-live";
import { isDirectorOrFounder, levelFor, titleFromStaffLevel } from "@/lib/team-tasks/core";

/** Directeur or Fondateur: the account type for the founder, the staff level otherwise. */
function canDecideSale(user: { user_type: string | null; staff_level?: string | null }) {
  return isDirectorOrFounder(levelFor(user.user_type, titleFromStaffLevel(user.staff_level)));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getStaffOrFounder(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: propertyId } = await params;

    const body = await request.json();
    const { status, soldAt, soldPrice } = body as {
      status?: unknown;
      soldAt?: unknown;
      soldPrice?: unknown;
    };

    if (!status || typeof status !== "string") {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Putting a listing online is for founder, director and assistant.
    if (status === "en_ligne" && !userCan(user, "listings.publish")) {
      return NextResponse.json(
        { error: "Forbidden", code: "insufficient_staff_level" },
        { status: 403 },
      );
    }

    const updateData: Record<string, string | number | boolean | null> = { status };

    const { data: existingProperty, error: propertyError } = await supabaseAdmin
      .from("properties")
      .select(
        "agent_id, is_boosted, status, is_test, listing_type, property_type, ownership_verification_status, description",
      )
      .eq("id", propertyId)
      .maybeSingle();

    if (propertyError) {
      console.error("Error fetching property before status update:", propertyError);
      return NextResponse.json({ error: "Property fetch failed" }, { status: 500 });
    }

    if (!existingProperty) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    // « Vendu »: Directeur or Fondateur only, sale listings only, with the
    // notary signature date. Leaving vendu clears the sold fields.
    if (status === "vendu" || existingProperty.status === "vendu") {
      const sold = soldTransition({
        next: status,
        current: existingProperty.status,
        listingType: existingProperty.listing_type,
        isTest: existingProperty.is_test,
        canDecideSale: canDecideSale(user),
        soldAt,
        soldPrice,
        todayKey: new Date().toISOString().slice(0, 10),
        actorId: user.id,
      });
      if (!sold.ok) {
        return NextResponse.json(
          { code: sold.code, error: sold.error },
          { status: sold.status },
        );
      }
      Object.assign(updateData, sold.fields);
    }

    const isGoingLive = status === "en_ligne";

    // Quality minimum (lib/listing-quality.ts): a listing goes live only with
    // a real description and enough photos. Test listings are exempt.
    if (
      isGoingLive &&
      existingProperty.status !== "en_ligne" &&
      !existingProperty.is_test
    ) {
      const { count: photoCount, error: photoCountError } = await supabaseAdmin
        .from("property_images")
        .select("id", { count: "exact", head: true })
        .eq("property_id", propertyId);
      if (photoCountError) {
        console.error("Error counting photos before publishing:", photoCountError);
        return NextResponse.json({ error: "Photo count failed" }, { status: 500 });
      }
      const qualityError = listingQualityError(
        checkListingQuality({
          description: existingProperty.description,
          photoCount: photoCount ?? 0,
        }),
      );
      if (qualityError) {
        return NextResponse.json(
          { code: "listing_quality_minimum", error: qualityError },
          { status: 409 },
        );
      }
    }

    // Sale checks (lib/sale-go-live.ts): owner account linked, ownership
    // documents approved, signed mandate. Directeur and Fondateur may skip
    // them (Salif, 2026-10-30); refused documents block everyone. Every skip
    // is recorded below with who did it and what was skipped.
    const isSaleGoingLive =
      isGoingLive && existingProperty.listing_type === "vendre";
    let skippedSaleChecks: SaleCheck[] = [];
    if (isSaleGoingLive) {
      // limit(1): a re-signed mandate leaves two signed rows, which is fine.
      const { data: signedMandates, error: mandateError } = await supabaseAdmin
        .from("property_mandates")
        .select("id")
        .eq("property_id", propertyId)
        .eq("status", "signed")
        .limit(1);
      if (mandateError) {
        console.error("Error fetching mandate before publishing:", mandateError);
        return NextResponse.json({ error: "Mandate check failed" }, { status: 500 });
      }
      const decision = saleGoLiveDecision({
        agentId: existingProperty.agent_id,
        ownershipStatus: existingProperty.ownership_verification_status,
        hasSignedMandate: Boolean(signedMandates?.length),
        canSkipChecks: userCan(user, "listings.publishWithoutSaleChecks"),
      });
      if (!decision.ok) {
        return NextResponse.json(
          { code: decision.code, error: decision.error },
          { status: 409 },
        );
      }
      skippedSaleChecks = decision.skipped;
    }

    // Bookability gate: a live hotel must have at least one active room type,
    // mirroring the guard that blocks deleting the last one. Without this, an
    // approved hotel would advertise a price with zero bookable inventory.
    if (isGoingLive && existingProperty.property_type === "hotel") {
      const { count: activeRoomTypes, error: roomTypesError } =
        await supabaseAdmin
          .from("room_types")
          .select("id", { count: "exact", head: true })
          .eq("property_id", propertyId)
          .eq("is_active", true);
      if (roomTypesError) {
        console.error("Error counting room types before publish:", roomTypesError);
        return NextResponse.json(
          { error: "Room types check failed" },
          { status: 500 },
        );
      }
      if ((activeRoomTypes ?? 0) === 0) {
        return NextResponse.json(
          {
            code: "hotel_room_type_required",
            error:
              "Un hôtel doit avoir au moins un type de chambre avant la mise en ligne.",
          },
          { status: 409 },
        );
      }
    }

    const wasAlreadyLive = existingProperty?.status === "en_ligne";

    // Post-approval logic: set published_at and refresh boost expiration
    if (status === "en_ligne") {
      updateData.published_at = new Date().toISOString();

      if (existingProperty?.is_boosted) {
        const boostExpiresAt = new Date();
        boostExpiresAt.setDate(boostExpiresAt.getDate() + 7);
        updateData.boost_expires_at = boostExpiresAt.toISOString();
      }
    }

    let updateQuery = supabaseAdmin
      .from("properties")
      .update(updateData)
      .eq("id", propertyId);

    if (isGoingLive) {
      updateQuery = updateQuery.neq("status", "en_ligne");
    }
    // Documents refused between the checks above and this write still win.
    if (isSaleGoingLive) {
      updateQuery = updateQuery.neq("ownership_verification_status", "rejected");
    }

    const { data: updatedRows, error } = await updateQuery.select("id");
    const didTransition = !error && (!isGoingLive || Boolean(updatedRows?.length));

    // The « not rejected » guard stopped the write: documents were refused
    // while this publish was on its way. Say so instead of a silent success.
    if (!error && isSaleGoingLive && !didTransition && !wasAlreadyLive) {
      return NextResponse.json(
        {
          code: "sale_ownership_rejected",
          error:
            "Les documents de propriété viennent d'être refusés. La vente ne peut pas être mise en ligne.",
        },
        { status: 409 },
      );
    }

    if (!error && didTransition) {
      await captureServerEvent(user.clerk_id || user.id, "property_listing_published", {
        property_id: propertyId,
        status_change: `to_${status}`,
        actor_type: user.user_type,
        is_boost_refresh: isGoingLive,
      });
    }

    if (!error && didTransition && skippedSaleChecks.length > 0) {
      console.info("Sale published without sale checks", {
        propertyId,
        actorId: user.id,
        skipped: skippedSaleChecks,
      });
      // Lasting record on the listing (migration 108). Best effort: the sale is
      // already online, so a failure here is logged, not returned.
      const { error: recordError } = await supabaseAdmin
        .from("properties")
        .update({
          sale_checks_skipped: skippedSaleChecks,
          sale_checks_skipped_by: user.id,
          sale_checks_skipped_at: new Date().toISOString(),
        })
        .eq("id", propertyId);
      if (recordError) {
        console.error("Recording the skipped sale checks failed:", recordError.code);
      }
      await captureServerEvent(user.clerk_id || user.id, "sale_published_without_checks", {
        property_id: propertyId,
        actor_id: user.id,
        actor_staff_level: user.staff_level ?? null,
        skipped_checks: skippedSaleChecks,
      });
    }

    if (error) {
      console.error("Error updating property status:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (
      isGoingLive &&
      !wasAlreadyLive &&
      didTransition &&
      existingProperty.is_test !== true
    ) {
      await translatePropertyIfNeeded(propertyId).catch((translationError) => {
        console.error("Property translation on approval failed:", translationError);
      });
    }

    if (isGoingLive && !wasAlreadyLive && didTransition && existingProperty?.agent_id) {
      await notifyUserWithTemplate(
        existingProperty.agent_id,
        "payments",
        "payments.listingPublished",
        undefined,
        {
          type: "listing_published",
          propertyId,
        },
      ).catch((notifyError) => {
        console.error("Owner listing published notification failed:", notifyError);
      });
    }

    if (isGoingLive && !wasAlreadyLive && didTransition) {
      await notifyRentersOfNewMatchingProperty(propertyId).catch((notifyError) => {
        console.error("New matching property notification failed:", notifyError);
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
