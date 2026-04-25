import { db } from "@/lib/db"

// ---------------------------------------------------------------------------
// Permission key union — 60 keys total
// ---------------------------------------------------------------------------

export type PermissionKey =
  // Time entries
  | "time.create"
  | "time.create.assigned-only"
  | "time.view.own"
  | "time.view.others"
  | "time.edit.own.draft"
  | "time.delete.own.draft"
  | "time.delete.any"
  // Timesheets
  | "timesheet.submit.own"
  | "timesheet.approve.assigned"
  | "timesheet.approve.all"
  | "timesheet.override"
  | "timesheet.delete"
  | "timesheet.view.all"
  // Clients
  | "clients.view"
  | "clients.create"
  | "clients.edit"
  | "clients.archive"
  | "clients.delete"
  // Projects
  | "projects.view.assigned"
  | "projects.view.all"
  | "projects.create"
  | "projects.edit"
  | "projects.delete"
  | "projects.phases.manage"
  // Resource allocation
  | "allocation.self"
  | "allocation.others"
  | "allocation.view.team"
  // Expenses
  | "expenses.submit"
  | "expenses.approve"
  | "expenses.delete.own.draft"
  | "expenses.delete.any"
  // Rates and financial
  | "rates.charge.view"
  | "rates.cost.view"
  | "financials.revenue.view"
  | "financials.margin.view"
  // Invoices
  | "invoices.view"
  | "invoices.create"
  | "invoices.edit.draft"
  | "invoices.push.xero"
  | "invoices.mark.paid"
  | "invoices.delete"
  // Reports
  | "reports.own"
  | "reports.project"
  | "reports.company.revenue"
  | "reports.profitability"
  | "reports.finance.dashboard"
  // User management
  | "users.view"
  | "users.create"
  | "users.edit"
  | "users.delete"
  | "users.reset.password"
  | "users.suspend"
  // Settings
  | "settings.profile"
  | "settings.notifications.own"
  | "settings.categories"
  | "settings.personas"
  | "settings.company"
  | "settings.lookandfeel"
  | "settings.integrations"
  | "settings.domain"
  | "settings.audit"
  | "settings.subscription"
  // SOW (placeholders for v3.10)
  | "sow.create"
  | "sow.edit"
  | "sow.send"
  | "sow.sign"
  | "sow.version"
  | "sow.changeOrder"

// ---------------------------------------------------------------------------
// Primary check — persona-aware with legacy role fallback
// ---------------------------------------------------------------------------

export async function hasPermission(
  userId: string,
  key: PermissionKey
): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      persona: {
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      },
    },
  })

  if (!user) return false

  // Persona path — explicit permission keys take precedence over role
  if (user.persona) {
    return user.persona.permissions.some(pp => pp.permission.key === key)
  }

  // Legacy path — role-based fallback for users not yet assigned a persona
  return legacyRoleCheck(user.role, key)
}

export async function requirePermission(
  userId: string,
  key: PermissionKey
): Promise<void> {
  const allowed = await hasPermission(userId, key)
  if (!allowed) throw new Error("FORBIDDEN")
}

// ---------------------------------------------------------------------------
// Legacy role-based fallback
// Mirrors the persona permission lists so that pre-migration users behave
// identically to post-migration users with the equivalent persona.
// ---------------------------------------------------------------------------

// company_admin permissions (all keys except settings.subscription)
const ADMIN_KEYS: PermissionKey[] = [
  "time.create", "time.create.assigned-only", "time.view.own", "time.view.others",
  "time.edit.own.draft", "time.delete.own.draft", "time.delete.any",
  "timesheet.submit.own", "timesheet.approve.assigned", "timesheet.approve.all",
  "timesheet.override", "timesheet.delete", "timesheet.view.all",
  "clients.view", "clients.create", "clients.edit", "clients.archive", "clients.delete",
  "projects.view.assigned", "projects.view.all", "projects.create", "projects.edit",
  "projects.delete", "projects.phases.manage",
  "allocation.self", "allocation.others", "allocation.view.team",
  "expenses.submit", "expenses.approve", "expenses.delete.own.draft", "expenses.delete.any",
  "rates.charge.view", "rates.cost.view",
  "financials.revenue.view", "financials.margin.view",
  "invoices.view", "invoices.create", "invoices.edit.draft",
  "invoices.push.xero", "invoices.mark.paid", "invoices.delete",
  "reports.own", "reports.project", "reports.company.revenue",
  "reports.profitability", "reports.finance.dashboard",
  "users.view", "users.create", "users.edit", "users.delete",
  "users.reset.password", "users.suspend",
  "settings.profile", "settings.notifications.own", "settings.categories",
  "settings.personas", "settings.company", "settings.lookandfeel",
  "settings.integrations", "settings.domain", "settings.audit",
  "sow.create", "sow.edit", "sow.send", "sow.sign", "sow.version", "sow.changeOrder",
]

// project_manager permissions
const MANAGER_KEYS: PermissionKey[] = [
  "time.create", "time.view.own", "time.view.others",
  "time.edit.own.draft", "time.delete.own.draft",
  "timesheet.submit.own", "timesheet.approve.assigned", "timesheet.approve.all",
  "timesheet.view.all",
  "clients.view", "clients.edit",
  "projects.view.all", "projects.create", "projects.edit", "projects.phases.manage",
  "allocation.self", "allocation.others", "allocation.view.team",
  "expenses.submit", "expenses.approve", "expenses.delete.own.draft",
  "rates.charge.view", "financials.revenue.view",
  "reports.own", "reports.project",
  "settings.profile", "settings.notifications.own", "settings.categories",
  "sow.create", "sow.edit", "sow.send",
]

// consultant permissions
const USER_KEYS: PermissionKey[] = [
  "time.create", "time.create.assigned-only", "time.view.own",
  "time.edit.own.draft", "time.delete.own.draft",
  "timesheet.submit.own",
  "projects.view.assigned",
  "allocation.self",
  "expenses.submit", "expenses.delete.own.draft",
  "reports.own",
  "settings.profile", "settings.notifications.own",
]

function legacyRoleCheck(role: string, key: PermissionKey): boolean {
  if (role === "ADMIN")   return ADMIN_KEYS.includes(key)
  if (role === "MANAGER") return MANAGER_KEYS.includes(key)
  if (role === "USER")    return USER_KEYS.includes(key)
  return false
}
