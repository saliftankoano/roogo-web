import type { NotificationCopyKey } from "@/lib/notification-copy";

export interface DailyBookingApprovalNotification {
  copyKey: NotificationCopyKey;
  data: {
    type: "daily_booking_request_approved";
    dailyBookingRequestId: string;
    propertyId: string;
  };
}

export function buildDailyBookingApprovalNotification(input: {
  isHotelBooking: boolean;
  requestId: string;
  propertyId: string;
}): DailyBookingApprovalNotification {
  return {
    copyKey: input.isHotelBooking
      ? "dailyBookings.requestApprovedRenterHotel"
      : "dailyBookings.requestApprovedRenter",
    data: {
      type: "daily_booking_request_approved",
      dailyBookingRequestId: input.requestId,
      propertyId: input.propertyId,
    },
  };
}
