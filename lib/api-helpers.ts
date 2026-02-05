import { NextResponse } from "next/server";

const ALLOWED_ORIGINS =
  process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()) || [];

export function cors(res: NextResponse, req?: Request) {
  const origin = req?.headers.get("origin") || "";

  // For mobile apps, there's no origin header - allow through
  // For web requests, validate the origin if configured
  if (ALLOWED_ORIGINS.length === 0) {
    // No CORS configured - allow all origins (suitable for API-only usage from mobile)
    if (origin) {
      res.headers.set("Access-Control-Allow-Origin", origin);
    } else {
      res.headers.set("Access-Control-Allow-Origin", "*");
    }
  } else if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes("*")) {
    res.headers.set("Access-Control-Allow-Origin", origin);
  } else if (!origin) {
    // No origin header (mobile app request) - allow through
    res.headers.set("Access-Control-Allow-Origin", "*");
  }

  res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  res.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  return res;
}

export function corsOptions(req: Request) {
  return cors(NextResponse.json({ ok: true }), req);
}

export function safeError(
  error: unknown,
  fallbackMessage = "An error occurred",
) {
  // Log full error server-side
  console.error("API Error:", error);

  // Return generic message to client
  if (process.env.NODE_ENV === "development") {
    return error instanceof Error ? error.message : String(error);
  }
  return fallbackMessage;
}

export function errorResponse(message: string, status: number, req?: Request) {
  return cors(NextResponse.json({ error: message }, { status }), req);
}

export function json(data: unknown, status?: number) {
  return NextResponse.json(data, { status });
}
