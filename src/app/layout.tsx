import type { Metadata } from "next"
import { headers } from "next/headers"
import "./globals.css"
import Providers from "@/components/Providers"

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

  return (
    <html lang="en">
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
