import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser, isStaffOrFounder } from "@/lib/api-auth";
import { getHotelMembershipForProperty } from "@/lib/hotel-auth";
import { DESK_PAID_STATUSES } from "@/lib/hotel-desk";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse("Unauthorized", 401, req);

    const { data: requestRow, error: fetchError } = await supabaseAdmin
      .from("daily_booking_requests")
      .select(
        "*, renter:renter_id(id, full_name, phone), room_type:room_type_id(id, name), property:property_id(id, quartier, city, address, hotel_id, hotels:hotel_id(id, name, city, phone))",
      )
      .eq("id", id)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!requestRow) return errorResponse("Booking not found", 404, req);

    const isRenter = requestRow.renter_id === user.id;
    const isOwner = requestRow.owner_id === user.id;
    let isHotelMember = false;
    if (!isRenter && !isOwner && !isStaffOrFounder(user)) {
      isHotelMember = !!(await getHotelMembershipForProperty(
        user.id,
        requestRow.property_id,
      ));
    }
    if (!isRenter && !isOwner && !isStaffOrFounder(user) && !isHotelMember) {
      return errorResponse("Forbidden", 403, req);
    }

    if (!DESK_PAID_STATUSES.has(String(requestRow.status))) {
      return errorResponse("This booking has no receipt yet", 409, req);
    }

    const property = requestRow.property ?? {};
    const hotel = property?.hotels ?? null;
    const renter = requestRow.renter ?? {};
    const roomType = requestRow.room_type ?? null;

    return cors(
      NextResponse.json({
        receipt: {
          bookingId: requestRow.id,
          bookingCode: requestRow.booking_code ?? null,
          hotel: hotel
            ? {
                name: hotel.name,
                city: hotel.city ?? null,
                phone: hotel.phone ?? null,
              }
            : null,
          property: {
            quartier: property.quartier ?? null,
            city: property.city ?? null,
            address: property.address ?? null,
          },
          guest: {
            fullName: renter.full_name ?? null,
            phone: renter.phone ?? null,
          },
          roomTypeName: roomType?.name ?? null,
          startDate: requestRow.start_date,
          endDate: requestRow.end_date,
          nights: requestRow.nights,
          guestCount: requestRow.guest_count,
          nightlyRate: requestRow.nightly_rate,
          stayAmount: requestRow.stay_amount,
          cautionAmount: requestRow.caution_amount,
          renterServiceFeeAmount: requestRow.renter_service_fee_amount,
          totalAmount: requestRow.total_amount,
          currency: requestRow.currency || "XOF",
          paidAt: requestRow.paid_at,
          transactionId: requestRow.transaction_id,
        },
      }),
      req,
    );
  } catch (error) {
    console.error("Error building booking receipt:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
