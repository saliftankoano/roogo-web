import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
const origin = "https://storage.test/storage/v1/object/public/listing/";
const url = ext => `${origin}${first}/sha256-${"a".repeat(64)}.${ext}`;
const insert = (propertyId, photoUrl) => db.query(
  "INSERT INTO property_images(property_id, url) VALUES ($1, $2)",
  [propertyId, photoUrl],
);

before(async () => {
  await db.exec("CREATE TABLE property_images(property_id UUID NOT NULL, url TEXT NOT NULL)");
  // Historical duplicate URLs must not prevent the scoped index from deploying.
  await insert(first, `${origin}${first}/0.jpg`);
  await insert(first, `${origin}${first}/0.jpg`);
  await db.exec(readFileSync(new URL(
    "../supabase/migrations/073_unique_content_addressed_listing_photos_executed.sql", import.meta.url,
  ), "utf8"));
});
beforeEach(() => db.exec("TRUNCATE property_images"));
after(() => db.close());

test("database permits only one competing insert per content URL and property", async () => {
  for (const ext of ["jpg", "png", "heic"]) {
    const attempts = await Promise.allSettled([insert(first, url(ext)), insert(first, url(ext))]);
    assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
    const rejected = attempts.find(result => result.status === "rejected");
    assert.equal(rejected.reason.code, "23505");
    assert.equal(rejected.reason.constraint, "property_images_content_addressed_url_unique");
  }
  assert.equal((await db.query("SELECT * FROM property_images")).rows.length, 3);
});

test("uniqueness is scoped to the property and does not alter legacy or UUID URLs", async () => {
  await insert(first, url("jpg"));
  await insert(second, url("jpg"));
  for (const path of ["0.jpg", "123e4567-e89b-42d3-a456-426614174000.jpg"]) {
    await insert(first, origin + first + "/" + path);
    await insert(first, origin + first + "/" + path);
  }
  assert.equal((await db.query("SELECT * FROM property_images")).rows.length, 6);
});

test("deleting a linked photo allows its content URL to be linked again", async () => {
  await insert(first, url("jpg"));
  await db.query("DELETE FROM property_images WHERE property_id=$1 AND url=$2", [first, url("jpg")]);
  await insert(first, url("jpg"));
  assert.equal((await db.query("SELECT * FROM property_images")).rows.length, 1);
});
