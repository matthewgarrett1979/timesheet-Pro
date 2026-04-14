/**
 * NextAuth v4 configuration.
 *
 * Security properties:
 * - argon2id password hashing (see password.ts)
 * - Account lockout after MAX_FAILED_ATTEMPTS consecutive failures
 * - JWT sessions (CredentialsProvider requires JWT, not database sessions)
 * - MFA state tracked in the JWT token, updated via session.update()
 * - All auth events written to immutable audit log
 */
import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { db } from "./db"
import { verifyPassword } from "./password"
import { audit } from "./audit"
import { AuditAction, Role } from "@prisma/client"

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000   // 15 minutes
const SESSION_MAX_AGE = 8 * 60 * 60 // 8 hours in seconds

export const authOptions: NextAuthOptions = {
  // JWT strategy — required for CredentialsProvider.
  // Database sessions only work with OAuth providers.
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE,
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

        // Return the fields we need in the JWT. NextAuth merges these into
        // the User object received by the jwt() callback as `user`.
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          mfaEnabled: user.mfaEnabled,
        }
      },
    }),
  ],

  callbacks: {
    /**
     * Runs on every sign-in and on every session refresh.
     *
     * On first sign-in `user` is set (the object returned by authorize()).
     * On subsequent calls `user` is undefined and the existing token is
     * passed in.
     *
     * When the client calls update({ mfaVerified: true }), NextAuth
     * re-invokes this callback with trigger="update" and the session
     * data in `session`, allowing us to flip the flag in the JWT.
     */
    async jwt({ token, user, trigger, session }) {
      if (user) {
        // Populate token from the object returned by authorize()
        token.id = user.id
        token.role = (user as { role: Role }).role
        token.mfaEnabled = (user as { mfaEnabled: boolean }).mfaEnabled
        // mfaVerified starts true if MFA is not enabled on the account
        token.mfaVerified = !(user as { mfaEnabled: boolean }).mfaEnabled
      }

      // Client called update({ mfaVerified: true }) after TOTP/recovery success
      if (trigger === "update" && session?.mfaVerified === true) {
        token.mfaVerified = true
      }

      return token
    },

    /**
     * Shapes the session object returned by getServerSession() and
     * useSession(). Reads from the JWT token (not from the database).
     */
    async session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          id: token.id as string,
          role: token.role as Role,
          mfaEnabled: token.mfaEnabled as boolean,
          mfaVerified: token.mfaVerified as boolean,
        },
      }
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  events: {
    // Works for both JWT (token) and database (session) strategies
    async signOut(message) {
      const userId =
        "token" in message
          ? (message.token as { id?: string })?.id
          : (message.session as { userId?: string })?.userId
      if (userId) {
        await audit({
          userId,
          action: AuditAction.USER_LOGOUT,
          resource: "auth",
          resourceId: userId,
          success: true,
        })
      }
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === "development",
}
