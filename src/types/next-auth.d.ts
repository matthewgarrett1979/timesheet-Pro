import { Role } from "@prisma/client"
import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: Role
      mfaEnabled: boolean
      mfaVerified: boolean
    } & DefaultSession["user"]
  }

  interface User {
    id: string
    role: Role
    mfaEnabled: boolean
  }
}
