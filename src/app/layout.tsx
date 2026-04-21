import type { Metadata } from "next"
import { headers } from "next/headers"
import "./globals.css"
import Providers from "@/components/Providers"
import { db } from "@/lib/db"
import type React from "react"
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "Tech Timesheet",
  description: "Timesheet and billing management",
  robots: { index: false, follow: false },
}

// Body font options selectable via AppSettings.fontFamily.
// Design system defaults pair IBM Plex Sans (body) with Space Grotesk (display)
// and IBM Plex Mono (kickers / tabular numerals).
const FONT_FAMILY_MAP: Record<string, string> = {
  inter:   "'Inter', ui-sans-serif, system-ui, sans-serif",
  plex:    "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
  system:  "ui-sans-serif, system-ui, -apple-system, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  mono:    "'IBM Plex Mono', ui-monospace, 'Cascadia Code', monospace",
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  void (await headers()).get("x-nonce")

  const settings = await db.appSettings.findFirst().catch(() => null)

  const cssVars = {
    "--color-nav-bg":  settings?.primaryColor    ?? "#1A1F2E",
    "--color-accent":  settings?.accentColor     ?? "#4C5BD4",
    "--color-page-bg": settings?.backgroundColor ?? "#F7F5F0",
    "--font-body":     FONT_FAMILY_MAP[settings?.fontFamily ?? "plex"] ?? FONT_FAMILY_MAP.plex,
  } as React.CSSProperties

  return (
    <html lang="en" style={cssVars}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Design-system fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
