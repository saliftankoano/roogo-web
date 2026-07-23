import { NextRequest, NextResponse } from "next/server";
import { captureServerEvent } from "@/lib/posthog-server";
import { notifyRentersOfNewMatchingProperty } from "@/lib/matching-property-notifications";
import { notifyUserWithTemplate } from "@/lib/push-notifications";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getStaffOrFounder } from "@/lib/api-auth";
import { translatePropertyIfNeeded } from "@/lib/property-translations";

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
    const { status } = body;

    if (!status) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const updateData: Record<string, string | boolean | null> = { status };

    const { data: existingProperty, error: propertyError } = await supabaseAdmin
      .from("properties")
      .select(
        "agent_id, is_boosted, status, is_test, listing_type, property_type, ownership_verification_status",
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

    const isGoingLive = status === "en_ligne";

    // Compliance gate: a sale listing cannot go live until its ownership documents
    // have been staff-approved. This is the core anti-scam guarantee.
    if (
      isGoingLive &&
      existingProperty.listing_type === "vendre" &&
      existingProperty.ownership_verification_status !== "approved"
    ) {
      return NextResponse.json(
        {
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
