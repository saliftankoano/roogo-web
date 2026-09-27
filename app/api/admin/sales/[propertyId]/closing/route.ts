import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { getStaffOrFounder } from "@/lib/api-auth";
import {
  buildClosingRow,
  bypassWindowEnd,
  closingTransition,
  type SaleClosingAction,
  type SaleClosingState,
} from "@/lib/sale-closing";
import { priceLadder } from "@/lib/sale-economics";
import {
  getSignedV3MandateForProperty,
  mandateEconomicsSnapshot,
} from "@/lib/sale-mandate";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Roogo Sell v3 closing for one property (sale_closings, migration 075).
// Staff record the final price, buyer and referrers; the split is computed here,
// never trusted from the client. Between the hard and team floors only the
// founder can approve. Admin web only (Clerk session), so not in isPublicRoute.
//
// Contains buyer PII: never log request bodies or rows.

type Params = { params: Promise<{ propertyId: string }> };

const CLOSING_ACTIONS: SaleClosingAction[] = [
  "approve",
  "notarize",
  "mark_paid",
  "settle",
  "cancel",
];

async function loadContext(propertyId: string) {
  const mandate = await getSignedV3MandateForProperty(propertyId);
  const snapshot = mandate ? mandateEconomicsSnapshot(mandate) : null;
  const net = Number(mandate?.seller_net_price);
  return mandate && snapshot && net > 0 && mandate.signed_at
    ? { mandate, snapshot, net, signedAt: new Date(mandate.signed_at) }
    : null;
}

async function loadLiveClosing(propertyId: string) {
  const { data, error } = await supabaseAdmin
    .from("sale_closings")
    .select("*")
    .eq("property_id", propertyId)
    .neq("status", "cancelled")
    .maybeSingle();
  if (error) throw error;
  return data as (Record<string, unknown> & SaleClosingState & { id: string }) | null;
}

async function isClerkFounder() {
  const clerkUser = await currentUser();
  const type =
    clerkUser?.publicMetadata?.userType ?? clerkUser?.publicMetadata?.user_type;
  return type === "founder";
}

function str(value: unknown, max = 200) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

// GET: mandate economics, ladder, live closing and Roogo-introduced buyers.
export async function GET(req: Request, { params }: Params) {
  const user = await getStaffOrFounder(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { propertyId } = await params;
  try {
    const context = await loadContext(propertyId);
    const [closing, visits] = await Promise.all([
      loadLiveClosing(propertyId),
      supabaseAdmin
        .from("visit_requests")
        .select("buyer_id, created_at, buyer:buyer_id ( id, full_name, phone )")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: true }),
    ]);
    if (visits.error) throw visits.error;

    // One entry per introduced buyer (first visit request = introduction date).
    const introducedBuyers = new Map<
      string,
      { id: string; fullName: string | null; phone: string | null; introducedAt: string }
    >();
    for (const row of (visits.data ?? []) as unknown as {
      buyer_id: string;
      created_at: string;
      buyer: { full_name: string | null; phone: string | null } | null;
    }[]) {
      if (introducedBuyers.has(row.buyer_id)) continue;
      introducedBuyers.set(row.buyer_id, {
        id: row.buyer_id,
        fullName: row.buyer?.full_name ?? null,
        phone: row.buyer?.phone ?? null,
        introducedAt: row.created_at,
      });
    }

    return NextResponse.json({
      success: true,
      mandate: context
        ? {
            id: context.mandate.id,
            sellerNetPrice: context.net,
            signedAt: context.mandate.signed_at,
            status: context.mandate.status,
            snapshot: context.snapshot,
            bypassUntil: bypassWindowEnd(
              context.signedAt,
              context.snapshot.bypassMonths,
            ).toISOString(),
          }
        : null,
      ladder: context ? priceLadder(context.net, context.snapshot) : null,
      closing,
      introducedBuyers: [...introducedBuyers.values()],
      isFounder: await isClerkFounder(),
    });
  } catch (error) {
    console.error(
      "GET sale closing:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({ error: "Failed to load closing" }, { status: 500 });
  }
}

// PUT: create or edit the live closing (draft). Editing an approved closing
// sends it back to draft and clears the approval.
export async function PUT(req: Request, { params }: Params) {
  const user = await getStaffOrFounder(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { propertyId } = await params;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const context = await loadContext(propertyId);
    if (!context) {
      return NextResponse.json(
        { error: "no_signed_v3_mandate" },
        { status: 409 },
      );
    }

    const buyerUserId = str(body.buyerUserId, 64);
    const isBypass = body.isBypass === true;
    let buyerIntroduced = false;
    if (buyerUserId) {
      const { count, error } = await supabaseAdmin
        .from("visit_requests")
        .select("id", { count: "exact", head: true })
        .eq("property_id", propertyId)
        .eq("buyer_id", buyerUserId);
      if (error) throw error;
      buyerIntroduced = (count ?? 0) > 0;
    }

    const soldAtRaw = str(body.soldAt, 40);
    const soldAt = soldAtRaw ? new Date(soldAtRaw) : new Date();
    if (Number.isNaN(soldAt.getTime())) {
      return NextResponse.json({ error: "invalid_date" }, { status: 400 });
    }

    const built = buildClosingRow(
      {
        finalPrice: Number(body.finalPrice),
        buyerUserId,
        buyerName: str(body.buyerName),
        buyerPhone: str(body.buyerPhone, 40),
        buyerReferred: body.buyerReferred === true,
        sellerReferred: body.sellerReferred === true,
        buyerReferrerLabel: str(body.buyerReferrerLabel),
        sellerReferrerLabel: str(body.sellerReferrerLabel),
        isBypass,
        soldAt,
        notes: str(body.notes, 2000),
      },
      {
        id: context.mandate.id,
        propertyId,
        sellerNetPrice: context.net,
        signedAt: context.signedAt,
        snapshot: context.snapshot,
      },
      { buyerIntroduced },
    );
    if (!built.ok) {
      return NextResponse.json({ error: built.reason }, { status: 400 });
    }

    const live = await loadLiveClosing(propertyId);
    if (live && live.status !== "draft" && live.status !== "approved") {
      return NextResponse.json({ error: "closing_locked" }, { status: 409 });
    }

    const result = live
      ? await supabaseAdmin
          .from("sale_closings")
          .update(built.row)
          .eq("id", live.id)
          .in("status", ["draft", "approved"])
          .select("*")
          .maybeSingle()
      : await supabaseAdmin
          .from("sale_closings")
          .insert({ ...built.row, created_by: user.id })
          .select("*")
          .single();
    if (result.error) throw result.error;
    if (!result.data) {
      return NextResponse.json({ error: "closing_locked" }, { status: 409 });
    }
    return NextResponse.json({ success: true, closing: result.data });
  } catch (error) {
    console.error(
      "PUT sale closing:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({ error: "Failed to save closing" }, { status: 500 });
  }
}

// POST: status actions { action: approve | notarize | mark_paid | settle | cancel }.
export async function POST(req: Request, { params }: Params) {
  const user = await getStaffOrFounder(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { propertyId } = await params;
  try {
    const body = (await req.json().catch(() => ({}))) as { action?: unknown };
    const action = CLOSING_ACTIONS.find((a) => a === body.action);
    if (!action) {
      return NextResponse.json({ error: "invalid_action" }, { status: 400 });
    }
    const live = await loadLiveClosing(propertyId);
    if (!live) {
      return NextResponse.json({ error: "no_closing" }, { status: 404 });
    }

    const isFounder = user.user_type === "founder" && (await isClerkFounder());
    const transition = closingTransition(
      live,
      action,
      { userId: user.id, isFounder },
      new Date(),
    );
    if (!transition.ok) {
      return NextResponse.json(
        { error: transition.reason },
        { status: transition.reason === "founder_approval_required" ? 403 : 409 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("sale_closings")
      .update(transition.patch)
      .eq("id", live.id)
      .eq("status", transition.expectedStatus)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "stale_closing" }, { status: 409 });
    }
    return NextResponse.json({ success: true, closing: data });
  } catch (error) {
    console.error(
      "POST sale closing:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({ error: "Failed to update closing" }, { status: 500 });
  }
}
