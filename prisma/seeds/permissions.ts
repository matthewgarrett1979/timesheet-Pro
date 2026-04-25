import { PrismaClient } from "@prisma/client"

const PERMISSIONS: { key: string; namespace: string; description: string }[] = [
  // Time entries
  { key: "time.create",               namespace: "time",       description: "Create time entries" },
  { key: "time.create.assigned-only", namespace: "time",       description: "Create time entries on assigned projects only" },
  { key: "time.view.own",             namespace: "time",       description: "View own time entries" },
  { key: "time.view.others",          namespace: "time",       description: "View other users' time entries" },
  { key: "time.edit.own.draft",       namespace: "time",       description: "Edit own draft time entries" },
  { key: "time.delete.own.draft",     namespace: "time",       description: "Delete own draft time entries" },
  { key: "time.delete.any",           namespace: "time",       description: "Delete any time entry" },
  // Timesheets
  { key: "timesheet.submit.own",      namespace: "timesheet",  description: "Submit own timesheets" },
  { key: "timesheet.approve.assigned",namespace: "timesheet",  description: "Approve timesheets on assigned projects" },
  { key: "timesheet.approve.all",     namespace: "timesheet",  description: "Approve any timesheet" },
  { key: "timesheet.override",        namespace: "timesheet",  description: "Override timesheet status" },
  { key: "timesheet.delete",          namespace: "timesheet",  description: "Delete timesheets" },
  { key: "timesheet.view.all",        namespace: "timesheet",  description: "View all timesheets" },
  // Clients
  { key: "clients.view",              namespace: "clients",    description: "View clients" },
  { key: "clients.create",            namespace: "clients",    description: "Create clients" },
  { key: "clients.edit",              namespace: "clients",    description: "Edit clients" },
  { key: "clients.archive",           namespace: "clients",    description: "Archive clients" },
  { key: "clients.delete",            namespace: "clients",    description: "Delete clients" },
  // Projects
  { key: "projects.view.assigned",    namespace: "projects",   description: "View assigned projects" },
  { key: "projects.view.all",         namespace: "projects",   description: "View all projects" },
  { key: "projects.create",           namespace: "projects",   description: "Create projects" },
  { key: "projects.edit",             namespace: "projects",   description: "Edit projects" },
  { key: "projects.delete",           namespace: "projects",   description: "Delete projects" },
  { key: "projects.phases.manage",    namespace: "projects",   description: "Manage project phases" },
  // Resource allocation
  { key: "allocation.self",           namespace: "allocation", description: "View and manage own resource allocations" },
  { key: "allocation.others",         namespace: "allocation", description: "Manage other users' resource allocations" },
  { key: "allocation.view.team",      namespace: "allocation", description: "View team resource allocations" },
  // Expenses
  { key: "expenses.submit",           namespace: "expenses",   description: "Submit expense claims" },
  { key: "expenses.approve",          namespace: "expenses",   description: "Approve expense claims" },
  { key: "expenses.delete.own.draft", namespace: "expenses",   description: "Delete own draft expenses" },
  { key: "expenses.delete.any",       namespace: "expenses",   description: "Delete any expense" },
  // Rates and financials
  { key: "rates.charge.view",         namespace: "rates",      description: "View charge rates" },
  { key: "rates.cost.view",           namespace: "rates",      description: "View cost rates" },
  { key: "financials.revenue.view",   namespace: "financials", description: "View revenue figures" },
  { key: "financials.margin.view",    namespace: "financials", description: "View margin and profitability data" },
  // Invoices
  { key: "invoices.view",             namespace: "invoices",   description: "View invoices" },
  { key: "invoices.create",           namespace: "invoices",   description: "Create invoices" },
  { key: "invoices.edit.draft",       namespace: "invoices",   description: "Edit draft invoices" },
  { key: "invoices.push.xero",        namespace: "invoices",   description: "Push invoices to Xero" },
  { key: "invoices.mark.paid",        namespace: "invoices",   description: "Mark invoices as paid" },
  { key: "invoices.delete",           namespace: "invoices",   description: "Delete invoices" },
  // Reports
  { key: "reports.own",               namespace: "reports",    description: "View own activity reports" },
  { key: "reports.project",           namespace: "reports",    description: "View project reports" },
  { key: "reports.company.revenue",   namespace: "reports",    description: "View company revenue reports" },
  { key: "reports.profitability",     namespace: "reports",    description: "View profitability reports" },
  { key: "reports.finance.dashboard", namespace: "reports",    description: "Access finance dashboard" },
  // User management
  { key: "users.view",                namespace: "users",      description: "View user accounts" },
  { key: "users.create",              namespace: "users",      description: "Create user accounts" },
  { key: "users.edit",                namespace: "users",      description: "Edit user accounts" },
  { key: "users.delete",              namespace: "users",      description: "Delete user accounts" },
  { key: "users.reset.password",      namespace: "users",      description: "Reset user passwords" },
  { key: "users.suspend",             namespace: "users",      description: "Suspend user accounts" },
  // Settings
  { key: "settings.profile",           namespace: "settings",  description: "Manage own profile" },
  { key: "settings.notifications.own", namespace: "settings",  description: "Manage own notification preferences" },
  { key: "settings.categories",        namespace: "settings",  description: "Manage time categories" },
  { key: "settings.personas",          namespace: "settings",  description: "Manage personas and permissions" },
  { key: "settings.company",           namespace: "settings",  description: "Manage company settings" },
  { key: "settings.lookandfeel",       namespace: "settings",  description: "Manage appearance settings" },
  { key: "settings.integrations",      namespace: "settings",  description: "Manage integrations" },
  { key: "settings.domain",            namespace: "settings",  description: "Manage organisation domain" },
  { key: "settings.audit",             namespace: "settings",  description: "View audit log" },
  { key: "settings.subscription",      namespace: "settings",  description: "Manage subscription and billing" },
  // SOW (placeholders for v3.10)
  { key: "sow.create",                namespace: "sow",        description: "Create statements of work" },
  { key: "sow.edit",                  namespace: "sow",        description: "Edit statements of work" },
  { key: "sow.send",                  namespace: "sow",        description: "Send statements of work to clients" },
  { key: "sow.sign",                  namespace: "sow",        description: "Sign statements of work" },
  { key: "sow.version",               namespace: "sow",        description: "Create new versions of statements of work" },
  { key: "sow.changeOrder",           namespace: "sow",        description: "Create change orders for statements of work" },
]

export async function seedPermissions(db: PrismaClient) {
  console.log("  Seeding permissions…")
  let created = 0

  for (const perm of PERMISSIONS) {
    const result = await db.permission.upsert({
      where:  { key: perm.key },
      update: {},
      create: perm,
    })
    if (result.key === perm.key) created++
  }

  console.log(`  ✓ ${PERMISSIONS.length} permissions upserted (${created} inserted)`)
}

export { PERMISSIONS }
