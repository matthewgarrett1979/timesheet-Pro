/**
 * GET   /api/settings/appearance  — fetch global theme settings
 * PATCH /api/settings/appearance  — update theme settings (ADMIN only)
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { checkRateLimit } from "@/lib/rate-limit"
import { DEFAULT_THEME } from "@/lib/app-settings"
import { z } from "zod"

const HEX_COLOR = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex colour e.g. #1e293b")

const updateSchema = z.object({
  primaryColor: HEX_COLOR.optional(),
  accentColor: HEX_COLOR.optional(),
  backgroundColor: HEX_COLOR.optional(),
  fontFamily: z.enum(["inter", "system", "georgia", "mono"]).optional(),
  navStyle: z.enum(["sidebar", "topbar"]).optional(),
  compactMode: z.boolean().optional(),
})

export async function GET(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) {
    return NextResponse.json({ error: "Too many requests" }, { status: rl.status })
  }

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  }
  if (!session.user.mfaVerified) {
    return NextResponse.json({ error: "MFA verification required" }, { status: 403 })
  }

  try {
    const settings = await db.appSettings.findUnique({ where: { id: "global" } })
    return NextResponse.json(settings ?? DEFAULT_THEME)
  } catch {
    return NextResponse.json(DEFAULT_THEME)
  }
}

export async function PATCH(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) {
    return NextResponse.json({ error: "Too many requests" }, { status: rl.status })
  }

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  }
  if (!session.user.mfaVerified) {
    return NextResponse.json({ error: "MFA verification required" }, { status: 403 })
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 })
  }

  let body: z.infer<typeof updateSchema>
  try {
    body = updateSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const updated = await db.appSettings.upsert({
    where: { id: "global" },
    update: body,
    create: { id: "global", ...DEFAULT_THEME, ...body },
  })

  return NextResponse.json(updated)
}
