import test from "node:test";
import assert from "node:assert/strict";
import {
  INBOX_NOT_READY,
  InboxGraphError,
  REQUIRED_META_PERMISSIONS,
  WINDOW_CLOSED_MESSAGE,
  WINDOW_CLOSED_MESSAGE_FACEBOOK,
  applyStatusAction,
  cleanReplyText,
  extractListingReference,
  frenchInboxError,
  inboxErrorKind,
  messagingWindow,
  openOnNetworkUrl,
  parseConversations,
  parseFacebookComments,
  parseInstagramComments,
  readSource,
  replyBlockReason,
  sendReply,
  statusAfterSync,
  waitingSentence,
  windowLabel,
} from "./inbox.ts";

// No test may reach the network.
globalThis.fetch = () => {
  throw new Error("real network call in a test");
};

const cfg = { graphVersion: "v25.0", pageId: "PAGE1", igUserId: "IG1", pageToken: "PAGE-TOKEN-SECRET" };
const NOW = new Date("2026-10-21T12:00:00Z");

/** Fake Graph: handlers keyed "METHOD path". Records every call. */
function fakeGraph(handlers) {
  const calls = [];
  const fetch = async (url, init) => {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/v\d+\.\d+\//, "");
    const call = { method: init.method, path, query: Object.fromEntries(u.searchParams), headers: init.headers, body: init.body };
    calls.push(call);
    const handler = handlers[`${init.method} ${path}`];
    if (!handler) return { ok: false, status: 404, json: async () => ({ error: { code: 803, message: `no handler for ${path}` } }) };
    const out = await handler(call);
    const status = out?.__status ?? (out?.error ? 400 : 200);
    return { ok: status < 400, status, json: async () => out };
  };
  return { fetch, calls };
}

// --- Fixtures (shapes as Meta returns them) ---------------------------------

const FB_POSTS = {
  data: [
    {
      id: "PAGE1_111",
      message: "VILLA À VENDRE, OUAGA 2000\nRéf VEN-023\nroogobf.com",
      permalink_url: "https://www.facebook.com/roogo/posts/111",
      full_picture: "https://scontent.example/fb111.jpg",
      created_time: "2026-10-19T19:00:00+0000",
      comments: {
        data: [
          {
            id: "111_c1",
            message: "C'est combien ?",
            from: { id: "U1", name: "Awa Ouédraogo" },
            created_time: "2026-10-21T08:30:00+0000",
            permalink_url: "https://www.facebook.com/roogo/posts/111?comment_id=c1",
          },
          {
            id: "111_c2",
            message: "Disponible ?",
            from: { id: "U2", name: "Issa Kaboré" },
            created_time: "2026-10-20T10:00:00+0000",
            comments: { data: [{ from: { id: "PAGE1" }, created_time: "2026-10-20T11:00:00+0000" }] },
          },
          { id: "111_c3", message: "Merci à tous", from: { id: "PAGE1", name: "Roogo" }, created_time: "2026-10-20T12:00:00+0000" },
          // Without pages_read_user_content Meta drops `from`.
          { id: "111_c4", message: "Intéressé", created_time: "2026-10-21T09:00:00+0000" },
        ],
      },
    },
  ],
};

const IG_MEDIA = {
  username: "roogo.burkina",
  id: "IG1",
  media: {
    data: [
      {
        id: "M1",
        caption: "Maison à louer à Tanghin. LOC 7. Appel ou WhatsApp",
        permalink: "https://www.instagram.com/reel/abc/",
        media_type: "VIDEO",
        media_url: "https://video.example/m1.mp4",
        thumbnail_url: "https://scontent.example/m1.jpg",
        timestamp: "2026-10-18T19:00:00+0000",
        comments: {
          data: [
            { id: "C1", text: "Prix svp", username: "fatim_b", from: { id: "X9", username: "fatim_b" }, timestamp: "2026-10-21T07:00:00+0000" },
            {
              id: "C2",
              text: "Toujours libre ?",
              username: "moussa226",
              timestamp: "2026-10-20T07:00:00+0000",
              replies: { data: [{ id: "R1", username: "roogo.burkina", timestamp: "2026-10-20T08:00:00+0000" }] },
            },
            { id: "C3", text: "Écrivez-nous en DM", username: "roogo.burkina", timestamp: "2026-10-20T09:00:00+0000" },
          ],
        },
      },
    ],
  },
};

const CONVERSATIONS_IG = {
  data: [
    {
      id: "CONV1",
      updated_time: "2026-10-21T10:00:00+0000",
      participants: { data: [{ id: "IGSID9", username: "salimata.k" }, { id: "IG1", username: "roogo.burkina" }] },
      messages: {
        data: [
          { id: "m3", message: "Je cherche une maison à Ouaga 2000, VEN-23 est encore là ?", from: { id: "IGSID9", username: "salimata.k" }, created_time: "2026-10-21T10:00:00+0000" },
          { id: "m2", message: "Bonjour, oui", from: { id: "IG1", username: "roogo.burkina" }, created_time: "2026-10-21T09:00:00+0000" },
          { id: "m1", message: "Bonjour", from: { id: "IGSID9", username: "salimata.k" }, created_time: "2026-10-21T08:00:00+0000" },
        ],
      },
    },
    {
      id: "CONV2",
      updated_time: "2026-10-19T10:00:00+0000",
      participants: { data: [{ id: "IGSID8", username: "boureima" }, { id: "IG1" }] },
      messages: {
        data: [
          { id: "n2", message: "Merci, on vous rappelle", from: { id: "IG1" }, created_time: "2026-10-19T10:00:00+0000" },
          { id: "n1", message: "Bonsoir, la parcelle ?", from: { id: "IGSID8", username: "boureima" }, created_time: "2026-10-19T09:00:00+0000" },
        ],
      },
    },
    // Only our own message: nothing to answer.
    { id: "CONV3", messages: { data: [{ id: "o1", message: "Promo", from: { id: "IG1" }, created_time: "2026-10-18T09:00:00+0000" }] } },
  ],
};

// --- Listing reference -----------------------------------------------------------

test("listing reference: VEN-/LOC- codes in captions and texts", () => {
  assert.equal(extractListingReference("Réf VEN-023, roogobf.com"), "VEN-023");
  assert.equal(extractListingReference("maison loc 7 à Tanghin"), "LOC-007");
  assert.equal(extractListingReference("VEN023"), "VEN-023");
  assert.equal(extractListingReference("ven-1234"), "VEN-1234");
  assert.equal(extractListingReference("PREVENT-12 et SLOC-4"), null);
  assert.equal(extractListingReference("", null, undefined, "puis LOC-015"), "LOC-015");
  assert.equal(extractListingReference("Prix svp"), null);
});

// --- 24-hour window ---------------------------------------------------------------------

test("24-hour window: open, closing soon, closed, unknown", () => {
  const open = messagingWindow("2026-10-21T08:00:00Z", NOW);
  assert.equal(open.open, true);
  assert.equal(open.closesAt, "2026-10-22T08:00:00.000Z");
  assert.equal(windowLabel(open), "Encore 20 h pour répondre");
  assert.equal(windowLabel(messagingWindow("2026-10-20T12:30:00Z", NOW)), "Encore 30 min pour répondre");
  const human = messagingWindow("2026-10-20T11:59:59Z", NOW);
  assert.equal(human.open, true);
  assert.equal(human.humanAgent, true);
  assert.equal(windowLabel(human), "Encore 6 j pour répondre (agent humain)");
  const closed = messagingWindow("2026-10-14T11:59:59Z", NOW);
  assert.equal(closed.open, false);
  assert.equal(windowLabel(closed), null);
  assert.equal(messagingWindow(null, NOW).open, false);
  assert.equal(messagingWindow("pas une date", NOW).open, false);
});

test("reply block reasons: window, missing recipient, TikTok, comments are always open", () => {
  assert.equal(replyBlockReason({ network: "instagram", kind: "message", authorId: "A", lastUserMessageAt: "2026-10-19T10:00:00Z" }, NOW), null, "human agent window");
  assert.equal(replyBlockReason({ network: "instagram", kind: "message", authorId: "A", lastUserMessageAt: "2026-10-13T10:00:00Z" }, NOW), WINDOW_CLOSED_MESSAGE);
  assert.equal(
    replyBlockReason({ network: "facebook", kind: "message", authorId: "A", lastUserMessageAt: "2026-10-13T10:00:00Z" }, NOW),
    WINDOW_CLOSED_MESSAGE_FACEBOOK,
  );
  assert.equal(replyBlockReason({ network: "instagram", kind: "message", authorId: "A", lastUserMessageAt: "2026-10-21T10:00:00Z" }, NOW), null);
  assert.match(replyBlockReason({ network: "instagram", kind: "message", authorId: null, lastUserMessageAt: "2026-10-21T10:00:00Z" }, NOW), /destinataire/);
  assert.match(replyBlockReason({ network: "tiktok", kind: "comment" }, NOW), /TikTok/);
  assert.equal(replyBlockReason({ network: "facebook", kind: "comment" }, NOW), null);
  assert.equal(WINDOW_CLOSED_MESSAGE, "Fenêtre de 7 jours dépassée : répondez sur Instagram directement");
});

test("reply text: trimmed, required, bounded", () => {
  assert.deepEqual(cleanReplyText("  Bonjour, oui il est libre  "), { text: "Bonjour, oui il est libre", error: null });
  assert.equal(cleanReplyText("   ").error, "Écrivez une réponse.");
  assert.equal(cleanReplyText(42).error, "Écrivez une réponse.");
  assert.match(cleanReplyText("a".repeat(2001)).error, /2000/);
});

test("open on network: the permalink first, then a sensible inbox", () => {
  assert.equal(openOnNetworkUrl({ network: "facebook", kind: "message", permalink: "https://www.facebook.com/x" }), "https://www.facebook.com/x");
  assert.equal(openOnNetworkUrl({ network: "instagram", kind: "message" }), "https://www.instagram.com/direct/inbox/");
  assert.equal(openOnNetworkUrl({ network: "facebook", kind: "message" }, "PAGE1"), "https://business.facebook.com/latest/inbox/all?asset_id=PAGE1");
});

// --- Status transitions -------------------------------------------------------------------

test("manual status actions", () => {
  assert.deepEqual(applyStatusAction("a_repondre", "mark_replied"), { status: "repondu", error: null });
  assert.deepEqual(applyStatusAction("ignore", "mark_replied"), { status: "repondu", error: null });
  assert.equal(applyStatusAction("repondu", "mark_replied").status, null);
  assert.deepEqual(applyStatusAction("a_repondre", "ignore"), { status: "ignore", error: null });
  assert.equal(applyStatusAction("repondu", "ignore").status, null);
  assert.deepEqual(applyStatusAction("ignore", "reopen"), { status: "a_repondre", error: null });
  assert.deepEqual(applyStatusAction("repondu", "reopen"), { status: "a_repondre", error: null });
  assert.equal(applyStatusAction("a_repondre", "reopen").status, null);
  assert.equal(applyStatusAction("a_repondre", "delete").error, "Action inconnue.");
});

test("status after sync: new items, team choices kept, new messages reopen", () => {
  // New.
  assert.deepEqual(statusAfterSync(null, { kind: "comment", repliedByUs: false, lastUserMessageAt: null }), { status: "a_repondre", repliedExternally: false });
  assert.deepEqual(statusAfterSync(null, { kind: "comment", repliedByUs: true, lastUserMessageAt: null }), { status: "repondu", repliedExternally: true });
  // Ignored comment stays ignored.
  const ignored = { status: "ignore", last_user_message_at: null, replied_at: null };
  assert.equal(statusAfterSync(ignored, { kind: "comment", repliedByUs: false, lastUserMessageAt: null }).status, "ignore");
  // Answered in the Meta apps.
  const waiting = { status: "a_repondre", last_user_message_at: "2026-10-21T08:00:00Z", replied_at: null };
  assert.deepEqual(statusAfterSync(waiting, { kind: "message", repliedByUs: true, lastUserMessageAt: "2026-10-21T08:00:00Z" }), { status: "repondu", repliedExternally: true });
  // A new message from the person reopens, even an ignored conversation.
  const answered = { status: "repondu", last_user_message_at: "2026-10-21T08:00:00Z", replied_at: "2026-10-21T08:10:00Z" };
  assert.equal(statusAfterSync(answered, { kind: "message", repliedByUs: false, lastUserMessageAt: "2026-10-21T10:00:00Z" }).status, "a_repondre");
  assert.equal(statusAfterSync({ ...answered, status: "ignore" }, { kind: "message", repliedByUs: false, lastUserMessageAt: "2026-10-21T10:00:00Z" }).status, "a_repondre");
  // Same last message: unchanged.
  assert.equal(statusAfterSync(answered, { kind: "message", repliedByUs: false, lastUserMessageAt: "2026-10-21T08:00:00Z" }).status, "repondu");
});

// --- Parsing -----------------------------------------------------------------------------------

test("Facebook comments: page's own skipped, answered detected, hidden author kept", () => {
  const items = parseFacebookComments(FB_POSTS, "PAGE1");
  assert.deepEqual(items.map((i) => i.externalId), ["111_c1", "111_c2", "111_c4"]);
  const [c1, c2, c4] = items;
  assert.equal(c1.authorName, "Awa Ouédraogo");
  assert.equal(c1.at, "2026-10-21T08:30:00.000Z");
  assert.equal(c1.listingReference, "VEN-023");
  assert.equal(c1.post.thumbnail, "https://scontent.example/fb111.jpg");
  assert.equal(c1.post.caption.includes("\n"), false);
  assert.equal(c1.permalink, "https://www.facebook.com/roogo/posts/111?comment_id=c1");
  assert.equal(c1.repliedByUs, false);
  assert.equal(c2.repliedByUs, true);
  assert.equal(c2.permalink, "https://www.facebook.com/roogo/posts/111");
  assert.equal(c4.authorName, "Personne sur Facebook");
  assert.equal(c4.authorId, null);
  assert.deepEqual(parseFacebookComments({}, "PAGE1"), []);
  assert.deepEqual(parseFacebookComments(null, "PAGE1"), []);
});

test("Instagram comments: own account skipped, replies detected, video thumbnail", () => {
  const items = parseInstagramComments(IG_MEDIA, "IG1");
  assert.deepEqual(items.map((i) => i.externalId), ["C1", "C2"]);
  assert.equal(items[0].authorName, "@fatim_b");
  assert.equal(items[0].listingReference, "LOC-007");
  assert.equal(items[0].post.thumbnail, "https://scontent.example/m1.jpg");
  assert.equal(items[0].repliedByUs, false);
  assert.equal(items[1].repliedByUs, true);
});

test("conversations: last person message, 24 h start, thread oldest first, own-only skipped", () => {
  const items = parseConversations(CONVERSATIONS_IG, "instagram", ["PAGE1", "IG1"]);
  assert.deepEqual(items.map((i) => i.externalId), ["CONV1", "CONV2"]);
  const [a, b] = items;
  assert.equal(a.authorId, "IGSID9");
  assert.equal(a.authorName, "@salimata.k");
  assert.equal(a.lastUserMessageAt, "2026-10-21T10:00:00.000Z");
  assert.equal(a.repliedByUs, false);
  assert.equal(a.listingReference, "VEN-023");
  assert.deepEqual(a.messages.map((m) => [m.id, m.fromUs]), [["m1", false], ["m2", true], ["m3", false]]);
  assert.equal(b.repliedByUs, true);
  assert.equal(b.text, "Bonsoir, la parcelle ?");
  assert.equal(b.lastUserMessageAt, "2026-10-19T09:00:00.000Z");
});

test("Messenger conversation: link made absolute, empty message labelled", () => {
  const body = {
    data: [
      {
        id: "t_1",
        link: "/roogo/inbox/123",
        updated_time: "2026-10-21T11:00:00+0000",
        participants: { data: [{ id: "PSID1", name: "Adama Traoré" }, { id: "PAGE1", name: "Roogo" }] },
        messages: { data: [{ id: "x1", message: "", from: { id: "PSID1", name: "Adama Traoré" }, created_time: "2026-10-21T11:00:00+0000" }] },
      },
    ],
  };
  const [item] = parseConversations(body, "facebook", ["PAGE1", "IG1"]);
  assert.equal(item.permalink, "https://www.facebook.com/roogo/inbox/123");
  assert.equal(item.authorName, "Adama Traoré");
  assert.equal(item.text, "[Pièce jointe ou réaction]");
});

// --- Errors ---------------------------------------------------------------------------------

test("errors: permission names, token, limit, window; never a token or URL", () => {
  const perm = new InboxGraphError(10, null, 403, "(#10) Application does not have permission for this action");
  assert.equal(inboxErrorKind(perm), "permission");
  assert.match(frenchInboxError(perm, "instagram_messages"), /instagram_manage_messages/);
  assert.match(frenchInboxError(new InboxGraphError(200, null, 403, "x"), "facebook_comments"), /pages_read_user_content/);
  assert.match(frenchInboxError(new InboxGraphError(200, null, 403, "x"), "facebook_comment_reply"), /pages_manage_engagement/);
  assert.match(frenchInboxError(new InboxGraphError(10, null, 403, "x"), "facebook_message_send"), /pages_messaging/);
  assert.match(frenchInboxError(new InboxGraphError(10, null, 403, "x"), "instagram_comment_reply"), /instagram_manage_comments/);
  assert.match(frenchInboxError(new InboxGraphError(190, 463, 401, "Session has expired"), "facebook_messages"), /expiré/);
  assert.match(frenchInboxError(new InboxGraphError(4, null, 400, "Application request limit reached"), "facebook_comments"), /limite/);
  assert.equal(frenchInboxError(new InboxGraphError(10, 2018278, 400, "outside of allowed window"), "facebook_message_send"), WINDOW_CLOSED_MESSAGE_FACEBOOK);
  assert.equal(frenchInboxError(new InboxGraphError(10, 2534022, 400, "outside of allowed window"), "instagram_message_send"), WINDOW_CLOSED_MESSAGE);
  const other = frenchInboxError(new InboxGraphError(100, null, 400, "Bad https://graph.facebook.com/x?access_token=SECRET"), "facebook_comments");
  assert.doesNotMatch(other, /SECRET|https:/);
  assert.match(frenchInboxError(new Error("boom"), "facebook_comments"), /Pas de réponse/);
  for (const p of ["pages_read_user_content", "pages_manage_engagement", "pages_messaging", "instagram_manage_comments", "instagram_manage_messages", "read_insights", "business_management"]) {
    assert.ok(REQUIRED_META_PERMISSIONS.includes(p), p);
  }
  assert.match(INBOX_NOT_READY, /migration 101 à lancer/);
});

// --- Graph calls with a fake fetch -----------------------------------------------------------

test("readSource: token in the header, never in the URL; per-source failure", async () => {
  const { fetch, calls } = fakeGraph({
    "GET PAGE1/published_posts": () => FB_POSTS,
    "GET IG1": () => IG_MEDIA,
    "GET PAGE1/conversations": (call) =>
      call.query.platform === "instagram" ? CONVERSATIONS_IG : { error: { code: 10, message: "(#10) pages_messaging" }, __status: 403 },
  });
  const fbc = await readSource(fetch, cfg, "facebook_comments");
  assert.equal(fbc.ok, true);
  assert.equal(fbc.items.length, 3);
  const igc = await readSource(fetch, cfg, "instagram_comments");
  assert.equal(igc.items.length, 2);
  const igm = await readSource(fetch, cfg, "instagram_messages");
  assert.equal(igm.items.length, 2);
  const logs = [];
  const fbm = await readSource(fetch, cfg, "facebook_messages", (m, d) => logs.push([m, d]));
  assert.equal(fbm.ok, false);
  assert.match(fbm.error, /pages_messaging/);
  assert.equal(logs.length, 1);
  assert.doesNotMatch(JSON.stringify(logs), /PAGE-TOKEN-SECRET/);
  for (const c of calls) {
    assert.equal(c.headers.Authorization, "Bearer PAGE-TOKEN-SECRET");
    assert.equal(c.query.access_token, undefined);
  }
  const missing = await readSource(fetch, { ...cfg, igUserId: "" }, "instagram_comments");
  assert.equal(missing.error, "META_IG_ACCOUNT_ID manque sur le serveur.");
});

test("sendReply: Facebook and Instagram comment endpoints, Send API body, window refused locally", async () => {
  const { fetch, calls } = fakeGraph({
    "POST 111_c1/comments": () => ({ id: "111_c1_r" }),
    "POST C1/replies": () => ({ id: "R9" }),
    "POST PAGE1/messages": () => ({ recipient_id: "IGSID9", message_id: "mid.1" }),
  });
  const fb = await sendReply(fetch, cfg, { network: "facebook", kind: "comment", externalId: "111_c1", authorId: "U1", lastUserMessageAt: null }, "Bonjour", NOW);
  assert.deepEqual(fb, { ok: true, externalId: "111_c1_r" });
  assert.equal(new URLSearchParams(calls[0].body).get("message"), "Bonjour");
  const ig = await sendReply(fetch, cfg, { network: "instagram", kind: "comment", externalId: "C1", authorId: null, lastUserMessageAt: null }, "Merci", NOW);
  assert.deepEqual(ig, { ok: true, externalId: "R9" });
  const dm = await sendReply(fetch, cfg, { network: "instagram", kind: "message", externalId: "CONV1", authorId: "IGSID9", lastUserMessageAt: "2026-10-21T10:00:00Z" }, "Oui", NOW);
  assert.deepEqual(dm, { ok: true, externalId: "mid.1" });
  assert.deepEqual(JSON.parse(calls[2].body), { recipient: { id: "IGSID9" }, messaging_type: "RESPONSE", message: { text: "Oui" } });
  const tagged = await sendReply(fetch, cfg, { network: "instagram", kind: "message", externalId: "CONV3", authorId: "IGSID7", lastUserMessageAt: "2026-10-19T09:00:00Z" }, "Oui", NOW);
  assert.deepEqual(tagged, { ok: true, externalId: "mid.1" });
  assert.deepEqual(JSON.parse(calls.at(-1).body), { recipient: { id: "IGSID7" }, messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT", message: { text: "Oui" } });
  const before = calls.length;
  const late = await sendReply(fetch, cfg, { network: "instagram", kind: "message", externalId: "CONV2", authorId: "IGSID8", lastUserMessageAt: "2026-10-13T09:00:00Z" }, "Oui", NOW);
  assert.deepEqual(late, { ok: false, error: WINDOW_CLOSED_MESSAGE });
  assert.equal(calls.length, before, "no call outside the window");
});

test("sendReply: Meta refusal becomes a French error", async () => {
  const { fetch } = fakeGraph({ "POST 111_c1/comments": () => ({ error: { code: 200, message: "(#200) Permissions error" }, __status: 403 }) });
  const res = await sendReply(fetch, cfg, { network: "facebook", kind: "comment", externalId: "111_c1", authorId: null, lastUserMessageAt: null }, "Bonjour", NOW);
  assert.equal(res.ok, false);
  assert.match(res.error, /pages_manage_engagement/);
});

test("waiting sentence for the briefing", () => {
  assert.equal(waitingSentence({ comments: 3, messages: 2, total: 5 }), "3 commentaires et 2 messages attendent une réponse");
  assert.equal(waitingSentence({ comments: 1, messages: 0, total: 1 }), "1 commentaire attend une réponse");
  assert.equal(waitingSentence({ comments: 0, messages: 0, total: 0 }), null);
});
