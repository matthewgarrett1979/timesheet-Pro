/**
 * GET  /api/settings/notifications  — fetch notification settings
 * PATCH /api/settings/notifications — update notification settings (ADMIN only)
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { audit, getClientIp } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { AuditAction, Role } from "@prisma/client"
import { z } from "zod"

const patchSchema = z.object({
  notificationsEnabled: z.boolean().optional(),
  reminderThreshold:    z.number().int().min(1).max(168).optional(),
  reminderDayOfWeek:    z.number().int().min(1).max(7).optional(),
  reminderTime:         z.string().regex(/^\d{2}:\d{2}$/).optional(),
})

export async function GET(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })
  if (session.user.role !== Role.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const settings = await db.appSettings.findUnique({ where: { id: "global" } })
  return NextResponse.json({
    notificationsEnabled: settings?.notificationsEnabled ?? false,
    reminderThreshold:    settings?.reminderThreshold    ?? 35,
    reminderDayOfWeek:    settings?.reminderDayOfWeek    ?? 5,
    reminderTime:         settings?.reminderTime         ?? "17:00",
  })
}

export async function PATCH(req: NextRequest) {
  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })
  if (session.user.role !== Role.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let body: z.infer<typeof patchSchema>
  try { body = patchSchema.parse(await req.json()) }
  catch (err) { return NextResponse.json({ error: "Invalid request body", detail: err }, { status: 400 }) }

  const updated = await db.appSettings.upsert({
    where:  { id: "global" },
    create: { id: "global", ...body },
    update: body,
  })

  await audit({ userId: session.user.id, action: AuditAction.SETTINGS_CHANGED, resource: "app-settings", metadata: { section: "notifications", changes: body }, ipAddress: getClientIp(req), userAgent: req.headers.get("user-agent") ?? undefined, success: true })

  return NextResponse.json(updated)
}
