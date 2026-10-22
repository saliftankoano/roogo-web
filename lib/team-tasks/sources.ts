// Automatic briefing items, computed at read time from tables that already
// exist on main. Nothing here is copied into staff_tasks: an item disappears
// when its own record says the work is done (a support thread is read, a
// visit request is confirmed), or when someone ticks it (only for items whose
// source has no status of its own, see `canCheck`).
//
// An item is given to the person the source already names. When the source
// names nobody, the item has ownerId null and lands in "Sans responsable".
// No assignment columns were added to these tables.
//
// To add a source (for example Studio publications once that branch merges),
// write a TaskSource and add it to TASK_SOURCES. Keys must be stable for the
// same piece of work, and change when new work arrives on the same record
// (see the support source, which includes the last message time).

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  capitalize,
  dayKey,
  timeOf,
  type BriefingItem,
  type WeekBounds,
} from "./core";

export type SourceContext = {
  now: Date;
  todayKey: string;
  week: WeekBounds;
  /** Supabase ids of current staff and founders. Anyone else named by a source counts as nobody. */
  staffIds: Set<string>;
};

export type TaskSource = {
  id: string;
  load: (ctx: SourceContext) => Promise<BriefingItem[]>;
};

type Joined<T> = T | T[] | null | undefined;
function one<T>(value: Joined<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

type PropertyBits = {
  id?: string;
  property_type?: string | null;
  quartier?: string | null;
  city?: string | null;
  reference?: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  villa: "Villa",
  appartement: "Appartement",
  maison: "Maison",
  terrain: "Terrain",
  commercial: "Local commercial",
  "célibatorium": "Célibatorium",
  hotel: "Hôtel",
};

export function propertyLabel(property: PropertyBits | null): string {
  if (!property) return "annonce";
  const type = property.property_type
    ? (TYPE_LABELS[property.property_type] ?? capitalize(property.property_type))
    : "Bien";
  const place = property.quartier || property.city;
  const base = place ? `${type}, ${place}` : type;
  return property.reference ? `${base} (${property.reference})` : base;
}

function ownerOrNobody(id: string | null | undefined, ctx: SourceContext): string | null {
  return id && ctx.staffIds.has(id) ? id : null;
}

function preview(text: string | null | undefined, max = 90) {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function base(overrides: Partial<BriefingItem> & Pick<BriefingItem, "key" | "title" | "dueDate">): BriefingItem {
  return {
    origin: "auto",
    taskId: null,
    sourceKey: overrides.key,
    kindLabel: "Tâche",
    tone: "grey",
    sub: "",
    ownerId: null,
    fromId: null,
    fromName: null,
    dueTime: null,
    timeMode: "asap",
    status: "a_faire",
    completedAt: null,
    href: null,
    actionLabel: "Ouvrir",
    canCheck: false,
    note: null,
    propertyId: null,
    visitRequestId: null,
    studioProjectId: null,
    ...overrides,
  };
}

/** Never due before the start of the week, so old backlog shows as this week's work and not as a pile of "late". */
function dueFrom(iso: string | null | undefined, ctx: SourceContext) {
  if (!iso) return ctx.todayKey;
  const key = dayKey(new Date(iso));
  return key < ctx.week.startKey ? ctx.week.startKey : key;
}

// Sale visit requests: "requested" has no owner yet (staff confirm one of
// three slots, which records assigned_staff_id). Confirmed visits this week go
// to the staff member who confirmed them. The table has no "visit happened"
// status, so a confirmed visit can be ticked.
const visitRequests: TaskSource = {
  id: "visit_requests",
  async load(ctx) {
    const select = `id, status, scheduled_at, assigned_staff_id, created_at, property_id,
      buyer:buyer_id ( full_name ),
      property:property_id ( id, property_type, quartier, city, reference )`;
    const [requested, confirmed] = await Promise.all([
      supabaseAdmin.from("visit_requests").select(select).eq("status", "requested")
        .order("created_at", { ascending: true }).limit(50),
      supabaseAdmin.from("visit_requests").select(select).eq("status", "confirmed")
        .gte("scheduled_at", ctx.week.start.toISOString())
        .lt("scheduled_at", ctx.week.endExclusive.toISOString())
        .limit(100),
    ]);
    if (requested.error) throw requested.error;
    if (confirmed.error) throw confirmed.error;
    const items: BriefingItem[] = [];
    for (const row of requested.data ?? []) {
      const buyer = one(row.buyer as Joined<{ full_name: string | null }>);
      items.push(base({
        key: `visit-request:${row.id}`,
        kindLabel: "Visite",
        tone: "blue",
        title: `Confirmer une visite, ${propertyLabel(one(row.property as Joined<PropertyBits>))}`,
        sub: `${buyer?.full_name || "Un acheteur"} propose 3 créneaux`,
        dueDate: dueFrom(row.created_at, ctx),
        href: "/admin/demandes-de-visite",
        actionLabel: "Choisir un créneau",
        propertyId: row.property_id,
        visitRequestId: row.id,
      }));
    }
    for (const row of confirmed.data ?? []) {
      if (!row.scheduled_at) continue;
      const when = new Date(row.scheduled_at);
      const buyer = one(row.buyer as Joined<{ full_name: string | null }>);
      items.push(base({
        key: `visit:${row.id}`,
        kindLabel: "Visite",
        tone: "blue",
        title: `Visite, ${propertyLabel(one(row.property as Joined<PropertyBits>))}`,
        sub: `Avec ${buyer?.full_name || "l’acheteur"} · visite confirmée`,
        ownerId: ownerOrNobody(row.assigned_staff_id, ctx),
        dueDate: dayKey(when),
        dueTime: timeOf(when),
        timeMode: "at",
        href: "/admin/demandes-de-visite",
        actionLabel: "Ouvrir la visite",
        canCheck: true,
        propertyId: row.property_id,
        visitRequestId: row.id,
      }));
    }
    return items;
  },
};

// Notary meetings this week, for the staff member who scheduled them. There is
// no route that sets "completed", so the meeting can be ticked here.
const notaryMeetings: TaskSource = {
  id: "notary_meetings",
  async load(ctx) {
    const { data, error } = await supabaseAdmin
      .from("notary_meetings")
      .select(`id, scheduled_at, assigned_staff_id, location_label, property_id, notary_name,
        property:property_id ( id, property_type, quartier, city, reference )`)
      .eq("status", "scheduled")
      .gte("scheduled_at", ctx.week.start.toISOString())
      .lt("scheduled_at", ctx.week.endExclusive.toISOString())
      .limit(50);
    if (error) throw error;
    return (data ?? []).map((row) => {
      const when = new Date(row.scheduled_at);
      return base({
        key: `notary:${row.id}`,
        kindLabel: "Notaire",
        tone: "orange",
        title: `Rendez-vous notaire, ${propertyLabel(one(row.property as Joined<PropertyBits>))}`,
        sub: [row.notary_name, row.location_label].filter(Boolean).join(" · "),
        ownerId: ownerOrNobody(row.assigned_staff_id, ctx),
        dueDate: dayKey(when),
        dueTime: timeOf(when),
        timeMode: "at",
        href: "/admin/discussions-vente",
        actionLabel: "Ouvrir la discussion",
        canCheck: true,
        propertyId: row.property_id,
      });
    });
  },
};

// Support threads with unread user messages. assigned_to_staff_id is set to
// the last staff member who replied; a thread nobody has answered yet goes to
// "Sans responsable". Done when the thread is read (its own status).
const supportThreads: TaskSource = {
  id: "support_conversations",
  async load(ctx) {
    const { data, error } = await supabaseAdmin
      .from("support_conversations")
      .select("id, assigned_to_staff_id, last_message_at, last_message_preview, unread_for_staff, user:user_id ( full_name )")
      .eq("status", "open")
      .gt("unread_for_staff", 0)
      .order("last_message_at", { ascending: true })
      .limit(50);
    if (error) throw error;
    return (data ?? []).map((row) => {
      const user = one(row.user as Joined<{ full_name: string | null }>);
      const count = row.unread_for_staff as number;
      return base({
        key: `support:${row.id}:${row.last_message_at ?? ""}`,
        kindLabel: "Support",
        tone: "grey",
        title: `Répondre à ${user?.full_name || "un utilisateur"}`,
        sub: [count > 1 ? `${count} messages` : "1 message", preview(row.last_message_preview)].filter(Boolean).join(" · "),
        ownerId: ownerOrNobody(row.assigned_to_staff_id, ctx),
        dueDate: dueFrom(row.last_message_at, ctx),
        href: "/admin/assistance",
        actionLabel: "Répondre",
      });
    });
  },
};

// Sale threads (sellers and buyers) with unread messages. staff_id records who
// first picked the thread up; never-answered threads have none.
const saleThreads: TaskSource = {
  id: "sale_conversations",
  async load(ctx) {
    const { data, error } = await supabaseAdmin
      .from("sale_conversations")
      .select(`id, kind, staff_id, last_message_at, last_message_preview, unread_for_staff, property_id,
        user:user_id ( full_name ),
        property:property_id ( id, property_type, quartier, city, reference )`)
      .eq("status", "open")
      .gt("unread_for_staff", 0)
      .order("last_message_at", { ascending: true })
      .limit(50);
    if (error) throw error;
    return (data ?? []).map((row) => {
      const user = one(row.user as Joined<{ full_name: string | null }>);
      const who = row.kind === "seller" ? "le vendeur" : "l’acheteur";
      return base({
        key: `sale-chat:${row.id}:${row.last_message_at ?? ""}`,
        kindLabel: "Vente",
        tone: "orange",
        title: `Répondre à ${user?.full_name || who}, ${propertyLabel(one(row.property as Joined<PropertyBits>))}`,
        sub: preview(row.last_message_preview) || `Message de ${who}`,
        ownerId: ownerOrNobody(row.staff_id, ctx),
        dueDate: dueFrom(row.last_message_at, ctx),
        href: "/admin/discussions-vente",
        actionLabel: "Répondre",
        propertyId: row.property_id,
      });
    });
  },
};

// Owner or agent answers to a property request ("appel à biens") that nobody
// has looked at yet. The staff member who created the request is responsible
// for it (property_requests.created_by is staff-only). Done when the response
// leaves "submitted" (its own status).
const propertyRequestResponses: TaskSource = {
  id: "property_request_responses",
  async load(ctx) {
    const { data, error } = await supabaseAdmin
      .from("property_request_responses")
      .select("id, request_id, created_at, neighborhood, city, request:request_id ( title, created_by )")
      .eq("status", "submitted")
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) throw error;
    return (data ?? []).map((row) => {
      const request = one(row.request as Joined<{ title: string; created_by: string }>);
      return base({
        key: `request-response:${row.id}`,
        kindLabel: "Demande de bien",
        tone: "blue",
        title: `Nouvelle proposition : ${request?.title ?? "appel à biens"}`,
        sub: [row.neighborhood, row.city].filter(Boolean).join(", "),
        ownerId: ownerOrNobody(request?.created_by, ctx),
        dueDate: dueFrom(row.created_at, ctx),
        href: `/admin/demandes-de-biens/${row.request_id}`,
        actionLabel: "Voir la proposition",
      });
    });
  },
};

function waitingSince(iso: string, ctx: SourceContext) {
  const key = dayKey(new Date(iso));
  if (key === ctx.todayKey) return "Arrivé aujourd’hui";
  const [, month, day] = key.split("-");
  return `Le plus ancien attend depuis le ${day}/${month}`;
}

// Review queues with no reviewer until someone decides: one item per queue,
// in "Sans responsable". The key includes the day so a queue given to someone
// today comes back tomorrow if it is still not empty.
function queueSource(params: {
  id: string;
  table: string;
  statusColumn?: string;
  status: string;
  dateColumn: string;
  title: (count: number) => string;
  kindLabel: string;
  href: string;
}): TaskSource {
  return {
    id: params.id,
    async load(ctx) {
      const { data, error, count } = await supabaseAdmin
        .from(params.table)
        .select(params.dateColumn, { count: "exact" })
        .eq(params.statusColumn ?? "status", params.status)
        .order(params.dateColumn, { ascending: true })
        .limit(1);
      if (error) throw error;
      const total = count ?? 0;
      if (!total) return [];
      const oldest = (data?.[0] as unknown as Record<string, string> | undefined)?.[params.dateColumn];
      return [base({
        key: `queue:${params.id}:${ctx.todayKey}`,
        kindLabel: params.kindLabel,
        tone: "blue",
        title: params.title(total),
        sub: oldest ? waitingSince(oldest, ctx) : "",
        dueDate: ctx.todayKey,
        href: params.href,
        actionLabel: "Ouvrir la file",
      })];
    },
  };
}

const ownershipQueue = queueSource({
  id: "ownership",
  table: "property_ownership_submissions",
  status: "pending",
  dateColumn: "submitted_at",
  kindLabel: "Documents",
  title: (n) => (n > 1 ? `${n} dossiers de propriété à vérifier` : "1 dossier de propriété à vérifier"),
  href: "/admin/verifications-propriete",
});

const identityQueue = queueSource({
  id: "identity",
  table: "identity_verification_submissions",
  status: "pending",
  dateColumn: "submitted_at",
  kindLabel: "Identité",
  title: (n) => (n > 1 ? `${n} pièces d’identité à vérifier` : "1 pièce d’identité à vérifier"),
  href: "/admin/verifications",
});

const pendingEditsQueue = queueSource({
  id: "pending_edits",
  table: "property_pending_edits",
  status: "pending",
  dateColumn: "created_at",
  kindLabel: "Modification",
  title: (n) => (n > 1 ? `${n} modifications d’annonce à valider` : "1 modification d’annonce à valider"),
  href: "/admin/modifications",
});

// Rental open-house slots from today to Saturday. Slots have no staff field,
// so they are always "Sans responsable" until someone is given one.
const openHouseSlots: TaskSource = {
  id: "open_house_slots",
  async load(ctx) {
    const { data, error } = await supabaseAdmin
      .from("open_house_slots")
      .select("id, date, start_time, property_id, property:property_id ( id, property_type, quartier, city, reference )")
      .gte("date", ctx.todayKey)
      .lte("date", ctx.week.endKey)
      .order("date", { ascending: true })
      .limit(50);
    if (error) throw error;
    return (data ?? []).map((row) => {
      const time = typeof row.start_time === "string" ? row.start_time.slice(0, 5) : null;
      return base({
        key: `open-house:${row.id}`,
        kindLabel: "Portes ouvertes",
        tone: "blue",
        title: `Portes ouvertes, ${propertyLabel(one(row.property as Joined<PropertyBits>))}`,
        sub: "Quelqu’un doit être sur place",
        dueDate: row.date,
        dueTime: time && /^\d{2}:\d{2}$/.test(time) ? time : null,
        timeMode: time ? "at" : "day",
        href: "/admin/calendrier",
        actionLabel: "Voir le calendrier",
        propertyId: row.property_id,
      });
    });
  },
};

export const TASK_SOURCES: TaskSource[] = [
  visitRequests,
  notaryMeetings,
  supportThreads,
  saleThreads,
  propertyRequestResponses,
  ownershipQueue,
  identityQueue,
  pendingEditsQueue,
  openHouseSlots,
];

/** Loads every source; one failing source never hides the others. */
export async function loadAutoItems(ctx: SourceContext): Promise<{ items: BriefingItem[]; failed: string[] }> {
  const results = await Promise.allSettled(TASK_SOURCES.map((source) => source.load(ctx)));
  const items: BriefingItem[] = [];
  const failed: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") items.push(...result.value);
    else {
      failed.push(TASK_SOURCES[index].id);
      const reason = result.reason as { message?: string; code?: string } | undefined;
      console.error(`[team-tasks] source ${TASK_SOURCES[index].id} failed`, {
        code: reason?.code,
        message: reason?.message,
      });
    }
  });
  return { items, failed };
}

