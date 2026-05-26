import { NextResponse } from "next/server";
import { z } from "zod";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { resolveSupabaseUserFromRequest } from "@/lib/referral-auth";
import {
  applyReferralToQuote,
  computeListingSubmissionQuote,
  ReferralValidationError,
  validateReferralForUser,
} from "@/lib/referrals";
import { getSupabaseClient } from "@/lib/user-sync";

const validateSchema = z.object({
  code: z.string().min(1),
  tierId: z.string().optional(),
  addOns: z.array(z.string()).optional(),
  frequence: z.enum(["mensuel", "journalier"]).optional(),
  monthlyRent: z.number().optional(),
});

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function POST(req: Request) {
  try {
    const user = await resolveSupabaseUserFromRequest(req);
    if (!user) return errorResponse("Unauthorized", 401, req);

    const body = validateSchema.parse(await req.json());
    const supabase = getSupabaseClient();
    const profile = await validateReferralForUser(supabase, {
      code: body.code,
      referredUserId: user.id,
      referredUserType: user.user_type,
    });

    const quote =
      body.tierId || body.frequence === "journalier"
        ? await computeListingSubmissionQuote(supabase, {
            tierId: body.tierId,
            addOns: body.addOns,
            frequence: body.frequence,
            monthlyRent: body.monthlyRent,
          })
        : null;
    const referral = quote ? applyReferralToQuote(quote, profile) : null;

    return cors(
      NextResponse.json({
        valid: true,
        referrerName: profile.displayName,
        code: profile.code,
        quote,
        referral: referral
          ? {
              code: profile.code,
              referrerName: profile.displayName,
              originalAmount: referral.originalAmount,
              discountAmount: referral.discountAmount,
              paidAmount: referral.paidAmount,
              commissionAmount: referral.commissionAmount,
            }
          : null,
      }),
      req,
    );
  } catch (error) {
    if (error instanceof ReferralValidationError) {
      return cors(
        NextResponse.json(
          { valid: false, code: error.code, error: error.message },
          { status: error.status },
        ),
        req,
      );
    }
    console.error("POST /api/referrals/validate error:", error);
    return errorResponse("Invalid referral code", 400, req);
  }
}
