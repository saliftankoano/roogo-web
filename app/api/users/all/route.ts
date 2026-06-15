import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/user-sync";

interface MobileOnboardingData {
  phone?: string;
  whatsapp?: string;
  // Renter-specific
  rooms?: string;
  budget?: number;
  location?: string;
  furnished?: string;
  moveInUrgency?: string;
  propertyTypes?: string[];
  // Owner-specific
  propertyCity?: string;
  propertyAvailable?: string;
  // Notifications (shape differs by user type)
  notifications?: {
    newListings?: boolean;
    messages?: boolean;
    payments?: boolean;
    viewingRequests?: boolean;
  };
  // Agent-specific (inside mobileOnboardingData)
  serviceAreas?: string[];
  portfolioSize?: string | null;
  referralSource?: string;
  socialPlatform?: string;
  referralSourceDetail?: string;
  referralSourceOther?: string;
}

interface ClerkPublicMetadata {
  userType?: string;
  signupPlatform?: string;
  hasCompletedMobileOnboarding?: boolean;
  hasCompletedWebOnboarding?: boolean;
  hasCompletedOnboarding?: boolean;
  webOnboardingStep?: number;
}

interface ClerkPrivateMetadata {
  onboardingData?: MobileOnboardingData;
  mobileOnboardingData?: MobileOnboardingData;
  webOnboardingData?: MobileOnboardingData;
  // Agent top-level private metadata (not nested inside mobileOnboardingData)
  companyName?: string;
  professionalLink?: string;
}

const CLERK_USER_ID_BATCH_SIZE = 100;
const CLERK_USER_PAGE_SIZE = 100;

type ClerkServerClient = Awaited<ReturnType<typeof clerkClient>>;
type ClerkUser = Awaited<
  ReturnType<ClerkServerClient["users"]["getUserList"]>
>["data"][number];

export interface FullUser {
  id: string;
  clerk_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  user_type: string;
  company_name: string | null;
  professional_link: string | null;
  whatsapp: string | null;
  preferred_city: string | null;
  budget_max: number | null;
  service_areas: string[] | null;
  portfolio_size: string | null;
  referral_source: string | null;
  preferences: Record<string, unknown> | null;
  created_at: string;
  // Signup geo (write-once, sourced from Clerk session geoIP)
  signup_city: string | null;
  signup_country: string | null;
  signup_ip: string | null;
  signup_captured_at: string | null;
  signup_device_type: string | null;
  signup_device_is_mobile: boolean | null;
  signup_browser_name: string | null;
  signup_browser_version: string | null;
  // Activity counts
  properties_count: number;
  applications_count: number;
  agreements_renter_count: number;
  agreements_owner_count: number;
  favorites_count: number;
  // Clerk public metadata
  signup_platform: string | null;
  signup_device_label: string;
  has_completed_mobile_onboarding: boolean;
  has_completed_web_onboarding: boolean;
  has_completed_onboarding: boolean;
  web_onboarding_step: number | null;
  onboarding_source: string | null;
  owner_followup_reasons: string[];
  // Onboarding — renter fields
  onboarding_rooms: string | null;
  onboarding_budget: number | null;
  onboarding_furnished: string | null;
  onboarding_move_in_urgency: string | null;
  onboarding_property_types: string[];
  onboarding_location: string | null;
  onboarding_notifications_new_listings: boolean | null;
  // Onboarding — owner fields
  onboarding_property_city: string | null;
  onboarding_property_available: string | null;
  onboarding_notifications_messages: boolean | null;
  onboarding_notifications_payments: boolean | null;
  onboarding_notifications_viewing_requests: boolean | null;
  // Onboarding — agent fields (inside mobileOnboardingData)
  onboarding_service_areas: string[];
  onboarding_portfolio_size: string | null;
  onboarding_referral_source: string | null;
  onboarding_social_platform: string | null;
  onboarding_referral_source_detail: string | null;
  // Agent top-level Clerk private metadata
  clerk_company_name: string | null;
  clerk_professional_link: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function getSignupDeviceLabel(input: {
  signupPlatform: string | null;
  isMobile: boolean | null;
}) {
  if (input.signupPlatform === "mobile") return "Mobile app";
  if (input.signupPlatform === "web" && input.isMobile === true) {
    return "Mobile web";
  }
  if (input.signupPlatform === "web" && input.isMobile === false) {
    return "Web desktop";
  }
  if (input.isMobile === true) return "Mobile web";
  if (input.isMobile === false) return "Web desktop";
  return "Inconnu";
}

function getOnboardingSource({
  hasCompletedWeb,
  hasCompletedMobile,
  webData,
  mobileData,
}: {
  hasCompletedWeb: boolean;
  hasCompletedMobile: boolean;
  webData?: MobileOnboardingData;
  mobileData?: MobileOnboardingData;
}) {
  if (hasCompletedWeb || (webData && Object.keys(webData).length > 0)) {
    return "web";
  }
  if (hasCompletedMobile || (mobileData && Object.keys(mobileData).length > 0)) {
    return "mobile";
  }
  return null;
}

function getOwnerFollowupReasons(input: {
  userType: string;
  hasCompletedOnboarding: boolean;
  phone: string | null;
  whatsapp: string | null;
  propertyCity: string | null;
  propertyAvailable: string | null;
  propertiesCount: number;
}) {
  if (input.userType !== "owner") return [];

  const reasons: string[] = [];
  if (!input.hasCompletedOnboarding) reasons.push("Onboarding incomplet");
  if (!input.phone) reasons.push("Téléphone manquant");
  if (!input.whatsapp) reasons.push("WhatsApp manquant");
  if (!input.propertyCity) reasons.push("Ville du bien manquante");
  if (!input.propertyAvailable) reasons.push("Disponibilité manquante");
  if (input.propertiesCount === 0) reasons.push("Aucun bien publié");
  return reasons;
}

async function fetchClerkUsersByIds(clerkIds: Array<string | null | undefined>) {
  const ids = Array.from(
    new Set(
      clerkIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      ),
    ),
  );

  if (ids.length === 0) return [];

  const clerk = await clerkClient();
  const users: ClerkUser[] = [];

  for (let start = 0; start < ids.length; start += CLERK_USER_ID_BATCH_SIZE) {
    const batch = ids.slice(start, start + CLERK_USER_ID_BATCH_SIZE);
    let offset = 0;

    for (;;) {
      const page = await clerk.users.getUserList({
        userId: batch,
        limit: CLERK_USER_PAGE_SIZE,
        offset,
      });

      users.push(...page.data);

      offset += CLERK_USER_PAGE_SIZE;
      if (page.data.length < CLERK_USER_PAGE_SIZE || offset >= page.totalCount) {
        break;
      }
    }
  }

  return users;
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUser();
    const userType = user?.publicMetadata?.userType;
    if (!["staff", "founder", "admin"].includes(userType as string)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = getSupabaseClient();
    const { data: rawUsers, error } = await supabase
      .from("users")
      .select(
        `
        id,
        clerk_id,
        full_name,
        email,
        phone,
        avatar_url,
        user_type,
        company_name,
        professional_link,
        whatsapp,
        preferred_city,
        budget_max,
        service_areas,
        portfolio_size,
        referral_source,
        preferences,
        created_at,
        signup_city,
        signup_country,
        signup_ip,
        signup_captured_at,
        signup_device_type,
        signup_device_is_mobile,
        signup_browser_name,
        signup_browser_version
      `,
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching all users:", error);
      return NextResponse.json(
        { error: "Failed to load users" },
        { status: 500 },
      );
    }

    if (!rawUsers || rawUsers.length === 0) {
      return NextResponse.json({ users: [] });
    }

    const userIds = rawUsers.map((u) => u.id);

    // Parallel: activity counts + Clerk metadata
    const [
      propertiesRes,
      applicationsRes,
      agreementsRes,
      favoritesRes,
      clerkUsersData,
    ] = await Promise.all([
      supabase.from("properties").select("agent_id").in("agent_id", userIds),
      supabase.from("applications").select("user_id").in("user_id", userIds),
      supabase
        .from("rental_agreements")
        .select("owner_id, renter_id")
        .or(
          `owner_id.in.(${userIds.join(",")}),renter_id.in.(${userIds.join(",")})`,
        ),
      supabase.from("favorites").select("user_id").in("user_id", userIds),
      (async () => {
        try {
          return await fetchClerkUsersByIds(rawUsers.map((user) => user.clerk_id));
        } catch {
          return [];
        }
      })(),
    ]);

    // Build count maps
    const propertiesCountMap: Record<string, number> = {};
    (propertiesRes.data ?? []).forEach((r) => {
      if (r.agent_id)
        propertiesCountMap[r.agent_id] =
          (propertiesCountMap[r.agent_id] ?? 0) + 1;
    });

    const applicationsCountMap: Record<string, number> = {};
    (applicationsRes.data ?? []).forEach((r) => {
      if (r.user_id)
        applicationsCountMap[r.user_id] =
          (applicationsCountMap[r.user_id] ?? 0) + 1;
    });

    const agreementsRenterMap: Record<string, number> = {};
    const agreementsOwnerMap: Record<string, number> = {};
    (agreementsRes.data ?? []).forEach((r) => {
      if (r.renter_id)
        agreementsRenterMap[r.renter_id] =
          (agreementsRenterMap[r.renter_id] ?? 0) + 1;
      if (r.owner_id)
        agreementsOwnerMap[r.owner_id] =
          (agreementsOwnerMap[r.owner_id] ?? 0) + 1;
    });

    const favoritesCountMap: Record<string, number> = {};
    (favoritesRes.data ?? []).forEach((r) => {
      if (r.user_id)
        favoritesCountMap[r.user_id] = (favoritesCountMap[r.user_id] ?? 0) + 1;
    });

    // Clerk metadata map keyed by Clerk user ID
    const clerkMap = new Map<
      string,
      { pub: ClerkPublicMetadata; priv: ClerkPrivateMetadata }
    >();
    clerkUsersData.forEach((cu) => {
      clerkMap.set(cu.id, {
        pub: cu.publicMetadata as ClerkPublicMetadata,
        priv: cu.privateMetadata as ClerkPrivateMetadata,
      });
    });

    const enrichedUsers: FullUser[] = rawUsers.map((row) => {
      const clerkData = row.clerk_id ? clerkMap.get(row.clerk_id) : undefined;
      const pub = clerkData?.pub;
      const priv = clerkData?.priv;
      const preferences = isRecord(row.preferences)
        ? (row.preferences as MobileOnboardingData)
        : {};
      const legacyOnboarding = priv?.onboardingData ?? {};
      const mobileOnboarding = priv?.mobileOnboardingData ?? {};
      const webOnboarding = priv?.webOnboardingData ?? {};
      const onboarding = {
        ...preferences,
        ...legacyOnboarding,
        ...mobileOnboarding,
        ...webOnboarding,
      } as MobileOnboardingData;
      const hasCompletedMobile =
        pub?.hasCompletedMobileOnboarding === true ||
        pub?.hasCompletedOnboarding === true;
      const hasCompletedWeb = pub?.hasCompletedWebOnboarding === true;
      const hasCompleted = hasCompletedMobile || hasCompletedWeb;
      const signupPlatform = pub?.signupPlatform ?? null;
      const phone =
        row.phone ??
        (typeof onboarding.phone === "string" ? onboarding.phone : null);
      const whatsapp =
        row.whatsapp ??
        (typeof onboarding.whatsapp === "string" ? onboarding.whatsapp : null);
      const propertyCity =
        (typeof onboarding.propertyCity === "string"
          ? onboarding.propertyCity
          : null) ?? row.preferred_city;
      const propertyAvailable =
        typeof onboarding.propertyAvailable === "string"
          ? onboarding.propertyAvailable
          : null;
      const propertiesCount = propertiesCountMap[row.id] ?? 0;

      return {
        id: row.id,
        clerk_id: row.clerk_id ?? null,
        full_name: row.full_name,
        email: row.email,
        phone,
        avatar_url: row.avatar_url,
        user_type: row.user_type,
        company_name: row.company_name,
        professional_link: row.professional_link,
        whatsapp,
        preferred_city: row.preferred_city,
        budget_max: row.budget_max,
        service_areas: row.service_areas,
        portfolio_size: row.portfolio_size,
        referral_source: row.referral_source,
        preferences: row.preferences,
        created_at: row.created_at,
        signup_city: row.signup_city ?? null,
        signup_country: row.signup_country ?? null,
        signup_ip: row.signup_ip ?? null,
        signup_captured_at: row.signup_captured_at ?? null,
        signup_device_type: row.signup_device_type ?? null,
        signup_device_is_mobile: row.signup_device_is_mobile ?? null,
        signup_browser_name: row.signup_browser_name ?? null,
        signup_browser_version: row.signup_browser_version ?? null,
        properties_count: propertiesCount,
        applications_count: applicationsCountMap[row.id] ?? 0,
        agreements_renter_count: agreementsRenterMap[row.id] ?? 0,
        agreements_owner_count: agreementsOwnerMap[row.id] ?? 0,
        favorites_count: favoritesCountMap[row.id] ?? 0,
        signup_platform: signupPlatform,
        signup_device_label: getSignupDeviceLabel({
          signupPlatform,
          isMobile: row.signup_device_is_mobile ?? null,
        }),
        has_completed_mobile_onboarding: hasCompletedMobile,
        has_completed_web_onboarding: hasCompletedWeb,
        has_completed_onboarding: hasCompleted,
        web_onboarding_step:
          typeof pub?.webOnboardingStep === "number" ? pub.webOnboardingStep : null,
        onboarding_source: getOnboardingSource({
          hasCompletedWeb,
          hasCompletedMobile,
          webData: webOnboarding,
          mobileData: mobileOnboarding,
        }),
        owner_followup_reasons: getOwnerFollowupReasons({
          userType: row.user_type,
          hasCompletedOnboarding: hasCompleted,
          phone,
          whatsapp,
          propertyCity,
          propertyAvailable,
          propertiesCount,
        }),
        onboarding_rooms: onboarding?.rooms ?? null,
        onboarding_budget: onboarding?.budget ?? null,
        onboarding_furnished: onboarding?.furnished ?? null,
        onboarding_move_in_urgency: onboarding?.moveInUrgency ?? null,
        onboarding_property_types: toStringArray(onboarding?.propertyTypes),
        onboarding_location: onboarding?.location ?? null,
        onboarding_notifications_new_listings:
          onboarding?.notifications?.newListings ?? null,
        onboarding_property_city: propertyCity,
        onboarding_property_available: propertyAvailable,
        onboarding_notifications_messages:
          onboarding?.notifications?.messages ?? null,
        onboarding_notifications_payments:
          onboarding?.notifications?.payments ?? null,
        onboarding_notifications_viewing_requests:
          onboarding?.notifications?.viewingRequests ?? null,
        onboarding_service_areas: toStringArray(onboarding?.serviceAreas),
        onboarding_portfolio_size: onboarding?.portfolioSize ?? null,
        onboarding_referral_source: onboarding?.referralSource ?? null,
        onboarding_social_platform: onboarding?.socialPlatform ?? null,
        onboarding_referral_source_detail:
          onboarding?.referralSourceDetail ??
          onboarding?.referralSourceOther ??
          null,
        clerk_company_name: priv?.companyName ?? null,
        clerk_professional_link: priv?.professionalLink ?? null,
      };
    });

    return NextResponse.json({ users: enrichedUsers });
  } catch (error) {
    console.error("Error in GET /api/users/all:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
