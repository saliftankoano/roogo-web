import { NextRequest, NextResponse } from "next/server";
import {
  processPropertyStorageCleanupQueue,
  purgePropertyListingAssets,
} from "@/lib/property-storage";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeKuulaVirtualTourUrl } from "@/lib/virtual-tour";
import {
  getAuthenticatedUser,
  isOwnerAgentStaffOrFounder,
  isStaffOrFounder,
} from "@/lib/api-auth";
import {
  buildStalePropertyTranslationUpdate,
  getPropertyTranslationSourceHash,
} from "@/lib/property-translations";

interface PropertyPatchUpdates {
  description?: string;
  price?: string | number;
  address?: string;
  city?: string;
  quartier?: string;
  bedrooms?: number;
  bathrooms?: number;
  area?: string | number;
  parking?: number;
  propertyType?: string;
  period?: string;
  amenities?: string[];
  virtualTourUrl?: string | null;
}

interface AmenityRow {
  id: string;
  name: string;
}

interface PropertySourceTextRow {
  description: string | null;
  dos_and_donts: string[] | null;
  translation_source_locale: string | null;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: propertyId } = await params;

    const isAdmin = isStaffOrFounder(user);

    if (!isOwnerAgentStaffOrFounder(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // For owners/agents, verify they own this property before doing anything
    if (!isAdmin) {
      const { data: prop } = await supabaseAdmin
        .from("properties")
        .select("id")
        .eq("id", propertyId)
        .eq("agent_id", user.id)
        .maybeSingle();

      if (!prop) {
        return NextResponse.json(
          { error: "Not found or not authorized" },
          { status: 404 },
        );
      }
    }

    const preDeleteCleanup = await purgePropertyListingAssets(propertyId);

    if (preDeleteCleanup.errors.length > 0) {
      console.warn(
        "Property storage cleanup before delete had errors:",
        preDeleteCleanup.errors,
      );
    }

    // --- Delete DB row (cascades to all related tables via migration 010) ---
    const { data: deletedRows, error } = await supabaseAdmin
      .from("properties")
      .delete()
      .eq("id", propertyId)
      .select("id");

    if (error) {
      console.error("Error deleting property:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!deletedRows || deletedRows.length === 0) {
      return NextResponse.json(
        { error: "Not found or not authorized" },
        { status: 404 },
      );
    }

    const queuedCleanup = await processPropertyStorageCleanupQueue({
      propertyId,
      limit: 10,
    });

    if (queuedCleanup.failedCount > 0) {
      console.warn("Queued property storage cleanup still pending:", {
        propertyId,
        failedCount: queuedCleanup.failedCount,
      });
    }

    return NextResponse.json({
      success: true,
      storageCleanup: {
        deletedPathCount:
          preDeleteCleanup.deletedPathCount + queuedCleanup.deletedPathCount,
        pendingFailures: queuedCleanup.failedCount,
      },
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: propertyId } = await params;
    const updates = (await request.json()) as PropertyPatchUpdates;

    // Verify user has required privileges
    if (!isStaffOrFounder(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let existingSourceText: PropertySourceTextRow | null = null;
    if (updates.description !== undefined) {
      const { data, error } = await supabaseAdmin
        .from("properties")
        .select("description, dos_and_donts, translation_source_locale")
        .eq("id", propertyId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching property before edit:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (!data) {
        return NextResponse.json({ error: "Property not found" }, { status: 404 });
      }

      existingSourceText = data as PropertySourceTextRow;
    }

    // Map frontend fields to database columns if necessary
    const dbUpdates: Record<string, unknown> = {};
    if (updates.description !== undefined)
      dbUpdates.description = updates.description;
    if (updates.price !== undefined) dbUpdates.price = Number(updates.price);
    if (updates.address !== undefined) dbUpdates.address = updates.address;
    if (updates.city !== undefined) dbUpdates.city = updates.city;
    if (updates.quartier !== undefined) dbUpdates.quartier = updates.quartier;
    if (updates.bedrooms !== undefined) dbUpdates.bedrooms = updates.bedrooms;
    if (updates.bathrooms !== undefined)
      dbUpdates.bathrooms = updates.bathrooms;
    if (updates.area !== undefined) dbUpdates.area = Number(updates.area);
    if (updates.parking !== undefined)
      dbUpdates.parking_spaces = updates.parking;
    if (updates.propertyType !== undefined)
      dbUpdates.property_type = updates.propertyType;
    if (updates.period !== undefined)
      dbUpdates.period = updates.period === "Mois" ? "month" : updates.period;
    if (updates.virtualTourUrl !== undefined) {
      try {
        dbUpdates.virtual_tour_url = normalizeKuulaVirtualTourUrl(
          updates.virtualTourUrl,
        );
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Lien de visite virtuelle invalide",
          },
          { status: 400 },
        );
      }
    }

    if (existingSourceText && updates.description !== undefined) {
      const previousSourceHash = getPropertyTranslationSourceHash({
        sourceLocale: existingSourceText.translation_source_locale,
        description: existingSourceText.description,
        dosAndDonts: Array.isArray(existingSourceText.dos_and_donts)
          ? existingSourceText.dos_and_donts
          : [],
      });
      const nextSourceHash = getPropertyTranslationSourceHash({
        sourceLocale: existingSourceText.translation_source_locale,
        description: updates.description,
        dosAndDonts: Array.isArray(existingSourceText.dos_and_donts)
          ? existingSourceText.dos_and_donts
          : [],
      });

      if (previousSourceHash !== nextSourceHash) {
        Object.assign(dbUpdates, buildStalePropertyTranslationUpdate());
      }
    }

    const { error } = await supabaseAdmin
      .from("properties")
      .update(dbUpdates)
      .eq("id", propertyId);

    if (error) {
      console.error("Error updating property:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Handle amenities separately if provided
    if (updates.amenities !== undefined && Array.isArray(updates.amenities)) {
      // 1. Delete existing amenities
      await supabaseAdmin
        .from("property_amenities")
        .delete()
        .eq("property_id", propertyId);

      // 2. Add new amenities
      if (updates.amenities.length > 0) {
        const { data: amenitiesData } = await supabaseAdmin
          .from("amenities")
          .select("id, name")
          .in("name", updates.amenities);

        if (amenitiesData && amenitiesData.length > 0) {
          const propertyAmenities = amenitiesData.map(
            (amenity: AmenityRow) => ({
              property_id: propertyId,
              amenity_id: amenity.id,
            }),
          );

          await supabaseAdmin
            .from("property_amenities")
            .insert(propertyAmenities);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
