/**
 * PawaPay Configuration Resolver
 *
 * Sandbox test MSISDNs (Burkina Faso): see `docs/pawapay-test-numbers.md`.
 *
 * Provides centralized configuration for PawaPay payment processing with:
 * - Local mode toggle (sandbox/live) for development
 * - Production safety (always forces live)
 * - Clear error messages for missing configuration
 */

export interface PawaPayConfig {
  url: string;
  token: string;
  environment: "sandbox" | "live";
}

/**
 * Resolves PawaPay configuration based on environment
 *
 * Rules:
 * - Production: Always uses live credentials (ignores PAWAPAY_LOCAL_MODE)
 * - Development: Uses PAWAPAY_LOCAL_MODE to choose sandbox or live (defaults to sandbox)
 * - Throws explicit errors if selected mode credentials are missing
 */
export function resolvePawaPayConfig(): PawaPayConfig {
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    // Production: always force live credentials
    const url = process.env.PAWAPAY_LIVE_URL || process.env.PAWAPAY_URL;
    const token =
      process.env.PAWAPAY_LIVE_API_TOKEN || process.env.PAWAPAY_API_TOKEN;

    if (!url) {
      throw new Error(
        "Production PawaPay configuration error: PAWAPAY_LIVE_URL (or PAWAPAY_URL) is not configured",
      );
    }

    if (!token) {
      throw new Error(
        "Production PawaPay configuration error: PAWAPAY_LIVE_API_TOKEN (or PAWAPAY_API_TOKEN) is not configured",
      );
    }

    return {
      url: url.replace(/\/+$/, ""), // Remove trailing slashes
      token: token.trim(),
      environment: "live",
    };
  }

  // Development/Local: Use PAWAPAY_LOCAL_MODE to choose
  const localMode = (process.env.PAWAPAY_LOCAL_MODE || "sandbox").toLowerCase();

  if (localMode === "live") {
    // Local live mode
    const url = process.env.PAWAPAY_LIVE_URL || process.env.PAWAPAY_URL;
    const token =
      process.env.PAWAPAY_LIVE_API_TOKEN || process.env.PAWAPAY_API_TOKEN;

    if (!url) {
      throw new Error(
        "Local live mode error: PAWAPAY_LIVE_URL (or PAWAPAY_URL) is not configured. " +
          "Set these variables or switch PAWAPAY_LOCAL_MODE to 'sandbox'.",
      );
    }

    if (!token) {
      throw new Error(
        "Local live mode error: PAWAPAY_LIVE_API_TOKEN (or PAWAPAY_API_TOKEN) is not configured. " +
          "Set these variables or switch PAWAPAY_LOCAL_MODE to 'sandbox'.",
      );
    }

    return {
      url: url.replace(/\/+$/, ""),
      token: token.trim(),
      environment: "live",
    };
  }

  // Local sandbox mode (default)
  const url = process.env.PAWAPAY_SANDBOX_URL || process.env.PAWAPAY_URL;
  const token =
    process.env.PAWAPAY_SANDBOX_API_TOKEN || process.env.PAWAPAY_API_TOKEN;

  if (!url) {
    throw new Error(
      "Local sandbox mode error: PAWAPAY_SANDBOX_URL (or PAWAPAY_URL) is not configured. " +
        "Set these variables or check your .env.local file.",
    );
  }

  if (!token) {
    throw new Error(
      "Local sandbox mode error: PAWAPAY_SANDBOX_API_TOKEN (or PAWAPAY_API_TOKEN) is not configured. " +
        "Set these variables or check your .env.local file.",
    );
  }

  return {
    url: url.replace(/\/+$/, ""),
    token: token.trim(),
    environment: "sandbox",
  };
}
