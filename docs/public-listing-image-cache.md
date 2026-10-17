# Public listing photo caching

The property single/batch upload routes and room-type photo route store new
photos with immutable filenames, `upsert: false`, and 30-day `cacheControl`.
Single-photo uploads use a SHA-256 content key: an identical retry returns the
linked photo, even when the gallery is full. Changed bytes get a different URL.
Batch and room-type photos continue to use unique UUID filenames.

Migration `073_unique_content_addressed_listing_photos_executed.sql` is required before deploying
this route. Salif confirmed it ran on Roogo on 2026-09-13 UTC; see the [execution ledger](../supabase/migrations/README.md). Confirm a different target separately. Its partial unique index covers only SHA-256 photo URLs and leaves
legacy and UUID URLs unchanged. If duplicate SHA-256 references already exist,
the migration fails rather than silently discarding records; reconcile them
before applying it.

Concurrent identical uploads may both attempt to link the shared object; the
unique index permits only one record, and the other request returns that record.
A failed link retains the immutable object so a retry can recover it. The route
never removes that shared object after a failed link, since another request may
be linking it concurrently. Abandoned unlinked objects require separate cleanup.
The returned URL remains the source of truth; clients must not reconstruct
filenames from an image index. Deletion continues to use the stored URL.

Replacing a photo with different content means uploading a new object and linking its new URL. Do not
overwrite an existing public photo URL: a browser or optimizer may still serve
the old content for 30 days. Removing a listing or photo stops it appearing in
the app but does not revoke copies already held in public caches.

This policy is intentionally set on photo uploads, not the entire `listing`
bucket (which also contains other file types), and does not change the global
Next image cache floor, Clerk avatars, or private/signed attachments.

## Existing photos

This code change does not rewrite existing storage objects or photo references.
Existing images retain their existing cache headers, generally one hour. The
savings accumulate as new photos are uploaded; this is not an immediate fix for
all historical transformation usage.

A legacy backfill must create new versioned objects with the longer lifetime,
then update the corresponding `property_images.url`, `properties.primary_image`,
and room-type photo references together. It must preserve originals until all
references are switched and verify mobile readers as well as the web. Do not
extend the lifetime of old index-based filenames without verifying every writer.

## Release verification

1. Upload two different photos using the same single-upload index. Verify that
   their URLs differ, their contents are distinct, and both records reference
   the returned URLs. Repeat for batch and room-type uploads.
   Replay an identical single upload and verify it returns the same URL without
   a second record or another primary image. Repeat with overlapping requests
   and a storage object whose initial database link failed; both must recover
   without duplicate references.
2. Read the new public source URL and confirm `max-age=2592000`. Request an
   optimized variant and confirm its cache headers/status in the deployed
   environment. Existing variants are not expected to change immediately.
3. Delete a new photo through the existing photo-delete action; verify the
   database reference and origin object are removed. A previously cached public
   copy may remain until expiry.
4. Compare transformations per newly uploaded source and requested width/format
   over equivalent seven-day windows. Keep historical and new sources separate.

Local regression tests mock storage and authentication; they do not modify
production objects or prove deployed CDN behavior.
