import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const root = new URL("../", import.meta.url);
const state = {};
globalThis.__listingImageTest = state;
const origin = "https://storage.test/storage/v1/object/public/listing/";
const propertyId = "11111111-1111-4111-8111-111111111111";
const roomId = "22222222-2222-4222-8222-222222222222";
const owner = { id: "owner", user_type: "agent" };

state.db = {
  from(table) {
    let operation = "select";
    let value;
    const filters = {};
    const query = {
      select() { return query; },
      eq(key, val) { filters[key] = val; return query; },
      match(input) { Object.assign(filters, input); return query; },
      insert(input) { operation = "insert"; value = input; return query; },
      update(input) { operation = "update"; value = input; return query; },
      delete() { operation = "delete"; return query; },
      single: async () => ({ data: state.property, error: null }),
      maybeSingle: async () => ({ data: state.room, error: null }),
      then(resolve, reject) {
        if (operation === "insert") state.records.push(...[value].flat());
        if (operation === "update") state.updates.push({ table, value, filters });
        if (operation === "delete") state.deleted.push({ table, filters });
        return Promise.resolve({ data: [], count: state.count, error: null }).then(resolve, reject);
      },
    };
    return query;
  },
  storage: {
    from(bucket) {
      assert.equal(bucket, "listing");
      return {
        async upload(path, bytes, options) {
          if (state.failUpload) return { error: { message: "Storage unavailable" } };
          assert.equal(state.objects.has(path), false, "must not reuse an object URL");
          state.objects.set(path, { bytes, options });
          return { error: null };
        },
        getPublicUrl: path => ({ data: { publicUrl: origin + path } }),
        async remove(paths) {
          state.removed.push(...paths);
          for (const path of paths) state.objects.delete(path);
          return { error: null };
        },
      };
    },
  },
};
const mocks = {
  "next/server": "export const NextResponse = Response;",
  "@/lib/api-auth": `export const getAuthenticatedUser = async () => globalThis.__listingImageTest.user;
    export const isStaffOrFounder = user => ['staff', 'founder'].includes(user?.user_type);`,
  "@/lib/user-sync": "export const getSupabaseClient = () => globalThis.__listingImageTest.db;",
  "@/lib/supabase-admin": "export const supabaseAdmin = globalThis.__listingImageTest.db;",
  "@/lib/hotel-auth": "export const getHotelMembershipForProperty = async () => globalThis.__listingImageTest.membership;",
  "@/lib/posthog-server": "export const captureServerEvent = async () => {};",
  "@/lib/validations": "export const MAX_LISTING_PHOTOS = 10;",
};
registerHooks({
  resolve(specifier, context, next) {
    if (mocks[specifier]) return { url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`, shortCircuit: true };
    if (specifier.startsWith("@/")) return { url: new URL(`${specifier.slice(2)}.ts`, root).href, shortCircuit: true };
    return next(specifier, context);
  },
});
const single = await import("../app/api/properties/[id]/upload-image/route.ts");
const batch = await import("../app/api/properties/[id]/upload-images/route.ts");
const room = await import("../app/api/room-types/[id]/upload-image/route.ts");
const images = await import("../app/api/properties/[id]/images/route.ts");
const photo = data => ({ data: Buffer.from(data).toString("base64"), ext: "jpg", width: 640, height: 480, index: 0 });
const request = body => new Request("https://app.test/api/photos", { method: "POST", body: JSON.stringify(body) });
const context = id => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  Object.assign(state, {
    user: owner, property: { id: propertyId, agent_id: owner.id },
    room: { id: roomId, property_id: propertyId, photos: [] },
    membership: { role: "admin" }, count: 0, objects: new Map(),
    records: [], updates: [], deleted: [], removed: [], failUpload: false,
  });
});

test("reusing a single-upload index creates distinct cached objects and linked URLs", async () => {
  for (const content of ["first photo", "replacement photo"]) {
    const response = await single.POST(request(photo(content)), context(propertyId));
    assert.equal(response.status, 200);
    const result = await response.json();
    const stored = state.objects.get(result.url.slice(origin.length));
    assert.equal(stored.bytes.toString(), content);
    assert.deepEqual(stored.options, { contentType: "image/jpeg", cacheControl: "2592000", upsert: false });
    assert.equal(state.records.at(-1).url, result.url);
  }
  assert.equal(state.objects.size, 2);
  assert.notEqual(state.records[0].url, state.records[1].url);
});

test("batch uploads preserve their contents and primary URL with unique long-lived objects", async () => {
  const response = await batch.POST(request({ images: [photo("one"), photo("two")] }), context(propertyId));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(new Set(result.images.map(image => image.url)).size, 2);
  for (const [index, image] of result.images.entries()) {
    assert.equal(state.objects.get(image.url.slice(origin.length)).bytes.toString(), ["one", "two"][index]);
    assert.equal(state.objects.get(image.url.slice(origin.length)).options.cacheControl, "2592000");
    assert.equal(state.records[index].url, image.url);
  }
  assert.equal(state.updates[0].value.primary_image, result.images[0].url);
});

test("an unrecognized extension cannot turn a versioned upload into a reused path", async () => {
  const response = await single.POST(request({ ...photo("photo"), ext: "../0.jpg" }), context(propertyId));
  assert.equal(response.status, 200);
  const { url } = await response.json();
  const path = url.slice(origin.length);
  assert.equal(path.split("/").length, 2);
  assert.match(path.split("/")[1], /^[0-9a-f-]{36}\.jpg$/);
  assert.equal(state.objects.get(path).options.contentType, "image/jpeg");
});

test("room-type upload uses its own directory and preserves existing photo references", async () => {
  state.room.photos = [origin + "old.jpg"];
  const response = await room.POST(request({ ...photo("room"), ext: "png" }), context(roomId));
  assert.equal(response.status, 200);
  const { url } = await response.json();
  assert.ok(url.startsWith(origin + `room-types/${roomId}/`));
  assert.equal(state.objects.get(url.slice(origin.length)).options.contentType, "image/png");
  assert.equal(state.objects.get(url.slice(origin.length)).options.cacheControl, "2592000");
  assert.deepEqual(state.updates[0].value.photos, [origin + "old.jpg", url]);
});

test("deleting a versioned upload removes the stored object path and database reference", async () => {
  const { url } = await (await single.POST(request(photo("delete me")), context(propertyId))).json();
  const response = await images.DELETE(request({ url }), context(propertyId));
  assert.equal(response.status, 200);
  assert.deepEqual(state.removed, [url.slice(origin.length)]);
  assert.deepEqual(state.deleted, [{ table: "property_images", filters: { property_id: propertyId, url } }]);
  assert.equal(state.objects.size, 0);
});

test("unauthorized users, other owners, hotel non-admins and full galleries cannot upload", async () => {
  state.user = null;
  for (const route of [single, batch, room]) assert.equal((await route.POST(request(photo("no")), context(propertyId))).status, 401);
  state.user = { ...owner, id: "other" };
  assert.equal((await single.POST(request(photo("no")), context(propertyId))).status, 403);
  assert.equal((await batch.POST(request({ images: [photo("no")] }), context(propertyId))).status, 403);
  state.membership = { role: "receptionist" };
  assert.equal((await room.POST(request(photo("no")), context(roomId))).status, 403);
  state.user = owner;
  state.count = 10;
  assert.equal((await single.POST(request(photo("no")), context(propertyId))).status, 400);
  assert.equal((await batch.POST(request({ images: [photo("no")] }), context(propertyId))).status, 400);
  assert.equal(state.objects.size, 0);
});

test("storage failure never links a new photo", async () => {
  state.failUpload = true;
  for (const [route, body] of [[single, photo("no")], [batch, { images: [photo("no")] }], [room, photo("no")]]) {
    assert.equal((await route.POST(request(body), context(propertyId))).status, 500);
  }
  assert.equal(state.records.length, 0);
  assert.equal(state.updates.length, 0);
});
