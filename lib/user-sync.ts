import { createClient } from "@supabase/supabase-js";
import { createClerkClient } from "@clerk/backend";
import { redis } from "@/lib/rate-limit";

// Initialize Supabase client with environment variables
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "Supabase environment variables not set. Webhook will not work properly."
  );
}

const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null;

type OnboardingData = Record<string, unknown>;

export type SignupGeo = {
  city?: string | null;
  country?: string | null;
  ipAddress?: string | null;
};

function readNullableStringField(
  data: Record<string, unknown>,
  key: string,
): string | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(data, key)) return undefined;
  const value = data[key];
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Fetch the user's earliest Clerk session and return its geoIP snapshot.
 * Returns null if the user has no sessions yet (very fresh signup) or if
 * the activity payload lacks a city.
 */
export async function fetchClerkSignupGeo(
  clerkUserId: string,
): Promise<SignupGeo | null> {
  if (!process.env.CLERK_SECRET_KEY) return null;
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const sessions = await clerk.sessions.getSessionList({
    userId: clerkUserId,
  });
  if (!sessions.data?.length) return null;
  const earliest = [...sessions.data].sort(
    (a, b) => a.createdAt - b.createdAt,
  )[0];
  const activity = earliest?.latestActivity;
  if (!activity?.city && !activity?.country) return null;
  return {
    city: activity.city ?? null,
    country: activity.country ?? null,
    ipAddress: activity.ipAddress ?? null,
  };
}

export interface ClerkUserData {
  id: string;
  email_addresses?: Array<{ email_address: string }>;
  first_name?: string;
  last_name?: string;
  image_url?: string;
  phone_numbers?: Array<{ phone_number: string }>;
  public_metadata?: {
    userType?: string;
    role?: string;
    hasCompletedMobileOnboarding?: boolean;
    hasCompletedOnboarding?: boolean; // legacy — same as hasCompletedMobileOnboarding
    hasCompletedWebOnboarding?: boolean;
    webOnboardingStep?: number;
    signupPlatform?: "web" | "mobile";
    preferredLocale?: "fr" | "en";
    companyName?: string;
    facebookUrl?: string;
    professionalLink?: string;
  };
  private_metadata?: {
    userType?: string;
    sex?: string;
    dateOfBirth?: string;
    companyName?: string;
    facebookUrl?: string;
    professionalLink?: string;
    phone?: string;
    whatsappNumber?: string;
    preferredLocale?: "fr" | "en";
    serviceAreas?: string[];
    portfolioSize?: number;
    mobileOnboardingData?: OnboardingData;
    webOnboardingData?: OnboardingData;
    onboardingData?: OnboardingData; // legacy alias
  };
  unsafe_metadata?: {
    userType?: string;
    companyName?: string;
    facebookUrl?: string;
    professionalLink?: string;
  };
}

/**
 * Create or sync a user in Supabase from Clerk data.
 * Pass `opts.signupGeo` to populate signup_* columns on first creation
 * (or on subsequent syncs when signup_city is still null). Write-once.
 */
export async function createUserInSupabase(
  data: ClerkUserData,
  opts?: { signupGeo?: SignupGeo | null },
) {
  try {
    if (!supabase) {
      throw new Error("Supabase client not initialized.");
    }

    const {
      id: clerkId,
      email_addresses,
      first_name,
      last_name,
      image_url,
      phone_numbers,
      public_metadata,
      private_metadata,
      unsafe_metadata,
    } = data;

    const email = email_addresses?.[0]?.email_address;
    if (!email) throw new Error("No email found for user");
    if (!clerkId) throw new Error("No clerk ID found for user");

    const fullName = [first_name, last_name].filter(Boolean).join(" ") || undefined;
    const phone = phone_numbers?.[0]?.phone_number;
    
    // Get userType from metadata - no mapping needed after migration
    const rawUserType =
      public_metadata?.userType || 
      public_metadata?.role || 
      private_metadata?.userType || 
      unsafe_metadata?.userType || 
      "renter"; // Default to renter
      
    // Valid types: 'owner', 'agent', 'renter', 'staff', 'founder'
    const validUserTypes = ["owner", "agent", "renter", "staff", "founder"];
    let userType = rawUserType.toLowerCase();
    
    // Map legacy 'admin' to 'staff' if it comes from old metadata
    if (userType === "admin") userType = "staff";
    
    const supabaseUserType = validUserTypes.includes(userType) ? userType : "renter";

    const companyName = public_metadata?.companyName || private_metadata?.companyName || unsafe_metadata?.companyName;
    const professionalLink = 
      public_metadata?.professionalLink || 
      public_metadata?.facebookUrl || 
      private_metadata?.professionalLink || 
      private_metadata?.facebookUrl || 
      unsafe_metadata?.professionalLink || 
      unsafe_metadata?.facebookUrl;
    
    // Merge onboarding data: webOnboardingData overrides mobileOnboardingData, legacy onboardingData as fallback
    const preferredLocale =
      private_metadata?.preferredLocale || public_metadata?.preferredLocale || null;
    const onboardingData = {
      ...(private_metadata?.onboardingData ?? {}),
      ...(private_metadata?.mobileOnboardingData ?? {}),
      ...(private_metadata?.webOnboardingData ?? {}),
      ...(preferredLocale ? { preferredLocale } : {}),
    } as OnboardingData;
    const onboardingPhone = readNullableStringField(onboardingData, "phone");
    const finalPhone =
      onboardingPhone ||
      phone ||
      private_metadata?.phone ||
      null;

    // Extract type-specific fields for columns
    const onboardingWhatsapp = readNullableStringField(onboardingData, "whatsapp");
    const whatsapp =
      onboardingWhatsapp !== undefined
        ? onboardingWhatsapp
        : private_metadata?.whatsappNumber || null;
    const preferredCity = onboardingData.location || onboardingData.propertyCity;
    const budgetMax = onboardingData.budget;
    const serviceAreas = onboardingData.serviceAreas;
    const portfolioSize = onboardingData.portfolioSize;
    const referralSource = onboardingData.referralSource;

    // 1. Try to find by clerk_id
    let { data: existingUser } = await supabase
      .from("users")
      .select("id, clerk_id, email, signup_city")
      .eq("clerk_id", clerkId)
      .maybeSingle();

    // 2. If not found, try to find by email
    if (!existingUser) {
      const { data: userByEmail } = await supabase
        .from("users")
        .select("id, clerk_id, email, signup_city")
        .eq("email", email)
        .maybeSingle();

      if (userByEmail) {
        existingUser = userByEmail;
      }
    }

    const userData: Record<string, unknown> = {
      clerk_id: clerkId,
      email,
      full_name: fullName,
      avatar_url: image_url,
      phone: finalPhone,
      user_type: supabaseUserType,
      company_name: companyName,
      professional_link: professionalLink,
      whatsapp,
      preferred_city: preferredCity,
      budget_max: budgetMax,
      service_areas: serviceAreas,
      portfolio_size: portfolioSize,
      referral_source: referralSource,
      preferences: onboardingData, // Store everything in JSONB as well
    };

    // Write-once: only persist signup geo on insert, or on update if not yet set
    const shouldWriteSignupGeo =
      !!opts?.signupGeo?.city &&
      (!existingUser || !existingUser.signup_city);
    if (shouldWriteSignupGeo && opts?.signupGeo) {
      userData.signup_city = opts.signupGeo.city ?? null;
      userData.signup_country = opts.signupGeo.country ?? null;
      userData.signup_ip = opts.signupGeo.ipAddress ?? null;
      userData.signup_captured_at = new Date().toISOString();
    }

    let result;
    if (existingUser) {
      // 3. Update existing user
      const { data: updatedUser, error: updateError } = await supabase
        .from("users")
        .update(userData)
        .eq("id", existingUser.id)
        .select()
        .single();

      if (updateError) throw updateError;
      result = updatedUser;
    } else {
      // 4. Insert new user
      const { data: insertedUser, error: insertError } = await supabase
        .from("users")
        .insert(userData)
        .select()
        .single();

      if (insertError) throw insertError;
      result = insertedUser;
    }

    console.log("✅ User synced to Supabase:", result?.id);

    // Invalidate owners/agents cache when an owner or agent is upserted
    if (result && ["owner", "agent"].includes(result.user_type)) {
      await redis?.del("owners-agents:all");
    }

    return result;
  } catch (error) {
    console.error("❌ Error syncing user to Supabase:", error);
    throw error;
  }
}

/**
 * Find a user in Supabase by their Clerk ID
 */
export async function getUserByClerkId(clerkId: string) {
  try {
    if (!supabase) {
      throw new Error(
        "Supabase client not initialized. Check environment variables."
      );
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("clerk_id", clerkId)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 is "not found" error
      console.error("Error fetching user from Supabase:", error);
      throw error;
    }

    return user;
  } catch (error) {
    console.error("Error in getUserByClerkId:", error);
    throw error;
  }
}

/**
 * Find a user in Supabase by Clerk ID, with email fallback.
 * If not found by clerk_id, fetches from Clerk API and syncs/creates the record.
 * This handles users whose clerk_id was never stored (e.g. founders set up manually).
 */
export async function getOrSyncUserByClerkId(clerkId: string): Promise<ReturnType<typeof getUserByClerkId>> {
  const user = await getUserByClerkId(clerkId);
  if (user) return user;

  // Not found by clerk_id — try fetching from Clerk and syncing
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(clerkId);

    const synced = await createUserInSupabase({
      id: clerkUser.id,
      email_addresses: clerkUser.emailAddresses.map((e) => ({
        email_address: e.emailAddress,
      })),
      first_name: clerkUser.firstName ?? undefined,
      last_name: clerkUser.lastName ?? undefined,
      image_url: clerkUser.imageUrl,
      phone_numbers: clerkUser.phoneNumbers?.map((p) => ({
        phone_number: p.phoneNumber,
      })),
      public_metadata: clerkUser.publicMetadata as ClerkUserData["public_metadata"],
      private_metadata: clerkUser.privateMetadata as ClerkUserData["private_metadata"],
      unsafe_metadata: clerkUser.unsafeMetadata as ClerkUserData["unsafe_metadata"],
    });

    return synced;
  } catch (syncError) {
    console.error("Failed to sync user from Clerk:", syncError);
    return null;
  }
}

/**
 * Get Supabase client for use in API routes
 * This uses the service role key and bypasses RLS
 */
export function getSupabaseClient() {
  if (!supabase) {
    throw new Error(
      "Supabase client not initialized. Check environment variables."
    );
  }
  return supabase;
}

/**
 * Update an existing user in Supabase from Clerk data.
 * Delegates to createUserInSupabase which handles upsert logic.
 */
export async function updateUserInSupabase(
  data: ClerkUserData,
  opts?: { signupGeo?: SignupGeo | null },
) {
  return createUserInSupabase(data, opts);
}

/**
 * Delete a user from Supabase by Clerk ID
 */
export async function deleteUserFromSupabase(clerkId: string) {
  try {
    if (!supabase) {
      throw new Error(
        "Supabase client not initialized. Check environment variables."
      );
    }

    const { error } = await supabase
      .from("users")
      .delete()
      .eq("clerk_id", clerkId);

    if (error) {
      console.error("Error deleting user from Supabase:", error);
      throw error;
    }

    console.log(`User deleted from Supabase: ${clerkId}`);
    return true;
  } catch (error) {
    console.error("Error in deleteUserFromSupabase:", error);
    throw error;
  }
}
