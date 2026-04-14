import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import Nav from "@/components/Nav"
import { getAppTheme, FONT_STACKS } from "@/lib/app-settings"
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

  const theme = await getAppTheme()
  const fontStack = FONT_STACKS[theme.fontFamily] ?? FONT_STACKS.inter

  // Inject theme as CSS custom properties on :root so all components can consume them
  const themeVars = [
    `:root {`,
    `  --color-nav-bg: ${theme.primaryColor};`,
    `  --color-accent: ${theme.accentColor};`,
    `  --color-page-bg: ${theme.backgroundColor};`,
    `  --font-body: ${fontStack};`,
    `}`,
  ].join("\n")

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ fontFamily: "var(--font-body)", backgroundColor: "var(--color-page-bg, #f9fafb)" }}
    >
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: themeVars }} />
      <Nav
        user={{
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          role: session.user.role,
        }}
        version={APP_VERSION}
      />
      <main className="flex-1 overflow-y-auto" style={{ backgroundColor: "var(--color-page-bg, #f9fafb)" }}>
        {children}
      </main>
    </div>
  )
}
