import { supabaseAdmin } from "@/lib/supabase-admin";
import { REQUEST_ATTACHMENTS_BUCKET } from "@/lib/property-requests";

export async function processPropertyRequestFileCleanupQueue(limit = 50) {
  const { data, error } = await supabaseAdmin
    .from("property_request_file_cleanup_queue")
    .select("id,path")
    .is("processed_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  let processedCount = 0;
  let failedCount = 0;
  for (const row of data || []) {
    try {
      const { error: removeError } = await supabaseAdmin.storage
        .from(REQUEST_ATTACHMENTS_BUCKET)
        .remove([row.path]);
      if (removeError) throw removeError;
      const { error: updateError } = await supabaseAdmin
        .from("property_request_file_cleanup_queue")
        .update({ processed_at: new Date().toISOString(), error_message: null })
        .eq("id", row.id);
      if (updateError) throw updateError;
      processedCount++;
    } catch (error) {
      failedCount++;
      await supabaseAdmin
        .from("property_request_file_cleanup_queue")
        .update({ error_message: String(error).slice(0, 1000) })
        .eq("id", row.id);
    }
  }
  return { processedCount, failedCount };
}
