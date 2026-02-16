import { createClient } from "@supabase/supabase-js";

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
    hasCompletedOnboarding?: boolean;
    hasCompletedWebOnboarding?: boolean;
    onboardingData?: OnboardingData;
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
    serviceAreas?: string[];
    portfolioSize?: number;
  };
  unsafe_metadata?: {
    userType?: string;
    companyName?: string;
    facebookUrl?: string;
    professionalLink?: string;
  };
}

/**
 * Create or sync a user in Supabase from Clerk data
 */
export async function createUserInSupabase(data: ClerkUserData) {
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
    
    // Additional onboarding data
    const onboardingData = public_metadata?.onboardingData || {};
    const onboardingPhone = onboardingData.phone || private_metadata?.phone;
    const finalPhone = phone || onboardingPhone;

    // Extract type-specific fields for columns
    const whatsapp = onboardingData.whatsapp || private_metadata?.whatsappNumber;
    const preferredCity = onboardingData.location || onboardingData.propertyCity;
    const budgetMax = onboardingData.budget;
    const serviceAreas = onboardingData.serviceAreas;
    const portfolioSize = onboardingData.portfolioSize;
    const referralSource = onboardingData.referralSource;

    // 1. Try to find by clerk_id
    let { data: existingUser } = await supabase
      .from("users")
      .select("id, clerk_id, email")
      .eq("clerk_id", clerkId)
      .maybeSingle();

    // 2. If not found, try to find by email
    if (!existingUser) {
      const { data: userByEmail } = await supabase
        .from("users")
        .select("id, clerk_id, email")
        .eq("email", email)
        .maybeSingle();
      
      if (userByEmail) {
        existingUser = userByEmail;
      }
    }

    const userData = {
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
export async function updateUserInSupabase(data: ClerkUserData) {
  return createUserInSupabase(data);
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
