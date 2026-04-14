/**
 * Validated, typed environment variables.
 *
 * Import `env` instead of `process.env` throughout the codebase.
 * The application will refuse to start if any required variable is
 * missing or fails its strength check — preventing silent misconfiguration.
 */
import { z } from "zod"

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid connection URL"),

  // NextAuth
  NEXTAUTH_SECRET: z
    .string()
    .min(32, "NEXTAUTH_SECRET must be at least 32 characters"),
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL"),

  // AES-256-GCM key for encrypting secrets at rest (MFA, Xero tokens)
  ENCRYPTION_KEY: z
    .string()
    .regex(
      /^[0-9a-f]{64}$/i,
      "ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). Generate with: openssl rand -hex 32"
    ),

  // HMAC-SHA256 key for signing approval JWTs
  APPROVAL_SIGNING_SECRET: z
    .string()
    .min(32, "APPROVAL_SIGNING_SECRET must be at least 32 characters"),

  // HMAC-SHA256 key for signing MFA session cookies
  MFA_HMAC_KEY: z
    .string()
    .min(32, "MFA_HMAC_KEY must be at least 32 characters"),

  // Arcjet — required in production, optional in development
  ARCJET_KEY: z
    .string()
    .refine(
      (v) => process.env.NODE_ENV !== "production" || v.length > 0,
      "ARCJET_KEY is required in production"
    )
    .optional(),

  // Xero (optional)
  XERO_CLIENT_ID: z.string().optional(),
  XERO_CLIENT_SECRET: z.string().optional(),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
})

function validateEnv() {
  // During `next build` Next.js runs static analysis (collecting page data)
  // in a build worker that does not have runtime secrets injected. Validation
  // only makes sense when the server is actually serving requests.
  // NEXT_PHASE=phase-production-build is set automatically by Next.js.
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return process.env as unknown as z.infer<typeof envSchema>
  }

  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    console.error(
      "❌ Invalid environment configuration. Application will not start."
    )
    result.error.errors.forEach((err) => {
      console.error(`  [${err.path.join(".")}] ${err.message}`)
    })
    process.exit(1)
  }

  return result.data
}

// Validated on first import — fails fast at startup (skipped during next build)
export const env = validateEnv()
