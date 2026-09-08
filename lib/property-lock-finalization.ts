import { supabaseAdmin } from "@/lib/supabase-admin";

export type PropertyLockCompletion = {
  paymentStatus: string | null;
  failureCode: string | null;
  transitioned: boolean;
};

export async function isMonthlyProperty(propertyId: string | null | undefined) {
  if (!propertyId) return false;
  const { data, error } = await supabaseAdmin
    .from("properties")
    .select("period")
    .eq("id", propertyId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data && data.period !== "day");
}

export async function finalizeMonthlyPropertyLock(
  depositId: string,
  pawapay: unknown,
): Promise<PropertyLockCompletion> {
  const { data, error } = await supabaseAdmin
    .rpc("finalize_direct_property_lock", {
      p_deposit_id: depositId,
      p_pawapay: pawapay,
    })
    .maybeSingle();
  if (error) throw error;

  const completion = data as {
    payment_status?: unknown;
    failure_code?: unknown;
    transitioned?: unknown;
  } | null;
  return {
    paymentStatus:
      typeof completion?.payment_status === "string"
        ? completion.payment_status
        : null,
    failureCode:
      typeof completion?.failure_code === "string"
        ? completion.failure_code
        : null,
    transitioned: completion?.transitioned === true,
  };
}
