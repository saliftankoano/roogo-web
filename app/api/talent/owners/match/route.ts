import { NextResponse } from "next/server";
import { resolveClerkId } from "@/lib/request-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { maskPhone, normalizeTalentPhone } from "@/lib/talent";

export async function GET(req: Request) {
  try {
    const clerkId = await resolveClerkId(req);
    if (!clerkId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const phone = searchParams.get("phone")?.trim() ?? "";
    const normalized = normalizeTalentPhone(phone);

    if (normalized.replace(/\D/g, "").length < 8) {
      return NextResponse.json(
        { success: false, error: "Entrez un numéro complet pour vérifier." },
        { status: 400 },
      );
    }

    const candidates = Array.from(new Set([phone, normalized, normalized.replace(/^\+226/, "")]))
      .filter(Boolean)
      .map((value) => value.replace(/'/g, "''"));

    const orQuery = candidates
      .flatMap((value) => [`phone.eq.${value}`, `whatsapp.eq.${value}`])
      .join(",");

    const { data: owners, error } = await supabaseAdmin
      .from("users")
      .select("id, full_name, phone, whatsapp, preferred_city, user_type")
      .in("user_type", ["owner", "agent"])
      .or(orQuery)
      .limit(5);

    if (error) throw error;

    const ownerIds = (owners ?? []).map((owner) => owner.id);
    const propertiesByOwner = new Map<string, Array<Record<string, unknown>>>();

    if (ownerIds.length > 0) {
      const { data: properties, error: propertyError } = await supabaseAdmin
        .from("properties")
        .select("id, owner_id, agent_id, status, quartier, city, created_at")
        .or(`owner_id.in.(${ownerIds.join(",")}),agent_id.in.(${ownerIds.join(",")})`)
        .order("created_at", { ascending: false })
        .limit(20);

      if (propertyError) throw propertyError;

      for (const property of properties ?? []) {
        const ownerId = (property.owner_id ?? property.agent_id) as string | null;
        if (!ownerId) continue;
        const current = propertiesByOwner.get(ownerId) ?? [];
        current.push({
          id: property.id,
          status: property.status,
          quartier: property.quartier,
          city: property.city,
        });
        propertiesByOwner.set(ownerId, current);
      }
    }

    return NextResponse.json({
      success: true,
      matches: (owners ?? []).map((owner) => ({
        id: owner.id,
        displayName: owner.full_name ? `${owner.full_name.slice(0, 1)}.` : "Propriétaire",
        maskedPhone: maskPhone(owner.phone || owner.whatsapp),
        city: owner.preferred_city,
        type: owner.user_type,
        properties: propertiesByOwner.get(owner.id) ?? [],
      })),
    });
  } catch (error) {
    console.error("GET /api/talent/owners/match:", error);
    return NextResponse.json(
      { success: false, error: "Impossible de vérifier ce propriétaire." },
      { status: 500 },
    );
  }
}
