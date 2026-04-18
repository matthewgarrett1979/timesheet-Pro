import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import Nav from "@/components/Nav"
import { APP_VERSION } from "@/lib/version"

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    redirect("/login")
  }

  if (session.user.mfaEnabled && !session.user.mfaVerified) {
    redirect("/mfa")
  }

  if (session.user.mustChangePassword) {
    redirect("/settings/change-password")
  }

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ fontFamily: "var(--font-body)", backgroundColor: "var(--color-page-bg, #f9fafb)" }}
    >
      <Nav
        user={{
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          role: session.user.role,
        }}
        version={APP_VERSION}
      />
      <main
        className="flex-1 overflow-y-auto pt-[52px] md:pt-0"
        style={{ backgroundColor: "var(--color-page-bg, #f9fafb)" }}
      >
        {children}
      </main>
    </div>
  )
}
