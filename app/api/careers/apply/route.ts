import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/user-sync";
import { hustleApplicationSchema } from "@/lib/validations";

interface HustleApplicationPayload {
  fullName: string;
  email: string;
  phone: string;
  secondaryPhone?: string;
  proudAchievement: string;
  difficultProblem: string;
  thirtyDayStrategy: string;
  proofLinks: string;
  neighborhoodChallenge: string;
  captchaCode: string;
  captchaInput: string;
}

const CAPTCHA_LENGTH = 5;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<HustleApplicationPayload>;

    const captchaCode = body.captchaCode?.trim().toUpperCase() || "";
    const captchaInput = body.captchaInput?.trim().toUpperCase() || "";

    // 1. Validate with Zod
    const validation = hustleApplicationSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error.issues[0]?.message || "Données invalides",
        },
        { status: 400 }
      );
    }

    const {
      fullName,
      email,
      phone,
      secondaryPhone,
      proudAchievement,
      difficultProblem,
      thirtyDayStrategy,
      proofLinks,
      neighborhoodChallenge,
    } = validation.data;

    // 2. Validate Captcha
    if (
      captchaCode.length !== CAPTCHA_LENGTH ||
      captchaInput.length !== CAPTCHA_LENGTH ||
      captchaInput !== captchaCode
    ) {
      return NextResponse.json(
        { success: false, error: "Le code de vérification est incorrect." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase.from("hustle_applications").insert({
      full_name: fullName,
      email,
      phone,
      secondary_phone: secondaryPhone,
      proud_achievement: proudAchievement,
      difficult_problem: difficultProblem,
      thirty_day_strategy: thirtyDayStrategy,
      proof_links: proofLinks,
      neighborhood_challenge: neighborhoodChallenge,
    });

    if (error) {
      console.error("Hustle application insert error:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Échec de l'enregistrement de la candidature.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Hustle application API error:", error);
    return NextResponse.json(
      { success: false, error: "Erreur interne du serveur." },
      { status: 500 }
    );
  }
}
