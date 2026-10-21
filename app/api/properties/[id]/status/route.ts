import { NextRequest, NextResponse } from "next/server";
import { captureServerEvent } from "@/lib/posthog-server";
import { notifyRentersOfNewMatchingProperty } from "@/lib/matching-property-notifications";
import { notifyUserWithTemplate } from "@/lib/push-notifications";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getStaffOrFounder, userCan } from "@/lib/api-auth";
import { translatePropertyIfNeeded } from "@/lib/property-translations";
import { soldTransition } from "@/lib/property-status";
import { checkListingQuality, listingQualityError } from "@/lib/listing-quality";
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

    if (
      isGoingLive &&
      existingProperty.listing_type === "vendre" &&
      !existingProperty.agent_id
    ) {
      return NextResponse.json(
        {
          code: "sale_owner_link_required",
          error:
            "Rattachez d'abord l'annonce au compte du propriétaire avant la mise en ligne.",
        },
        { status: 409 },
      );
    }

    // Compliance gate: a sale listing cannot go live until its ownership documents
    // have been staff-approved. This is the core anti-scam guarantee.
    if (
      isGoingLive &&
      existingProperty.listing_type === "vendre" &&
      existingProperty.ownership_verification_status !== "approved"
    ) {
      return NextResponse.json(
        {
          code: "sale_ownership_verification_required",
          error:
            "Les documents de propriété doivent être vérifiés avant la mise en ligne.",
        },
        { status: 409 },
      );
    }

    // Mandate gate: a sale listing also needs a signed mandate (the owner agreed to
    // Roogo's sale price + exclusivity) before it can go live.
    if (isGoingLive && existingProperty.listing_type === "vendre") {
      const { data: signedMandate } = await supabaseAdmin
        .from("property_mandates")
        .select("id")
        .eq("property_id", propertyId)
        .eq("status", "signed")
        .maybeSingle();
      if (!signedMandate) {
        return NextResponse.json(
          {
            code: "sale_mandate_required",
            error:
              "Le mandat de vente doit être signé par le propriétaire avant la mise en ligne.",
          },
          { status: 409 },
        );
      }
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

    const { data: updatedRows, error } = await updateQuery.select("id");
    const didTransition = !error && (!isGoingLive || Boolean(updatedRows?.length));

    if (!error && didTransition) {
      await captureServerEvent(user.clerk_id || user.id, "property_listing_published", {
        property_id: propertyId,
        status_change: `to_${status}`,
        actor_type: user.user_type,
        is_boost_refresh: isGoingLive,
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
