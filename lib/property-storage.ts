import { supabaseAdmin } from "@/lib/supabase-admin";

const STORAGE_LIST_PAGE_SIZE = 100;
const STORAGE_REMOVE_BATCH_SIZE = 100;

interface StorageCleanupQueueRow {
  id: number;
  property_id: string;
  bucket_id: string;
  storage_prefix: string;
}

export interface PropertyStoragePurgeResult {
  deletedPathCount: number;
  errors: string[];
}

export interface PropertyStorageCleanupQueueResult {
  processedCount: number;
  failedCount: number;
  deletedPathCount: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function normalizeStoragePrefix(prefix: string): string {
  return prefix.replace(/^\/+|\/+$/g, "");
}

async function listStoragePathsForPrefix(
  bucketId: string,
  storagePrefix: string,
): Promise<string[]> {
  const normalizedPrefix = normalizeStoragePrefix(storagePrefix);

  if (!normalizedPrefix) {
    return [];
  }

  const paths: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabaseAdmin.storage.from(bucketId).list(
      normalizedPrefix,
      {
        limit: STORAGE_LIST_PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      },
    );

    if (error) {
      throw new Error(
        `Failed to list storage objects for ${bucketId}/${normalizedPrefix}: ${error.message}`,
      );
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const entry of data) {
      if (entry.name) {
        paths.push(`${normalizedPrefix}/${entry.name}`);
      }
    }

    if (data.length < STORAGE_LIST_PAGE_SIZE) {
      break;
    }

    offset += STORAGE_LIST_PAGE_SIZE;
  }

  return [...new Set(paths)];
}

async function purgeStoragePrefix(
  bucketId: string,
  storagePrefix: string,
): Promise<PropertyStoragePurgeResult> {
  const paths = await listStoragePathsForPrefix(bucketId, storagePrefix);

  if (paths.length === 0) {
    return { deletedPathCount: 0, errors: [] };
  }

  let deletedPathCount = 0;
  const errors: string[] = [];

  for (const batch of chunk(paths, STORAGE_REMOVE_BATCH_SIZE)) {
    const { error } = await supabaseAdmin.storage.from(bucketId).remove(batch);

    if (error) {
      errors.push(
        `Failed to remove ${bucketId}/${storagePrefix}: ${error.message}`,
      );
      continue;
    }

    deletedPathCount += batch.length;
  }

  return { deletedPathCount, errors };
}

export async function purgePropertyListingAssets(
  propertyId: string,
): Promise<PropertyStoragePurgeResult> {
  return purgeStoragePrefix("listing", propertyId);
}

export async function processPropertyStorageCleanupQueue(options?: {
  propertyId?: string;
  limit?: number;
}): Promise<PropertyStorageCleanupQueueResult> {
  const limit = options?.limit ?? 25;
  let query = supabaseAdmin
    .from("property_storage_cleanup_queue")
    .select("id, property_id, bucket_id, storage_prefix")
    .is("processed_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (options?.propertyId) {
    query = query.eq("property_id", options.propertyId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to read cleanup queue: ${error.message}`);
  }

  const rows = (data ?? []) as StorageCleanupQueueRow[];
  let processedCount = 0;
  let failedCount = 0;
  let deletedPathCount = 0;

  for (const row of rows) {
    try {
      const result = await purgeStoragePrefix(row.bucket_id, row.storage_prefix);

      deletedPathCount += result.deletedPathCount;

      if (result.errors.length > 0) {
        failedCount += 1;

        await supabaseAdmin
          .from("property_storage_cleanup_queue")
          .update({ error_message: result.errors.join(" | ").slice(0, 1000) })
          .eq("id", row.id);

        continue;
      }

      processedCount += 1;

      await supabaseAdmin
        .from("property_storage_cleanup_queue")
        .update({
          processed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", row.id);
    } catch (queueError) {
      failedCount += 1;

      const message =
        queueError instanceof Error
          ? queueError.message
          : "Unknown storage cleanup failure";

      await supabaseAdmin
        .from("property_storage_cleanup_queue")
        .update({ error_message: message.slice(0, 1000) })
        .eq("id", row.id);
    }
  }

  return {
    processedCount,
    failedCount,
    deletedPathCount,
  };
}
