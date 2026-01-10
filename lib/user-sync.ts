import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client with environment variables
// Try both SUPABASE_URL and EXPO_PUBLIC_SUPABASE_URL for compatibility
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
 * Create a new user in Supabase from Clerk data
 */
export async function createUserInSupabase(data: ClerkUserData) {
  try {
    console.log(
      "createUserInSupabase called with data:",
      JSON.stringify(data, null, 2)
    );

    if (!supabase) {
      throw new Error(
        "Supabase client not initialized. Check environment variables."
      );
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
    const fullName =
      first_name && last_name
        ? `${first_name} ${last_name}`
        : first_name || last_name;
    const phone = phone_numbers?.[0]?.phone_number;
    
    // Check all metadata types for userType, prioritize secure ones
    const userType =
      public_metadata?.userType || 
      public_metadata?.role || 
      private_metadata?.userType || 
      unsafe_metadata?.userType || 
      "renter";
      
    const companyName =
      private_metadata?.companyName || unsafe_metadata?.companyName;
    const facebookUrl =
      private_metadata?.facebookUrl || unsafe_metadata?.facebookUrl;

    const validUserTypes = ["owner", "renter", "staff", "agent"];
    const supabaseUserType = validUserTypes.includes(userType)
      ? userType
      : "renter"; // Default to renter for unknown types

    console.log("Extracted data:", {
      clerkId,
      email,
      fullName,
      phone,
      userType,
      supabaseUserType,
      image_url,
      companyName,
      facebookUrl,
    });

    if (!email) {
      throw new Error("No email found for user");
    }

    if (!clerkId) {
      throw new Error("No clerk ID found for user");
    }

    const { data: user, error } = await supabase
      .from("users")
      .insert({
        clerk_id: clerkId,
        email,
        full_name: fullName,
        avatar_url: image_url,
        phone,
        user_type: supabaseUserType,
        company_name: companyName,
        facebook_url: facebookUrl,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating user in Supabase:", error);
      throw error;
    }

    console.log(`User created in Supabase: ${clerkId}`, user);
    return user;
  } catch (error) {
    console.error("Error in createUserInSupabase:", error);
    throw error;
  }
}

/**
 * Update an existing user in Supabase from Clerk data
 */
export async function updateUserInSupabase(data: ClerkUserData) {
  try {
    console.log(
      "updateUserInSupabase called with data:",
      JSON.stringify(data, null, 2)
    );

    if (!supabase) {
      throw new Error(
        "Supabase client not initialized. Check environment variables."
      );
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
    const fullName =
      first_name && last_name
        ? `${first_name} ${last_name}`
        : first_name || last_name;
    const phone = phone_numbers?.[0]?.phone_number;
    
    // Check all metadata types for userType, prioritize secure ones
    const userType = 
      public_metadata?.userType || 
      public_metadata?.role || 
      private_metadata?.userType || 
      unsafe_metadata?.userType;
      
    const companyName =
      private_metadata?.companyName || unsafe_metadata?.companyName;
    const facebookUrl =
      private_metadata?.facebookUrl || unsafe_metadata?.facebookUrl;

    // Use consistent terminology - no mapping needed
    // Valid types: "owner", "renter", "staff", "agent"
    const validUserTypes = ["owner", "renter", "staff", "agent"];
    const supabaseUserType =
      userType && validUserTypes.includes(userType) ? userType : undefined;

    console.log("Extracted data for update:", {
      clerkId,
      email,
      fullName,
      phone,
      userType,
      supabaseUserType,
      image_url,
      companyName,
      facebookUrl,
    });

    if (!email) {
      throw new Error("No email found for user");
    }

    if (!clerkId) {
      throw new Error("No clerk ID found for user");
    }

    const updateData: Record<string, string | undefined> = {
      email,
      full_name: fullName,
      avatar_url: image_url,
      phone,
      company_name: companyName,
      facebook_url: facebookUrl,
    };

    // Only update user_type if it's provided
    if (supabaseUserType) {
      updateData.user_type = supabaseUserType;
    }

    const { data: user, error } = await supabase
      .from("users")
      .update(updateData)
      .eq("clerk_id", clerkId)
      .select()
      .single();

    if (error) {
      console.error("Error updating user type in Supabase:", error);
      throw error;
    }

    console.log(`User updated in Supabase: ${clerkId}`, user);
    return user;
  } catch (error) {
    console.error("Error in updateUserInSupabase:", error);
    throw error;
  }
}

/**
 * Delete a user from Supabase
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

/**
 * Get user from Supabase by Clerk ID
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

```

Command completed in 157 ms.

Shell state (cwd, env vars) persists for subsequent calls.