import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import {
  processPropertyStorageCleanupQueue,
  purgePropertyListingAssets,
} from "@/lib/property-storage";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createUserInSupabase, ClerkUserData } from "../../../../lib/user-sync";

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
}

interface AmenityRow {
  id: string;
  name: string;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: propertyId } = await params;

    // Try to find user in Supabase
    const { data: users } = await supabaseAdmin
      .from("users")
      .select("id, user_type, clerk_id")
      .eq("clerk_id", userId)
      .limit(1);

    let user = users?.[0];

    // Auto-sync user from Clerk if not found in Supabase
    if (!user) {
      try {
        const clerkUser = await currentUser();
        if (clerkUser) {
          // Transform Clerk data format to match user-sync expectations
          const transformedData = {
            id: clerkUser.id,
            email_addresses: clerkUser.emailAddresses?.map((e) => ({
              email_address: e.emailAddress,
            })),
            first_name: clerkUser.firstName,
            last_name: clerkUser.lastName,
            image_url: clerkUser.imageUrl,
            phone_numbers: clerkUser.phoneNumbers?.map((p) => ({
              phone_number: p.phoneNumber,
            })),
            public_metadata: clerkUser.publicMetadata,
            private_metadata: clerkUser.privateMetadata,
            unsafe_metadata: clerkUser.unsafeMetadata,
          };

          await createUserInSupabase(transformedData as ClerkUserData);

          // Re-fetch user after sync
          const { data: syncedUsers } = await supabaseAdmin
            .from("users")
            .select("id, user_type, clerk_id")
            .eq("clerk_id", userId)
            .limit(1);

          user = syncedUsers?.[0];
        }
      } catch (syncError) {
        console.error("Failed to auto-sync user:", syncError);
      }
    }

    if (!user) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const isAdmin = ["staff", "founder"].includes(user.user_type);
    const isOwnerOrAgent = ["owner", "agent"].includes(user.user_type);

    if (!isAdmin && !isOwnerOrAgent) {
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
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: propertyId } = await params;
    const updates = (await request.json()) as PropertyPatchUpdates;

    // Try to find user in Supabase
    const { data: users } = await supabaseAdmin
      .from("users")
      .select("user_type, clerk_id")
      .eq("clerk_id", userId)
      .limit(1);

    let user = users?.[0];

    // Auto-sync user from Clerk if not found in Supabase
    if (!user) {
      try {
        const clerkUser = await currentUser();
        if (clerkUser) {
          const transformedData = {
            id: clerkUser.id,
            email_addresses: clerkUser.emailAddresses?.map((e) => ({
              email_address: e.emailAddress,
            })),
            first_name: clerkUser.firstName,
            last_name: clerkUser.lastName,
            image_url: clerkUser.imageUrl,
            phone_numbers: clerkUser.phoneNumbers?.map((p) => ({
              phone_number: p.phoneNumber,
            })),
            public_metadata: clerkUser.publicMetadata,
            private_metadata: clerkUser.privateMetadata,
            unsafe_metadata: clerkUser.unsafeMetadata,
          };

          await createUserInSupabase(transformedData as ClerkUserData);

          const { data: syncedUsers } = await supabaseAdmin
            .from("users")
            .select("user_type, clerk_id")
            .eq("clerk_id", userId)
            .limit(1);

          user = syncedUsers?.[0];
        }
      } catch (syncError) {
        console.error("Failed to auto-sync user:", syncError);
      }
    }

    // Verify user has required privileges
    if (!user || !["staff", "founder"].includes(user.user_type)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Map frontend fields to database columns if necessary
    const dbUpdates: Record<string, string | number | null> = {};
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
