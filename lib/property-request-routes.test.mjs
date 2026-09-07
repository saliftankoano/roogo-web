import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const state = {
  user: null,
  calls: [],
  requests: [],
  responses: [],
  properties: [],
};
globalThis.__propertyRequestTest = state;
const mocks = {
  "next/server":
    "export const NextResponse = Response; export const NextRequest = Request;",
  "@/lib/api-auth": `export const getAuthenticatedUser = async () => globalThis.__propertyRequestTest.user;
    export const isOwnerAgentStaffOrFounder = user => ['owner','agent','staff','founder'].includes(user?.user_type);
    export const isStaffOrFounder = user => ['staff','founder'].includes(user?.user_type);`,
  "@/lib/property-storage": `export const processPropertyStorageCleanupQueue = async () => { const state = globalThis.__propertyRequestTest; state.cleanupCalls++; if(state.cleanupError) throw new Error('Storage unavailable'); return { deletedPathCount: 1, failedCount: 0 }; };`,
  "@/lib/virtual-tour":
    "export const normalizeKuulaVirtualTourUrl = value => value;",
  "@/lib/validations": "export const requireListingFieldsByType = () => {};",
  "@/lib/property-translations":
    "export const buildStalePropertyTranslationUpdate = () => ({}); export const getPropertyTranslationSourceHash = () => '';",
  "@/lib/supabase-admin": `export const supabaseAdmin = globalThis.__propertyRequestTest.db;`,
};
state.db = {
  from(table) {
    state.calls.push(table);
    let rows =
      table === "property_requests"
        ? state.requests
        : table === "properties"
          ? state.properties
          : state.responses;
    let columns = "*";
    let deleting = false;
    const query = {
      select(value) {
        columns = value;
        return query;
      },
      eq(key, value) {
        rows = rows.filter((row) => row[key] === value);
        return query;
      },
      in(key, values) {
        rows = rows.filter((row) => values.includes(row[key]));
        return query;
      },
      or(value) {
        rows = rows.filter(
          (row) => row.status === "open" || value.includes(row.id),
        );
        return query;
      },
      order() {
        return query;
      },
      insert(value) {
        rows = [{ id: requestId, ...value }];
        state.inserted = value;
        return query;
      },
      delete() {
        deleting = true;
        return query;
      },
      update(value) {
        state.updated = value;
        return query;
      },
      maybeSingle() {
        return Promise.resolve({ data: project()[0] ?? null, error: null });
      },
      single() {
        return query.maybeSingle();
      },
      then(resolve, reject) {
        return Promise.resolve({
          data: project(),
          error: deleting ? state.deleteError : null,
        }).then(resolve, reject);
      },
    };
    function project() {
      return rows.map((row) =>
        columns.includes("*")
          ? structuredClone(row)
          : Object.fromEntries(
              columns.split(",").map((key) => [key, row[key]]),
            ),
      );
    }
    return query;
  },
  storage: {
    from() {
      return {
        createSignedUrl: async () => ({
          data: { signedUrl: "https://storage.test/signed" },
        }),
        info: async () => ({ data: {} }),
      };
    },
  },
  async rpc(name, input) {
    state.rpc = { name, input };
    return { data: { id: responseId, existing: false }, error: null };
  },
};
registerHooks({
  resolve(specifier, context, next) {
    if (mocks[specifier])
      return {
        url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`,
        shortCircuit: true,
      };
    if (specifier.startsWith("@/"))
      return {
        url: new URL(`${specifier.slice(2)}.ts`, root).href,
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});
const propertyRoute = await import("../app/api/properties/[id]/route.ts");
const list = await import("../app/api/property-requests/route.ts");
const detail = await import("../app/api/property-requests/[id]/route.ts");
const submit =
  await import("../app/api/property-requests/[id]/responses/route.ts");
const review =
  await import("../app/api/property-requests/[id]/responses/[responseId]/route.ts");
const requestId = "01010101-0101-4101-8101-010101010101";
const responseId = "02020202-0202-4202-8202-020202020202";
const agentId = "03030303-0303-4303-8303-030303030303";
const context = { params: Promise.resolve({ id: requestId, responseId }) };
const request = {
  id: requestId,
  title: "Villa familiale",
  description: "Villa de trois chambres",
  listing_type: "vendre",
  property_type: "Villa",
  city: "Ouagadougou",
  budget_max: 45000000,
  commission_rate: 2.5,
  commission_terms: "Payable après la vente et encaissement des fonds.",
  customer_name: "Private customer",
  customer_contact: "Private phone",
  internal_notes: "Private note",
  status: "open",
  updated_at: "2026-09-07T12:00:00.000000+00:00",
};
const input = {
  property_type: "Villa",
  city: "Ouagadougou",
  neighborhood: "Ouaga 2000",
  address: "Parcelle 12",
  asking_price: 42000000,
  area: 320,
  bedrooms: 3,
  bathrooms: 2,
  description: "Villa avec cour et trois chambres ventilées.",
  contact_phone: "+22670000001",
  document_types: ["Titre foncier"],
  request_updated_at: request.updated_at,
  terms_accepted: true,
};
function reset(role = "agent") {
  state.user = role ? { id: agentId, user_type: role } : null;
  state.requests = [structuredClone(request)];
  state.responses = [
    {
      id: responseId,
      request_id: requestId,
      respondent_id: agentId,
      respondent_role: "agent",
      commission_basis: "sale_price",
      updated_at: request.updated_at,
      attachments: [],
      status: "submitted",
      staff_notes: "Never expose",
      ...input,
    },
    {
      id: "other",
      request_id: requestId,
      respondent_id: "other-user",
      attachments: [],
      staff_notes: "Other secret",
    },
  ];
  state.properties = [];
  state.calls = [];
  state.cleanupCalls = 0;
  state.deleteError = null;
  state.cleanupError = false;
  state.updated = null;
  state.rpc = null;
}
function req(method = "GET", body) {
  return new Request("https://roogo.test/api/property-requests", {
    method,
    ...(body
      ? {
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        }
      : {}),
  });
}

test("API rejects unauthenticated and renter access before database reads", async () => {
  for (const [role, status] of [
    [null, 401],
    ["renter", 403],
    ["hotel", 403],
  ]) {
    reset(role);
    assert.equal((await list.GET(req())).status, status);
    assert.equal((await detail.GET(req(), context)).status, status);
    assert.equal(state.calls.length, 0);
  }
});
test("agents can neither publish calls nor review responses", async () => {
  reset();
  assert.equal((await list.POST(req("POST", request))).status, 403);
  assert.equal((await detail.PUT(req("PUT", request), context)).status, 403);
  assert.equal(
    (
      await review.PUT(
        req("PUT", { status: "accepted", staff_notes: "" }),
        context,
      )
    ).status,
    403,
  );
  assert.equal(state.calls.length, 0);
});
test("agent feed and detail omit customers, other respondents and staff notes", async () => {
  reset();
  const res = await list.GET(req());
  assert.equal(res.headers.get("Cache-Control"), "private, no-store");
  const feed = await res.json();
  assert.equal(feed.requests[0].my_response.id, responseId);
  for (const field of ["customer_name", "customer_contact", "internal_notes"])
    assert.equal(field in feed.requests[0], false);
  const data = await (await detail.GET(req(), context)).json();
  assert.equal(data.responses.length, 1);
  assert.equal(data.responses[0].id, responseId);
  assert.equal("staff_notes" in data.responses[0], false);
  assert.equal("customer_contact" in data.request, false);
});
test("closed calls are visible only to their previous respondents", async () => {
  reset();
  state.requests[0].status = "closed";
  assert.equal((await detail.GET(req(), context)).status, 200);
  state.responses = [];
  assert.equal((await detail.GET(req(), context)).status, 404);
});
test("staff detail includes customer contacts and all respondents", async () => {
  reset("staff");
  const data = await (await detail.GET(req(), context)).json();
  assert.equal(data.request.customer_contact, "Private phone");
  assert.equal(data.responses.length, 2);
  assert.equal(data.responses[0].staff_notes, "Never expose");
});
test("submission uses authenticated identity and rejects foreign attachments", async () => {
  reset();
  const bad = await submit.POST(
    req("POST", {
      ...input,
      attachments: [
        { path: "other/request/file.pdf", name: "proof.pdf", kind: "document" },
      ],
    }),
    context,
  );
  assert.equal(bad.status, 400);
  assert.equal(state.rpc, null);
  const res = await submit.POST(
    req("POST", { ...input, respondent_id: "other-user", commission_rate: 80 }),
    context,
  );
  assert.equal(res.status, 201);
  assert.equal(state.rpc.input.p_user_id, agentId);
  assert.equal(state.rpc.input.p_input.commission_rate, undefined);
  assert.equal("staff_notes" in (await res.json()).response, false);
});
test("staff confirms accepted agent commission but cannot change the saved rate", async () => {
  reset("staff");
  const res = await review.PUT(
    req("PUT", {
      status: "accepted",
      updated_at: request.updated_at,
      staff_notes: "Reviewed",
      commission_rate: 90,
    }),
    context,
  );
  assert.equal(res.status, 200);
  assert.ok(state.updated.commission_confirmed_at);
  assert.equal(state.updated.commission_confirmed_by, agentId);
  assert.equal(state.updated.commission_rate, undefined);
});

test("published responses require the respondent's live property and matching transaction", async () => {
  reset("staff");
  const propertyId = "04040404-0404-4404-8404-040404040404";
  const body = {
    updated_at: request.updated_at,
    status: "listed",
    staff_notes: "",
    property_id: propertyId,
  };
  state.properties = [
    {
      id: propertyId,
      agent_id: "other-user",
      status: "en_ligne",
      listing_type: "vendre",
    },
  ];
  assert.equal((await review.PUT(req("PUT", body), context)).status, 400);
  state.properties[0].agent_id = agentId;
  state.properties[0].status = "brouillon";
  assert.equal((await review.PUT(req("PUT", body), context)).status, 400);
  state.properties[0].status = "en_ligne";
  state.properties[0].listing_type = "louer";
  assert.equal((await review.PUT(req("PUT", body), context)).status, 400);
  state.properties[0].listing_type = "vendre";
  assert.equal((await review.PUT(req("PUT", body), context)).status, 200);
});

test("monthly fulfillment excludes daily listings and uses the submitted terms after call edits", async () => {
  reset("staff");
  const propertyId = "04040404-0404-4404-8404-040404040404";
  state.responses[0].commission_basis = "monthly_rent";
  const body = {
    updated_at: request.updated_at,
    status: "listed",
    staff_notes: "",
    property_id: propertyId,
  };
  // The current call says sale; this response acknowledged monthly rental terms.
  state.properties = [
    {
      id: propertyId,
      agent_id: agentId,
      status: "en_ligne",
      listing_type: "louer",
      frequence: "mensuel",
      period: "month",
    },
  ];
  assert.equal((await review.PUT(req("PUT", body), context)).status, 200);
  for (const change of [
    { frequence: "journalier", period: "month" },
    { frequence: "mensuel", period: "day" },
    { frequence: null, period: null },
  ]) {
    Object.assign(state.properties[0], change);
    assert.equal((await review.PUT(req("PUT", body), context)).status, 400);
    const data = await (await detail.GET(req(), context)).json();
    assert.equal(data.responses[0].properties.length, 0);
  }
  Object.assign(state.properties[0], { frequence: "mensuel", period: "month" });
  const data = await (await detail.GET(req(), context)).json();
  assert.equal(data.responses[0].properties[0].id, propertyId);
});
test("stale staff edits conflict and deleted respondents cannot be reviewed", async () => {
  reset("staff");
  const body = {
    updated_at: "2020-01-01T00:00:00Z",
    status: "accepted",
    staff_notes: "Stale",
  };
  assert.equal((await review.PUT(req("PUT", body), context)).status, 409);
  state.responses[0].respondent_id = null;
  body.updated_at = request.updated_at;
  assert.equal((await review.PUT(req("PUT", body), context)).status, 409);
});
test("submission receipts include usable private attachment links", async () => {
  reset();
  state.responses[0].attachments = [
    {
      path: `${agentId}/${requestId}/${responseId}.pdf`,
      name: "proof.pdf",
      kind: "document",
    },
  ];
  const data = await (
    await submit.POST(
      req("POST", { ...input, attachments: state.responses[0].attachments }),
      context,
    )
  ).json();
  assert.equal(data.response.attachments[0].url, "https://storage.test/signed");
});

test("property deletion never removes media before database success", async () => {
  reset("staff");
  state.properties = [{ id: requestId }];
  state.deleteError = { message: "Foreign key restriction" };
  assert.equal(
    (await propertyRoute.DELETE(req("DELETE"), context)).status,
    500,
  );
  assert.equal(state.cleanupCalls, 0);
  state.deleteError = null;
  state.properties = [];
  assert.equal(
    (await propertyRoute.DELETE(req("DELETE"), context)).status,
    404,
  );
  assert.equal(state.cleanupCalls, 0);
  state.properties = [{ id: requestId }];
  state.cleanupError = true;
  const result = await propertyRoute.DELETE(req("DELETE"), context);
  assert.equal(
    result.status,
    200,
    "successful deletion is not reported as failed when cleanup is queued",
  );
  assert.equal((await result.json()).storageCleanup.pendingFailures, 1);
  assert.equal(state.cleanupCalls, 1);
});
