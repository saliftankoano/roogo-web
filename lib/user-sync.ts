import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ClerkUserData {
  id: string;
  email_addresses?: Array<{ email_address: string }>;
  first_name?: string;
  last_name?: string;
  image_url?: string;
  phone_numbers?: Array<{ phone_number: string }>;
  private_metadata?: {
    userType?: string;
    sex?: string;
    dateOfBirth?: string;
  };
}

/**
 * Create a new user in Supabase from Clerk data
 */
export async function createUserInSupabase(data: ClerkUserData) {
  try {
    const {
      id: clerkId,
      email_addresses,
      first_name,
      last_name,
      image_url,
      phone_numbers,
      private_metadata,
    } = data;

    const email = email_addresses?.[0]?.email_address;
    const fullName =
      first_name && last_name
        ? `${first_name} ${last_name}`
        : first_name || last_name;
    const phone = phone_numbers?.[0]?.phone_number;
    const userType = private_metadata?.userType || "buyer";

    if (!email) {
      throw new Error("No email found for user");
    }

    const { data: user, error } = await supabase
      .from("users")
      .insert({
        clerk_id: clerkId,
        email,
        full_name: fullName,
        avatar_url: image_url,
        phone,
        user_type: userType,
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
    const {
      id: clerkId,
      email_addresses,
      first_name,
      last_name,
      image_url,
      phone_numbers,
      private_metadata,
    } = data;

    const email = email_addresses?.[0]?.email_address;
    const fullName =
      first_name && last_name
        ? `${first_name} ${last_name}`
        : first_name || last_name;
    const phone = phone_numbers?.[0]?.phone_number;
    const userType = private_metadata?.userType;

    if (!email) {
      throw new Error("No email found for user");
    }

    const updateData: Record<string, string | undefined> = {
      email,
      full_name: fullName,
      avatar_url: image_url,
      phone,
      user_type: userType,
    };

    // Only update user_type if it's provided in private_metadata
    if (userType) {
      updateData.user_type = userType;
    }

    const { data: user, error } = await supabase
      .from("users")
      .update(updateData)
      .eq("clerk_id", clerkId)
      .select()
      .single();

    if (error) {
      console.error("Error updating user in Supabase:", error);
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
