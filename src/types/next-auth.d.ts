import { Role } from "@prisma/client"
import { DefaultSession } from "next-auth"

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role: Role
    mfaEnabled: boolean
    mfaVerified: boolean
    mustChangePassword: boolean
  }
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: Role
      mfaEnabled: boolean
      mfaVerified: boolean
      mustChangePassword: boolean
    } & DefaultSession["user"]
  }

  interface User {
    id: string
    role: Role
    mfaEnabled: boolean
    mustChangePassword: boolean
  }
}
