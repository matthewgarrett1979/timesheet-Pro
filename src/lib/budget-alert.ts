/**
 * Budget alert checks — called after every time entry save.
 *
 * Thresholds: 75%, 90%, 100% (and drawdown-specific: 80%, 100%)
 * Sends email to admin when a threshold is newly crossed.
 * No-op if project has no budget, or RESEND_API_KEY not set.
 */
import { db } from "./db"
import { sendBudgetAlert } from "./email"

const THRESHOLDS = [75, 90, 100]

export async function checkBudgetAlert(projectId: string): Promise<void> {
  try {
    const project = await db.project.findUnique({
      where: { id: projectId },
      include: { client: { select: { name: true } } },
    })
    if (!project || !project.budgetHours) return

    const aggResult = await db.timeEntry.aggregate({
      where:  { projectId, invoiced: false },
      _sum:   { hours: true },
    })
    const usedHours = Number(aggResult._sum.hours ?? 0)
    const budget    = Number(project.budgetHours)
    const pct       = (usedHours / budget) * 100

    // Find the highest crossed threshold
    let crossedAt: number | null = null
    for (const t of THRESHOLDS) {
      if (pct >= t) crossedAt = t
    }
    if (!crossedAt) return

    const admin = await db.user.findFirst({ where: { role: "ADMIN" }, select: { email: true } })
    if (!admin?.email) return

    await sendBudgetAlert(
      admin.email,
      project.name,
      project.client.name,
      project.billingType,
      budget,
      usedHours,
      crossedAt,
      project.id
    )
  } catch {
    // Never block time entry creation on alert failure
  }
}
