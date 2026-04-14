/**
 * GET /api/cron/weekly-reminder
 *
 * Vercel cron job — runs Friday 17:00 UTC.
 * Sends a reminder to any manager/admin whose logged hours for the current
 * week are below the threshold configured in Settings → Notifications.
 *
 * Protected by CRON_SECRET header.
 */
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sendWeeklyReminder } from "@/lib/email"

function thisWeekRange(): { start: Date; end: Date } {
  const now = new Date()
  const day  = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const start = new Date(now)
  start.setDate(now.getDate() + diff)
  start.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const settings = await db.appSettings.findUnique({ where: { id: "global" } })
  if (!settings?.notificationsEnabled) {
    return NextResponse.json({ ok: true, skipped: "notifications disabled" })
  }

  const { start, end } = thisWeekRange()
  const users = await db.user.findMany({
    select: { id: true, name: true, email: true },
  })

  let sent = 0
  for (const user of users) {
    try {
      const entries = await db.timeEntry.findMany({
        where: { managerId: user.id, date: { gte: start, lte: end } },
        select: { hours: true },
      })
      const hoursLogged = entries.reduce((s, e) => s + Number(e.hours), 0)

      if (hoursLogged < settings.reminderThreshold) {
        await sendWeeklyReminder(user.email, user.name, hoursLogged, settings.reminderThreshold)
        sent++
      }
    } catch (err) {
      console.error(`[cron/weekly-reminder] failed for ${user.id}:`, err)
    }
  }

  return NextResponse.json({ ok: true, sent, checked: users.length })
}
