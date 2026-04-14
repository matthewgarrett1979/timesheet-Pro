import type { Metadata } from "next"
import { headers } from "next/headers"
import "./globals.css"
import Providers from "@/components/Providers"
import { getAppTheme, FONT_STACKS } from "@/lib/app-settings"

export const metadata: Metadata = {
  title: "Tech Timesheet",
  description: "Timesheet and billing management",
  // Prevent search engine indexing — this is an internal tool
  robots: { index: false, follow: false },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Nonce set by middleware for CSP
  const nonce = (await headers()).get("x-nonce") ?? ""

  // Fetch theme from DB on every request so colour changes apply immediately
  const theme = await getAppTheme()
  const fontStack = FONT_STACKS[theme.fontFamily] ?? FONT_STACKS.inter

  // Inject as CSS custom properties on <html> — highest specificity, available
  // to all descendant elements before first paint
  const themeStyle = {
    "--color-nav-bg": theme.primaryColor,
    "--color-accent": theme.accentColor,
    "--color-page-bg": theme.backgroundColor,
    "--font-body": fontStack,
  } as React.CSSProperties

  return (
    <html lang="en" style={themeStyle}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
