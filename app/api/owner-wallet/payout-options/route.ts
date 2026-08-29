import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { resolvePawaPayConfig } from "@/lib/pawapay-config";
import { isHotelFinanceAdmin } from "@/lib/hotel-auth";

const FALLBACK_OPTIONS = [
  {
    provider: "ORANGE_BFA",
    displayName: "Orange Money",
    minAmount: 100,
    maxAmount: 2_000_000,
    decimalsInAmount: "NONE",
    availability: "UNKNOWN",
  },
  {
    provider: "MOOV_BFA",
    displayName: "Moov Money",
    minAmount: 100,
    maxAmount: 2_000_000,
    decimalsInAmount: "NONE",
    availability: "UNKNOWN",
  },
];

type ProviderConfig = {
  provider?: string;
  displayName?: string;
  nameDisplayedToCustomer?: string;
  currencies?: Array<{
    currency?: string;
    operationTypes?:
      | Array<{
          operationType?: string;
          minAmount?: string;
          maxAmount?: string;
          decimalsInAmount?: string;
        }>
      | Record<string, unknown>;
  }>;
};

type CountryConfig = {
  country?: string;
  providers?: ProviderConfig[];
};

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return errorResponse("Unauthorized", 401, req);

    let clerkUserId: string;
    try {
      const { sub } = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
      clerkUserId = sub;
    } catch {
      return errorResponse("Invalid token", 401, req);
    }

    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);
    const canUseWallet =
      ["owner", "agent", "staff", "founder"].includes(user.user_type) ||
      (user.user_type === "hotel" && (await isHotelFinanceAdmin(user.id)));
    if (!canUseWallet) {
      return errorResponse("Forbidden", 403, req);
    }

    const config = resolvePawaPayConfig();
    const [activeConfResponse, availabilityResponse] = await Promise.all([
      fetch(`${config.url}/v2/active-conf?country=BFA&operationType=PAYOUT`, {
        headers: { Authorization: `Bearer ${config.token}` },
      }),
      fetch(`${config.url}/v2/availability?country=BFA&operationType=PAYOUT`, {
        headers: { Authorization: `Bearer ${config.token}` },
      }).catch(() => null),
    ]);

    if (!activeConfResponse.ok) {
      return cors(
        NextResponse.json({
          options: FALLBACK_OPTIONS,
          source: "fallback",
        }),
        req,
      );
    }

    const activeConf = await activeConfResponse.json();
    const availabilityPayload =
      availabilityResponse && availabilityResponse.ok
        ? await availabilityResponse.json()
        : null;

    const availabilityByProvider = new Map<string, string>();
    const availabilityCountries = Array.isArray(availabilityPayload)
      ? availabilityPayload
      : [];
    for (const country of availabilityCountries) {
      for (const provider of country.providers || []) {
        if (provider.provider) {
          availabilityByProvider.set(
            provider.provider,
            provider.operationTypes?.PAYOUT || "UNKNOWN",
          );
        }
      }
    }

    const countries: CountryConfig[] = Array.isArray(activeConf?.countries)
      ? activeConf.countries
      : [];
    const bfa = countries.find((country) => country.country === "BFA");
    const providers = Array.isArray(bfa?.providers)
      ? (bfa.providers as ProviderConfig[])
      : [];

    const options = providers
      .filter((provider) =>
        ["ORANGE_BFA", "MOOV_BFA"].includes(provider.provider || ""),
      )
      .map((provider) => {
        const xof = (provider.currencies || []).find(
          (currency) => currency.currency === "XOF",
        );
        const operationTypes = xof?.operationTypes;
        const payoutConfig = Array.isArray(operationTypes)
          ? operationTypes.find((op) => op.operationType === "PAYOUT")
          : operationTypes && typeof operationTypes === "object"
            ? (operationTypes.PAYOUT as Record<string, string> | undefined)
            : undefined;

        return {
          provider: provider.provider,
          displayName:
            provider.displayName ||
            (provider.provider === "ORANGE_BFA"
              ? "Orange Money"
              : "Moov Money"),
          minAmount: Number(payoutConfig?.minAmount || 100),
          maxAmount: Number(payoutConfig?.maxAmount || 2_000_000),
          decimalsInAmount: payoutConfig?.decimalsInAmount || "NONE",
          availability:
            availabilityByProvider.get(provider.provider || "") || "UNKNOWN",
        };
      });

    return cors(
      NextResponse.json({
        options: options.length ? options : FALLBACK_OPTIONS,
        source: options.length ? "pawapay" : "fallback",
      }),
      req,
    );
  } catch (error) {
    console.error("Error in GET /api/owner-wallet/payout-options:", error);
    return cors(
      NextResponse.json({
        options: FALLBACK_OPTIONS,
        source: "fallback",
      }),
      req,
    );
  }
}
