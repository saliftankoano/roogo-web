// The render route for "Présentateur dans le coin": clip validation, signed URLs,
// budget reservation and HeyGen submission, all mocked (no network, no database).
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const PROPERTY = "prop-1";
const state = {
  media: [],
  signed: [],
  signError: null,
  submitted: [],
  reserved: [],
  updates: [],
};
globalThis.__presenterRouteTest = state;

const db = {
  from(table) {
    const filters = [];
    const query = {
      select() {
        return query;
      },
      eq(key, value) {
        filters.push((row) => row[key] === value);
        return query;
      },
      in(key, values) {
        filters.push((row) => values.includes(row[key]));
        return query;
      },
      order() {
        return query;
      },
      update(value) {
        state.updates.push({ table, value });
        return query;
      },
      maybeSingle() {
        return Promise.resolve({ data: null, error: null });
      },
      then(resolve, reject) {
        const rows = table === "studio_field_media" ? state.media : [];
        return Promise.resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null }).then(resolve, reject);
      },
    };
    return query;
  },
  rpc(name, args) {
    state.reserved.push({ name, args });
    return Promise.resolve({ data: "gen-1", error: null });
  },
  storage: {
    from() {
      return { createSignedUrl: async (path) => ({ data: { signedUrl: `https://store/${path}` } }) };
    },
  },
};
globalThis.__presenterRouteDb = db;

const mocks = {
  "next/server": "export const NextResponse = Response;",
  "@/lib/api-auth": "export const getStaffOrFounder = async () => ({ id: 'staff-1', user_type: 'staff' });",
  "@/lib/rate-limit": "export const studioJobLimiter = null; export const checkRateLimit = async () => ({ success: true });",
  "@/lib/supabase-admin": "export const supabaseAdmin = globalThis.__presenterRouteDb;",
  "@/lib/studio/conversations-server": `
    export const loadConversation = async (id) => ({ id, property_id: '${PROPERTY}', user_id: 'staff-1' });
    export const canWriteConversation = () => true;
    export const loadPropertyRow = async () => ({ images: ['https://x/p1.jpg'] });
    export const propertyLabels = {};`,
  "@/lib/studio/property-context": `
    export const toPropertySummary = () => ({ id: '${PROPERTY}', title: 'Villa à vendre, Koubri', offer: '', place: 'Koubri', price: '15 000 000 FCFA', image: 'https://x/p1.jpg', photos: ['https://x/p1.jpg'], live: true });`,
  "@/lib/studio/heygen-server": `
    export const heygenConfigured = () => true;
    export const submitRender = async (html, title, key) => { globalThis.__presenterRouteTest.submitted.push({ html, title, key }); return { ok: true, renderId: 'r-1' }; };`,
  "@/lib/studio/server": "export const STUDIO_BUCKET = 'content-studio'; export const getVideoCapUsd = async () => 10;",
  "@/lib/studio/field-media": `
    export const signedFieldMediaUrl = async (id, ttl) => {
      const s = globalThis.__presenterRouteTest;
      if (s.signError) throw new Error(s.signError);
      s.signed.push({ id, ttl });
      return 'https://media.example/stream/' + id + '?sig=abc&exp=1';
    };`,
};

registerHooks({
  resolve(specifier, context, next) {
    if (mocks[specifier]) {
      return { url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`, shortCircuit: true };
    }
    if (specifier.startsWith("@/")) return { url: new URL(`${specifier.slice(2)}.ts`, root).href, shortCircuit: true };
    return next(specifier, context);
  },
});

const route = await import("../../app/api/admin/studio/videos/route.ts");
const { planPresenterVideo, estimateVideoCostUsd } = await import("./video-templates.ts");

const clip = (id, extra = {}) => ({ id, property_id: PROPERTY, kind: "video", status: "ready", duration_seconds: 30, ...extra });

function reset(media) {
  state.media = media;
  state.signed = [];
  state.signError = null;
  state.submitted = [];
  state.reserved = [];
  state.updates = [];
}

async function post(body) {
  const res = await route.POST(
    new Request("http://localhost/api/admin/studio/videos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversation_id: "conv-1", acknowledged_cost_usd: 1, ...body }),
    }),
  );
  return { status: res.status, data: await res.json() };
}

const presenterBody = { templateId: "presentateur-coin", walkthroughMediaId: "walk", presenterMediaId: "talk" };

test("a presenter video with two ready clips of the property is reserved and submitted", async () => {
  reset([clip("walk", { duration_seconds: 12 }), clip("talk", { duration_seconds: 40 })]);
  const { status, data } = await post(presenterBody);
  assert.equal(status, 200, JSON.stringify(data));
  const plan = planPresenterVideo(12, 40);
  assert.equal(data.seconds, plan.total);
  assert.equal(data.estimateUsd, estimateVideoCostUsd(plan.total));

  assert.deepEqual(state.signed.map((s) => s.id).sort(), ["talk", "walk"]);
  assert.ok(state.signed.every((s) => s.ttl === 3 * 3600), "signed for HeyGen's queue");

  assert.equal(state.reserved.length, 1);
  const { args } = state.reserved[0];
  assert.equal(args.p_kind, "video");
  assert.equal(args.p_model, "heygen-hyperframes");
  assert.equal(args.p_input.template, "presentateur-coin");

  assert.equal(state.submitted.length, 1);
  const { html, title } = state.submitted[0];
  assert.equal(title, "Présentateur · Villa à vendre, Koubri");
  assert.match(html, /data-composition-id="presentateur-coin"/);
  assert.match(html, /https:\/\/media.example\/stream\/walk\?sig=abc&amp;exp=1/);
  assert.match(html, /<video id="presenter"[^>]*src="https:\/\/media.example\/stream\/talk/);
  assert.match(html, /15 000 000/, "the price still comes from the listing");
});

test("clips are refused unless both are ready videos of this property", async () => {
  const cases = [
    [{ ...presenterBody, presenterMediaId: undefined }, [clip("walk")], /Choisissez la vidéo de visite/],
    [{ ...presenterBody, presenterMediaId: "walk" }, [clip("walk")], /deux vidéos différentes/],
    [presenterBody, [clip("walk"), clip("talk", { property_id: "other" })], /présentateur n'appartient pas à ce bien/],
    [presenterBody, [clip("walk")], /présentateur n'appartient pas à ce bien/],
    [presenterBody, [clip("walk", { kind: "photo" }), clip("talk")], /visite doit être une vidéo/],
    [presenterBody, [clip("walk"), clip("talk", { status: "uploading" })], /présentateur n'est pas encore prête/],
    [presenterBody, [clip("walk", { duration_seconds: null }), clip("talk")], /durée est inconnue/],
    [presenterBody, [clip("walk"), clip("talk", { duration_seconds: 400 })], /dépasse 3 minutes/],
    [{ ...presenterBody, templateId: "autre" }, [clip("walk"), clip("talk")], /Modèle de vidéo inconnu/],
  ];
  for (const [body, media, message] of cases) {
    reset(media);
    const { status, data } = await post(body);
    assert.equal(status, 400, `${message}: ${JSON.stringify(data)}`);
    assert.match(data.error, message);
    assert.equal(state.reserved.length, 0, "nothing reserved");
    assert.equal(state.submitted.length, 0, "nothing submitted");
  }
});

test("when a clip link cannot be signed, the presenter template fails clearly and costs nothing", async () => {
  reset([clip("walk"), clip("talk")]);
  state.signError = "Field media is not ready (uploading)";
  const { status, data } = await post(presenterBody);
  assert.equal(status, 503);
  assert.match(data.error, /vidéos du terrain/);
  assert.equal(state.reserved.length, 0);
});

test("requests without a template still make a Visite POV and never touch field media", async () => {
  reset([]);
  state.signError = "must not be called";
  // No voice-over in this project: music is required, so a missing music track is refused the usual way.
  const refused = await post({ photos: ["https://x/p1.jpg"] });
  assert.equal(refused.status, 400);
  assert.match(refused.data.error, /voix off ou une musique/);

  const outro = await post({ mode: "outro" });
  assert.equal(outro.status, 200, JSON.stringify(outro.data));
  assert.equal(state.submitted.at(-1).title, "Fin seule · Villa à vendre, Koubri");
  assert.match(state.submitted.at(-1).html, /data-composition-id="visite-pov"/);
  assert.equal(state.reserved.at(-1).args.p_input.template, "visite-pov");
});
