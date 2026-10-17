import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const state = { rows: [], failedPaths: new Set(), removed: [] };
globalThis.__requestCleanupDb = {
  from(table) {
    assert.equal(table, "property_request_file_cleanup_queue");
    let id;
    let update;
    const query = {
      select() {
        return query;
      },
      is() {
        return query;
      },
      order() {
        return query;
      },
      limit() {
        return query;
      },
      update(value) {
        update = value;
        return query;
      },
      eq(key, value) {
        id = value;
        return query;
      },
      then(resolve, reject) {
        if (update)
          Object.assign(
            state.rows.find((row) => row.id === id),
            update,
          );
        return Promise.resolve({
          data: state.rows.filter((row) => !row.processed_at),
          error: null,
        }).then(resolve, reject);
      },
    };
    return query;
  },
  storage: {
    from(bucket) {
      assert.equal(bucket, "property-request-files");
      return {
        async remove(paths) {
          if (paths.some((path) => state.failedPaths.has(path)))
            return { error: new Error("Temporary storage failure") };
          state.removed.push(...paths);
          return { error: null };
        },
      };
    },
  },
};
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@/lib/supabase-admin")
      return {
        url: "data:text/javascript,export const supabaseAdmin = globalThis.__requestCleanupDb;",
        shortCircuit: true,
      };
    if (specifier === "@/lib/property-requests")
      return {
        url: new URL("./property-requests.ts", import.meta.url).href,
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});
const { processPropertyRequestFileCleanupQueue } =
  await import("./property-request-storage.ts");

test("private file cleanup only completes successful removals and retries failed files", async () => {
  state.rows = [
    { id: 1, path: "user/request/photo.jpg" },
    { id: 2, path: "user/request/proof.pdf" },
  ];
  state.failedPaths.add(state.rows[1].path);
  assert.deepEqual(await processPropertyRequestFileCleanupQueue(), {
    processedCount: 1,
    failedCount: 1,
  });
  assert.ok(state.rows[0].processed_at);
  assert.equal(state.rows[1].processed_at, undefined);
  assert.match(state.rows[1].error_message, /Temporary storage failure/);
  state.failedPaths.clear();
  assert.deepEqual(await processPropertyRequestFileCleanupQueue(), {
    processedCount: 1,
    failedCount: 0,
  });
  assert.ok(state.rows[1].processed_at);
  assert.equal(state.rows[1].error_message, null);
  assert.deepEqual(state.removed, [
    "user/request/photo.jpg",
    "user/request/proof.pdf",
  ]);
});
