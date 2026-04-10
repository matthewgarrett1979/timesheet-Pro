/**
 * Arcjet rate limiting and bot protection.
 *
 * Separate rule sets are exported for different endpoint sensitivity levels:
 *   - ajAuth      : login / MFA / recovery — very tight limits
 *   - ajApi       : general authenticated API endpoints
 *   - ajApprovals : approval link endpoints — moderate, no auth required
 *
 * In development without an ARCJET_KEY, rate limiting is skipped and a
 * warning is logged. In production the key is required (validated in env.ts).
 */
import { env } from "./env"

// Lazy-load Arcjet to avoid crashing when key is absent in development
let _arcjet: typeof import("@arcjet/next").default | null = null

async function getArcjet() {
  if (!env.ARCJET_KEY) return null
  if (_arcjet) return _arcjet
  const mod = await import("@arcjet/next")
  _arcjet = mod.default
  return _arcjet
}

type ArcjetDecision = { isDenied(): boolean; reason?: { isRateLimit(): boolean; isBot?(): boolean } }

/**
 * Check a request against the given Arcjet instance key / rule set.
 * Returns { denied: true } if Arcjet blocks the request.
 * Returns { denied: false } if allowed or if Arcjet is not configured.
 */
export async function checkRateLimit(
  request: Request,
  preset: "auth" | "api" | "approvals"
): Promise<{ denied: boolean; status: number; reason?: string }> {
  const arcjet = await getArcjet()

  if (!arcjet) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[rate-limit] Arcjet not configured — rate limiting disabled")
    }
    return { denied: false, status: 200 }
  }

  const { shield, slidingWindow, detectBot } = await import("@arcjet/next")

  const rules = {
    auth: [
      shield({ mode: "LIVE" }),
      detectBot({ mode: "LIVE", allow: [] }),
      slidingWindow({ mode: "LIVE", interval: "1m", max: 5 }),
    ],
    api: [
      shield({ mode: "LIVE" }),
      slidingWindow({ mode: "LIVE", interval: "1m", max: 120 }),
    ],
    approvals: [
      shield({ mode: "LIVE" }),
      detectBot({ mode: "LIVE", allow: [] }),
      slidingWindow({ mode: "LIVE", interval: "1h", max: 10 }),
    ],
  }

  const aj = arcjet({
    key: env.ARCJET_KEY!,
    rules: rules[preset] as never,
  })

  let decision: ArcjetDecision
  try {
    decision = await aj.protect(request as never)
  } catch (err) {
    console.error("[rate-limit] Arcjet protect failed:", err)
    return { denied: false, status: 200 }
  }

  if (decision.isDenied()) {
    const isRateLimit = decision.reason?.isRateLimit?.()
    return {
      denied: true,
      status: isRateLimit ? 429 : 403,
      reason: isRateLimit ? "rate_limit_exceeded" : "forbidden",
    }
  }

  return { denied: false, status: 200 }
}
