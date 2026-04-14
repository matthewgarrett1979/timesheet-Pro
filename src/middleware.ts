/**
 * Next.js Edge Middleware — runs before every request.
 *
 * Responsibilities (in order):
 *   1. Security headers on every response (CSP, HSTS, Permissions-Policy, etc.)
 *   2. Authentication gate — redirect unauthenticated requests to /login
 *   3. MFA gate — redirect MFA-pending sessions to /mfa
 *   4. ADMIN-only route enforcement
 *
 * Rate limiting is handled per-route via Arcjet (see src/lib/rate-limit.ts).
 * This middleware runs on the Edge Runtime (no Node.js APIs).
 */
import { NextRequest, NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"

// Routes that do NOT require authentication
const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/api/approvals", // approval links are token-protected, not session-protected
  "/_next",
  "/favicon.ico",
  "/robots.txt",
]

// Routes restricted to ADMIN role
const ADMIN_PATHS = ["/admin", "/api/audit-log"]

const MFA_PATH = "/mfa"
const LOGIN_PATH = "/login"

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ------------------------------------------------------------------
  // 1. Build the response (may be a redirect or pass-through)
  // ------------------------------------------------------------------
  let response: NextResponse

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?")
  )

  if (isPublic) {
    response = NextResponse.next()
  } else {
    // Retrieve the session token from the cookie (Edge-compatible)
    const token = await getToken({
      req,
      // NEXTAUTH_SECRET is validated at startup (env.ts); the ?? "" satisfies
      // the string type without introducing a silent security hole because a
      // blank secret would mean getToken() always returns null → login redirect.
      secret: process.env.NEXTAUTH_SECRET ?? "",
    })

    if (!token) {
      // Not authenticated — redirect to login, preserving the intended URL
      const loginUrl = req.nextUrl.clone()
      loginUrl.pathname = LOGIN_PATH
      loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname)
      response = NextResponse.redirect(loginUrl)
    } else if (
      token.mfaEnabled &&
      !token.mfaVerified &&
      pathname !== MFA_PATH
    ) {
      // MFA required but not yet verified
      const mfaUrl = req.nextUrl.clone()
      mfaUrl.pathname = MFA_PATH
      response = NextResponse.redirect(mfaUrl)
    } else if (
      ADMIN_PATHS.some((p) => pathname.startsWith(p)) &&
      token.role !== "ADMIN"
    ) {
      // Not an admin — return 403
      response = new NextResponse("Forbidden", { status: 403 })
    } else {
      response = NextResponse.next()
    }
  }

  // ------------------------------------------------------------------
  // 2. Security headers — applied to every response, including redirects
  // ------------------------------------------------------------------
  applySecurityHeaders(response, req)

  return response
}

function applySecurityHeaders(response: NextResponse, req: NextRequest): void {
  const h = response.headers
  const isProduction = process.env.NODE_ENV === "production"

  // Prevent clickjacking
  h.set("X-Frame-Options", "DENY")

  // Disable MIME sniffing
  h.set("X-Content-Type-Options", "nosniff")

  // Referrer — send origin only across origins, full URL same-origin
  h.set("Referrer-Policy", "strict-origin-when-cross-origin")

  // Disable browser features not needed by the app
  h.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
  )

  // HSTS — max 2 years, include subdomains, preload (production only)
  if (isProduction) {
    h.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    )
  }

  // Content Security Policy
  // Intentionally tight — adjust only when a new resource type is needed.
  const csp = buildCsp(req)
  h.set("Content-Security-Policy", csp)

  // Remove X-Powered-By if next.config.ts hasn't already
  h.delete("X-Powered-By")
}

function buildCsp(req: NextRequest): string {
  const isDev = process.env.NODE_ENV === "development"
  const nonce = generateNonce()

  // Attach nonce to request headers so layouts can read it
  req.headers.set("x-nonce", nonce)

  const directives: Record<string, string> = {
    "default-src": "'self'",
    "script-src": isDev
      ? `'self' 'unsafe-inline' 'unsafe-eval'` // dev HMR needs these
      : `'self' 'nonce-${nonce}'`,
    "style-src": isDev
      ? "'self' 'unsafe-inline'"
      : `'self' 'nonce-${nonce}'`,
    "img-src": "'self' data: blob:",
    "font-src": "'self'",
    "connect-src": "'self'",
    "media-src": "'none'",
    "object-src": "'none'",
    "frame-src": "'none'",
    "frame-ancestors": "'none'",
    "form-action": "'self'",
    "base-uri": "'self'",
    "upgrade-insecure-requests": "",
  }

  return Object.entries(directives)
    .map(([key, value]) => (value ? `${key} ${value}` : key))
    .join("; ")
}

function generateNonce(): string {
  // Web Crypto API — available in Edge Runtime
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}
