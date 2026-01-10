import { NextResponse } from "next/server";
import { verifyToken, createClerkClient } from "@clerk/backend";
import {
  ClerkUserData,
  getSupabaseClient,
  getUserByClerkId,
  createUserInSupabase,
} from "@/lib/user-sync";

interface PawaPayDepositPayload {
  depositId: string;
  payer: {
    type: "MMO";
    accountDetails: {
      phoneNumber: string;
      provider: string;
    };
  };
  amount: string;
  currency: string;
  customerMessage: string;
  preAuthorisationCode?: string;
}

export async function OPTIONS() {
  return cors(NextResponse.json({ ok: true }));
}

export async function POST(req: Request) {
  try {
    // 1. Verify Clerk Token
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace("Bearer ", "");
    if (!token) {
      return cors(
        NextResponse.json({ error: "Missing token" }, { status: 401 })
      );
    }

    let clerkUserId: string | undefined;
    try {
      const { sub } = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
      clerkUserId = sub;
    } catch (error) {
      console.error("Token verification failed:", error);
      return cors(
        NextResponse.json({ error: "Invalid token" }, { status: 401 })
      );
    }

    if (!clerkUserId) {
      return cors(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    }

    // 2. Get User from Supabase
    let user = await getUserByClerkId(clerkUserId);

    // Auto-sync if user missing
    let syncError: Error | null = null;
    if (!user) {
      console.log(
        `User ${clerkUserId} not found in Supabase. Attempting auto-sync...`
      );
      try {
        const clerkClient = createClerkClient({
          secretKey: process.env.CLERK_SECRET_KEY,
        });
        const clerkUser = await clerkClient.users.getUser(clerkUserId);

        const userData: ClerkUserData = {
          id: clerkUser.id,
          email_addresses: clerkUser.emailAddresses.map((e) => ({
            email_address: e.emailAddress,
          })),
          first_name: clerkUser.firstName || undefined,
          last_name: clerkUser.lastName || undefined,
          image_url: clerkUser.imageUrl,
          phone_numbers: clerkUser.phoneNumbers.map((p) => ({
            phone_number: p.phoneNumber,
          })),
          public_metadata: clerkUser.publicMetadata as ClerkUserData["public_metadata"],
          private_metadata: clerkUser.privateMetadata as ClerkUserData["private_metadata"],
          // We stop sending unsafe_metadata as it's no longer used for sync
        };

        user = await createUserInSupabase(userData);
        console.log("Auto-sync successful, user created:", user?.id);
      } catch (error) {
        syncError = error instanceof Error ? error : new Error(String(error));
        console.error("Auto-sync failed:", syncError.message);
      }
    }

    if (!user) {
      const errorMessage = syncError 
        ? `User sync failed: ${syncError.message}` 
        : "User not found in database";
      return cors(
        NextResponse.json({ error: errorMessage }, { status: 404 })
      );
    }

    // 3. Parse Body
    const body = await req.json();
    const {
      amount,
      phoneNumber,
      provider,
      description,
      transactionType,
      propertyId,
      preAuthorisationCode,
    } = body;

    if (!amount || !phoneNumber || !provider || !transactionType) {
      return cors(
        NextResponse.json({ error: "Missing required fields" }, { status: 400 })
      );
    }

    // Validation for Orange Burkina Faso which requires a pre-authorisation code
    if (provider === "ORANGE_MONEY" && !preAuthorisationCode) {
      return cors(
        NextResponse.json(
          { error: "Un code d'autorisation est requis pour Orange Money" },
          { status: 400 }
        )
      );
    }

    // 4. Create Transaction Record in Supabase (Pending)
    const depositId = crypto.randomUUID();
    const currency = "XOF";
    const supabase = getSupabaseClient();

    // Map provider to PawaPay v2 format (for database storage)
    let payerClientCode = provider;
    if (provider === "ORANGE_MONEY") payerClientCode = "ORANGE_BFA";
    if (provider === "MOOV_MONEY") payerClientCode = "MOOV_BFA";

    const { error: dbError } = await supabase.from("transactions").insert({
      deposit_id: depositId,
      amount: amount,
      currency: currency,
      status: "pending",
      type: transactionType,
      provider: payerClientCode,
      user_id: user.id,
      property_id: propertyId || null,
      payer_phone: phoneNumber,
    });

    if (dbError) {
      console.error("Database insertion error:", dbError);
      return cors(
        NextResponse.json(
          { error: "Failed to initialize transaction" },
          { status: 500 }
        )
      );
    }

    // 5. Call PawaPay API
    const pawaUrlBase =
      process.env.PAWAPAY_URL || "https://api.sandbox.pawapay.io";
    const pawaUrl = pawaUrlBase.replace(/\/+$/, ""); // Remove trailing slashes
    const pawaToken = process.env.PAWAPAY_API_TOKEN?.trim();

    if (!pawaToken) {
      console.error("PAWAPAY_API_TOKEN is not set");
      return cors(
        NextResponse.json(
          { error: "Server configuration error" },
          { status: 500 }
        )
      );
    }

    // Format phone number
    let formattedPhone = phoneNumber.replace(/\s/g, "");
    if (formattedPhone.length === 9 && formattedPhone.startsWith("0")) {
      formattedPhone = formattedPhone.substring(1);
    }
    formattedPhone = "226" + formattedPhone.slice(0, 8);

    const pawaProvider =
      provider === "ORANGE_MONEY" ? "ORANGE_BFA" : "MOOV_BFA";

    const customerMessage = (description || "Roogo Payment").slice(0, 22);

    const payload: PawaPayDepositPayload = {
      depositId,
      payer: {
        type: "MMO",
        accountDetails: {
          phoneNumber: formattedPhone,
          provider: pawaProvider,
        },
      },
      amount: amount.toString(),
      currency,
      customerMessage,
    };

    if (preAuthorisationCode) {
      payload.preAuthorisationCode = preAuthorisationCode;
    }

    const response = await fetch(`${pawaUrl}/v2/deposits`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pawaToken}`,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { message: responseText };
    }

    if (!response.ok) {
      await getSupabaseClient()
        .from("transactions")
        .update({
          status: "failed",
          failure_reason: result.message || "API call failed",
          metadata: result,
        })
        .eq("deposit_id", depositId);

      const failureReason = result.details?.failureReason;
      const errorMessage =
        failureReason?.failureMessage ||
        result.details?.errorMessage ||
        result.error ||
        "Payment initiation failed";

      return cors(
        NextResponse.json(
          {
            error: errorMessage,
            details: result,
            failureCode: failureReason?.failureCode,
          },
          { status: response.status }
        )
      );
    }

    return cors(
      NextResponse.json({
        success: true,
        depositId: result.depositId || depositId,
        status: result.status || "PENDING",
        raw: result,
      })
    );
  } catch (error: unknown) {
    console.error("Payment initiation error:", error);
    return cors(
      NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      )
    );
  }
}

function cors(res: NextResponse) {
  res.headers.set(
    "Access-Control-Allow-Origin",
    process.env.CORS_ORIGIN || "*"
  );
  res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return res;
}
