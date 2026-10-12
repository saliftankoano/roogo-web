// TEMPORARY STUB. Replace with the real module from feat/studio-field-media.
//
// The real module (field uploads into the Studio, saved to Drive) is being built
// on the feat/studio-field-media branch and is not merged yet. This stub only
// keeps the shared contract so the "Présentateur dans le coin" template compiles
// and its tests can mock it. When that branch merges, its file wins: delete
// this one in the merge, keep its signature unchanged.
//
// Shared contract (2026-10-12):
// - table studio_field_media (id, property_id, kind 'photo'|'video', file_name,
//   mime_type, size_bytes, duration_seconds, status 'uploading'|'ready'|'failed',
//   drive_file_id, created_at)
// - GET /api/admin/studio/media?propertyId= -> { media: FieldMedia[] }
// - signedFieldMediaUrl(mediaId, ttlSeconds?) -> absolute stream URL HeyGen can fetch

export class FieldMediaUnavailableError extends Error {
  constructor() {
    super("Field media is not available until feat/studio-field-media is merged.");
    this.name = "FieldMediaUnavailableError";
  }
}

/** TEMPORARY: always throws until feat/studio-field-media is merged. */
export async function signedFieldMediaUrl(mediaId: string, ttlSeconds?: number): Promise<string> {
  void mediaId;
  void ttlSeconds;
  throw new FieldMediaUnavailableError();
}
