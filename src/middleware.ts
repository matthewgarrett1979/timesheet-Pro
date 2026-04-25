/**
 * Next.js Edge Middleware — runs before every request.
 *
 * Responsibilities (in order):
 *   1. Setup gate — redirect to /setup if first-run cookie is absent and no
 *      existing session (new instance detection)
 *   2. Security headers on every response (CSP, HSTS, Permissions-Policy, etc.)
 *   3. Authentication gate — redirect unauthenticated requests to /login
 *   4. MFA gate — redirect MFA-pending sessions to /mfa
 *   5. Migration gate — redirect ADMIN with needsMigration to /setup/migrate
 *   6. ADMIN-only route enforcement
 *
 * Rate limiting is handled per-route via Arcjet (see src/lib/rate-limit.ts).
 * This middleware runs on the Edge Runtime (no Node.js APIs).
 *
 * First-run detection: the POST /api/setup handler sets an `app_configured`
 * cookie on successful setup. Middleware checks for this cookie; if absent AND
 * no NextAuth session cookie exists, it is a brand-new instance and all
 * non-public/non-setup paths redirect to /setup.
 *
 * Legacy instance migration: when an ADMIN whose instance has no
 * organizationDomain logs in, authorize() sets needsMigration=true in the JWT.
 * Middleware then redirects all protected routes to /setup/migrate until the
 * migration wizard completes and calls update({ needsMigration: false }).
 */
import { NextRequest, NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"

const SETUP_PATH = "/setup"

// Routes that do NOT require authentication
const PUBLIC_PATHS = [
  "/login",
  "/setup",
  "/api/setup",   // setup wizard APIs are public (no session exists yet)
  "/api/auth",
  "/api/approvals", // approval links are token-protected, not session-protected
  "/_next",
  "/favicon.ico",
  "/robots.txt",
]

// Routes restricted to ADMIN role
const ADMIN_PATHS = ["/admin", "/api/audit-log", "/settings/users", "/settings/audit"]

// Routes USER role cannot access (admin/manager only)
const MANAGER_PATHS = [
  "/clients",
  "/invoices",
  "/approvals",
  "/api/clients",
  "/api/invoices",
  "/api/approvals",
]

const MFA_PATH = "/mfa"
const LOGIN_PATH = "/login"
const CHANGE_PASSWORD_PATH = "/settings/change-password"
const MIGRATE_PATH = "/setup/migrate"

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ------------------------------------------------------------------
  // 1. Setup gate — must run before everything else.
  //    Redirect to /setup if:
  //    - app_configured cookie is absent (not yet set up), AND
  //    - No NextAuth session cookie exists (not an authenticated legacy user)
  //    - The path is not already a setup/static/public path
  //
  //    Using the session-cookie existence as a proxy for "authenticated"
  //    avoids a DB round-trip on the Edge. Authenticated users in legacy
  //    instances (pre-v3.2.0, no app_configured cookie) skip the gate and
  //    are handled by the migration redirect below.
  // ------------------------------------------------------------------
  const isSetupPath = pathname === SETUP_PATH || pathname.startsWith(SETUP_PATH + "/")
  const isApiSetup  = pathname.startsWith("/api/setup")
  const isStatic    = pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname === "/robots.txt"

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?")
  )

  if (!isSetupPath && !isApiSetup && !isStatic && !isPublic) {
    const configured    = req.cookies.get("app_configured")?.value
    // Check for either the standard or the __Secure- prefixed cookie name
    const sessionCookie = req.cookies.get("next-auth.session-token")?.value
                       ?? req.cookies.get("__Secure-next-auth.session-token")?.value

    if (!configured && !sessionCookie) {
      // Brand-new instance with no users — redirect to first-run wizard
      const setupUrl = req.nextUrl.clone()
      setupUrl.pathname = SETUP_PATH
      setupUrl.search = ""
      const response = NextResponse.redirect(setupUrl)
      applySecurityHeaders(response, req)
      return response
    }
  }

  // ------------------------------------------------------------------
  // 2. Build the response (may be a redirect or pass-through)
  // ------------------------------------------------------------------
  let response: NextResponse

  if (isPublic || isSetupPath || isApiSetup) {
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
      token.mustChangePassword &&
      pathname !== CHANGE_PASSWORD_PATH &&
      !pathname.startsWith("/api/users/") // allow PATCH /api/users/[id] for password change
    ) {
      // Must change password before accessing anything else
      const cpUrl = req.nextUrl.clone()
      cpUrl.pathname = CHANGE_PASSWORD_PATH
      response = NextResponse.redirect(cpUrl)
    } else if (token.needsMigration === true) {
      // ADMIN on a legacy instance that hasn't configured a domain yet.
      // /setup/migrate is public (starts with /setup/), so protected routes
      // are the only ones that reach this branch.
      const migrateUrl = req.nextUrl.clone()
      migrateUrl.pathname = MIGRATE_PATH
      response = NextResponse.redirect(migrateUrl)
    } else if (
      ADMIN_PATHS.some((p) => pathname.startsWith(p)) &&
      token.role !== "ADMIN"
    ) {
      // Not an admin — return 403
      response = new NextResponse("Forbidden", { status: 403 })
    } else if (
      token.role === "USER" &&
      MANAGER_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?"))
    ) {
      // USER role cannot access manager/admin-only paths
      response = new NextResponse("Forbidden", { status: 403 })
    } else {
      response = NextResponse.next()
    }
  }

  // ------------------------------------------------------------------
  // 3. Security headers — applied to every response, including redirects
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
