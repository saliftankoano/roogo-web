import { NextResponse } from "next/server";

/**
 * Test endpoint to verify webhook functionality
 * This endpoint can be used to test the webhook logic without Clerk
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    console.log("Test webhook called with:", JSON.stringify(body, null, 2));

    // Simulate a user.updated event with the new secure structure
    const mockEvent = {
      type: "user.updated",
      data: {
        id: "user_test123",
        email_addresses: [{ email_address: "test@example.com" }],
        first_name: "Test",
        last_name: "User",
        image_url: "https://example.com/avatar.jpg",
        phone_numbers: [{ phone_number: "+1234567890" }],
        public_metadata: {
          userType: "agent",
        },
        private_metadata: {
          sex: "Masculin",
        },
        unsafe_metadata: {},
      },
    };

    console.log("Mock event created:", JSON.stringify(mockEvent, null, 2));

    return NextResponse.json({
      success: true,
      message: "Test webhook processed",
      receivedData: body,
      mockEvent,
    });
  } catch (error) {
    console.error("Test webhook error:", error);
    return NextResponse.json(
      {
        error: "Test webhook failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Test webhook endpoint is working",
    timestamp: new Date().toISOString(),
  });
}
