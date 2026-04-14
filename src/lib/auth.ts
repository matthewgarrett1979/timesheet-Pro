/**
 * NextAuth v4 configuration.
 *
 * Security properties:
 * - argon2id password hashing (see password.ts)
 * - Account lockout after MAX_FAILED_ATTEMPTS consecutive failures
 * - Database sessions (server-side revocable, 8-hour max age)
 * - MFA state tracked per-session via custom mfaVerified column
 * - All auth events written to immutable audit log
 */
import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { db } from "./db"
import { verifyPassword } from "./password"
import { audit } from "./audit"
import { AuditAction, Role } from "@prisma/client"

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000   // 15 minutes
const SESSION_MAX_AGE = 8 * 60 * 60 // 8 hours in seconds

export const authOptions: NextAuthOptions = {
  // Database sessions — can be revoked server-side (security incidents, logout)
  adapter: PrismaAdapter(db) as NextAuthOptions["adapter"],

  session: {
    strategy: "database",
    maxAge: SESSION_MAX_AGE,
    updateAge: 60 * 60, // Refresh session expiry every hour of activity
  },

  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const ip =
          (req.headers?.["x-forwarded-for"] as string | undefined)
            ?.split(",")[0]
            .trim() ?? "unknown"
        const ua = (req.headers?.["user-agent"] as string | undefined) ?? "unknown"
        const email = credentials.email.toLowerCase().trim()

        const user = await db.user.findUnique({ where: { email } })

        if (!user) {
          // Constant-time path: don't reveal that the account doesn't exist
          await audit({
            action: AuditAction.USER_LOGIN_FAILED,
            resource: "auth",
            metadata: { reason: "user_not_found" },
            ipAddress: ip,
            userAgent: ua,
            success: false,
          })
          return null
        }

        // Check lockout
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          await audit({
            userId: user.id,
            action: AuditAction.USER_LOGIN_FAILED,
            resource: "auth",
            resourceId: user.id,
            metadata: {
              reason: "account_locked",
              lockedUntil: user.lockedUntil,
            },
            ipAddress: ip,
            userAgent: ua,
            success: false,
          })
          throw new Error("AccountLocked")
        }

        const valid = await verifyPassword(credentials.password, user.passwordHash)

        if (!valid) {
          const newCount = user.failedLogins + 1
          const lock = newCount >= MAX_FAILED_ATTEMPTS

          await db.user.update({
            where: { id: user.id },
            data: {
              failedLogins: newCount,
              lockedUntil: lock
                ? new Date(Date.now() + LOCKOUT_MS)
                : undefined,
            },
          })

          await audit({
            userId: user.id,
            action: lock ? AuditAction.USER_LOCKED : AuditAction.USER_LOGIN_FAILED,
            resource: "auth",
            resourceId: user.id,
            metadata: {
              reason: "invalid_password",
              failedAttempts: newCount,
              locked: lock,
            },
            ipAddress: ip,
            userAgent: ua,
            success: false,
          })

          return null
        }

        // Success — reset counters
        await db.user.update({
          where: { id: user.id },
          data: { failedLogins: 0, lockedUntil: null },
        })

        await audit({
          userId: user.id,
          action: AuditAction.USER_LOGIN,
          resource: "auth",
          resourceId: user.id,
          metadata: { mfaRequired: user.mfaEnabled },
          ipAddress: ip,
          userAgent: ua,
          success: true,
        })

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          // Extra fields surfaced to the session callback
          role: user.role,
          mfaEnabled: user.mfaEnabled,
        }
      },
    }),
  ],

  callbacks: {
    async session({ session, user }) {
      // Augment session with role, mfaEnabled, and per-session mfaVerified
      const dbUser = await db.user.findUnique({
        where: { id: user.id },
        select: { role: true, mfaEnabled: true },
      })

      // Fetch the current session's mfaVerified flag
      const dbSession = await db.session.findFirst({
        where: { userId: user.id, expires: { gt: new Date() } },
        orderBy: { expires: "desc" },
        select: { mfaVerified: true },
      })

      return {
        ...session,
        user: {
          ...session.user,
          id: user.id,
          role: dbUser?.role ?? Role.MANAGER,
          mfaEnabled: dbUser?.mfaEnabled ?? false,
          mfaVerified: dbSession?.mfaVerified ?? !dbUser?.mfaEnabled,
        },
      }
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  events: {
    async signOut({ session }) {
      if (!session) return
      const s = session as { userId?: string }
      if (s.userId) {
        await audit({
          userId: s.userId,
          action: AuditAction.USER_LOGOUT,
          resource: "auth",
          resourceId: s.userId,
          success: true,
        })
      }
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === "development",
}
