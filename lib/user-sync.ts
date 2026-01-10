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
  };
  private_metadata?: {
    userType?: string;
    sex?: string;
    dateOfBirth?: string;
    companyName?: string;
    facebookUrl?: string;
  };
  unsafe_metadata?: {
    userType?: string;
    companyName?: string;
    facebookUrl?: string;
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
    
    // Get userType from metadata
    const rawUserType =
      public_metadata?.userType || 
      public_metadata?.role || 
      private_metadata?.userType || 
      unsafe_metadata?.userType || 
      "buyer";
      
    // Mapping to match database constraints ("valid_user_types")
    // It seems the database only accepts 'owner', 'buyer', 'staff'
    let userType = rawUserType.toLowerCase();
    if (userType === "renter") userType = "buyer";
    if (userType === "agent") userType = "owner"; // Map agent to owner
    
    const validUserTypes = ["owner", "buyer", "staff"];
    const supabaseUserType = validUserTypes.includes(userType) ? userType : "buyer";

    const companyName = private_metadata?.companyName || unsafe_metadata?.companyName;
    const facebookUrl = private_metadata?.facebookUrl || unsafe_metadata?.facebookUrl;

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
      phone,
      user_type: supabaseUserType,
      company_name: companyName,
      facebook_url: facebookUrl,
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

    return result;
  } catch (error: any) {
    console.error("Error in createUserInSupabase:", error);
    throw error;
  }
}

/**
 * Update an existing user in Supabase from Clerk data
 */
export async function updateUserInSupabase(data: ClerkUserData) {
  return createUserInSupabase(data); // Re-use the consolidated sync logic
}

/**
 * Delete a user from Supabase
 */
export async function deleteUserFromSupabase(clerkId: string) {
  try {
    if (!supabase) throw new Error("Supabase client not initialized.");
    const { error } = await supabase.from("users").delete().eq("clerk_id", clerkId);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error in deleteUserFromSupabase:", error);
    throw error;
  }
}

/**
 * Get user from Supabase by Clerk ID
 */
export async function getUserByClerkId(clerkId: string) {
  try {
    if (!supabase) throw new Error("Supabase client not initialized.");
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("clerk_id", clerkId)
      .maybeSingle();

    if (error) throw error;
    return user;
  } catch (error) {
    console.error("Error in getUserByClerkId:", error);
    throw error;
  }
}

export function getSupabaseClient() {
  if (!supabase) throw new Error("Supabase client not initialized.");
  return supabase;
}
