import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const fix = readFileSync(
  new URL("../supabase/migrations/107_fix_record_property_view_executed.sql", import.meta.url),
  "utf8",
);

// Columns as they are in production (read 2026-10-24): no user_id.
const SCHEMA = `
  CREATE TABLE properties (id uuid PRIMARY KEY, views_count integer DEFAULT 0);
  CREATE TABLE property_views (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id uuid REFERENCES properties(id),
    clerk_id text,
    viewed_at timestamptz DEFAULT now(),
    device_platform text,
    source text,
    viewer_latitude double precision,
    viewer_longitude double precision,
    viewer_city text,
    created_at timestamptz DEFAULT now(),
    view_session_id text
  );
  CREATE UNIQUE INDEX idx_property_views_property_session
    ON property_views(property_id, view_session_id);
  INSERT INTO properties VALUES ('00000000-0000-0000-0000-0000000000a1', 4);
`;

const record = (db, session, userId = null) =>
  db.query(
    `SELECT * FROM record_property_view($1, $2, $3, $4, $5, $6, $7)`,
    ["00000000-0000-0000-0000-0000000000a1", session, userId, "user_abc", "ios", "browse", "Ouagadougou"],
  );

describe("record_property_view (migration 107)", () => {
  it("stores a view on the production columns and counts each session once", async () => {
    const db = new PGlite();
    try {
      await db.exec(SCHEMA);
      await db.exec(fix);

      const first = await record(db, "session-1", "00000000-0000-0000-0000-0000000000b2");
      assert.deepEqual(first.rows[0], { counted: true, views_count: 5 });

      const repeat = await record(db, "session-1");
      assert.deepEqual(repeat.rows[0], { counted: false, views_count: 5 });

      const other = await record(db, "session-2");
      assert.deepEqual(other.rows[0], { counted: true, views_count: 6 });

      const stored = await db.query(
        "SELECT clerk_id, device_platform, viewer_city FROM property_views ORDER BY created_at",
      );
      assert.equal(stored.rows.length, 2);
      assert.deepEqual(stored.rows[0], {
        clerk_id: "user_abc",
        device_platform: "ios",
        viewer_city: "Ouagadougou",
      });
    } finally {
      await db.close();
    }
  });
});
