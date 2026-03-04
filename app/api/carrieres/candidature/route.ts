import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/user-sync";

interface SpontaneousApplicationPayload {
  fullName: string;
  email: string;
  question1Answer: string;
  question2Answer: string;
  valueProposition: string;
  captchaCode: string;
  captchaInput: string;
}

const CAPTCHA_LENGTH = 5;

function isEmailValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<SpontaneousApplicationPayload>;

    const fullName = body.fullName?.trim() || "";
    const email = body.email?.trim().toLowerCase() || "";
    const question1Answer = body.question1Answer?.trim() || "";
    const question2Answer = body.question2Answer?.trim() || "";
    const valueProposition = body.valueProposition?.trim() || "";
    const captchaCode = body.captchaCode?.trim().toUpperCase() || "";
    const captchaInput = body.captchaInput?.trim().toUpperCase() || "";

    if (!fullName || !email || !question1Answer || !question2Answer || !valueProposition) {
      return NextResponse.json(
        { success: false, error: "Tous les champs sont obligatoires." },
        { status: 400 },
      );
    }

    if (!isEmailValid(email)) {
      return NextResponse.json(
        { success: false, error: "Adresse email invalide." },
        { status: 400 },
      );
    }

    if (
      captchaCode.length !== CAPTCHA_LENGTH ||
      captchaInput.length !== CAPTCHA_LENGTH ||
      captchaInput !== captchaCode
    ) {
      return NextResponse.json(
        { success: false, error: "Code de verification invalide." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase.from("spontaneous_applications").insert({
      full_name: fullName,
      email,
      question1_answer: question1Answer,
      question2_answer: question2Answer,
      value_proposition: valueProposition,
    });

    if (error) {
      console.error("Spontaneous application insert error:", error);
      return NextResponse.json(
        { success: false, error: "Echec de l&apos;enregistrement de la candidature." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Spontaneous application API error:", error);
    return NextResponse.json(
      { success: false, error: "Erreur interne du serveur." },
      { status: 500 },
    );
  }
}
