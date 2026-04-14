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
  // Prevent search engine indexing — this is an internal tool
  robots: { index: false, follow: false },
}

const FONT_FAMILY_MAP: Record<string, string> = {
  inter:   "'Inter', ui-sans-serif, system-ui, sans-serif",
  system:  "ui-sans-serif, system-ui, -apple-system, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  mono:    "ui-monospace, 'Cascadia Code', 'Source Code Pro', monospace",
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Nonce set by middleware for CSP (kept for future script/style nonce use)
  void (await headers()).get("x-nonce")

  // Fetch theme from DB on every render; fall back to defaults if unavailable.
  // Using findFirst() (no where clause) because AppSettings is a singleton row.
  // Applied as a style attribute on <html> — style attrs are NOT subject to
  // style-src CSP restrictions, unlike <style> tags which require a nonce.
  const settings = await db.appSettings.findFirst().catch(() => null)

  const cssVars = {
    "--color-nav-bg":  settings?.primaryColor    ?? "#1e3a5f",
    "--color-accent":  settings?.accentColor     ?? "#2563eb",
    "--color-page-bg": settings?.backgroundColor ?? "#f9fafb",
    "--font-body":     FONT_FAMILY_MAP[settings?.fontFamily ?? "inter"] ?? FONT_FAMILY_MAP.inter,
  } as React.CSSProperties

  return (
    <html lang="en" style={cssVars}>
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
