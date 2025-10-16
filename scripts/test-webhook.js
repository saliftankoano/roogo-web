/**
 * Test script for Clerk webhook endpoint
 * Run with: node scripts/test-webhook.js
 */

import crypto from "crypto";

// Mock webhook payload for testing
const mockPayload = {
  type: "user.created",
  data: {
    id: "user_test123",
    email_addresses: [{ email_address: "test@example.com" }],
    first_name: "John",
    last_name: "Doe",
    image_url: "https://example.com/avatar.jpg",
    phone_numbers: [{ phone_number: "+1234567890" }],
    private_metadata: {
      userType: "agent",
    },
  },
};

// Create signature for testing
const webhookSecret = process.env.CLERK_WEBHOOK_SECRET || "test_secret";
const payload = JSON.stringify(mockPayload);
const signature = crypto
  .createHmac("sha256", webhookSecret)
  .update(payload)
  .digest("hex");

console.log("Test webhook payload:");
console.log("Payload:", payload);
console.log("Signature:", `v1,${signature}`);
console.log("\nTo test your webhook:");
console.log("1. Set CLERK_WEBHOOK_SECRET in your .env file");
console.log("2. Start your server: npm run dev");
console.log(
  "3. Send a POST request to http://localhost:3000/api/clerk/webhook"
);
console.log("4. Use the signature above in the svix-signature header");
