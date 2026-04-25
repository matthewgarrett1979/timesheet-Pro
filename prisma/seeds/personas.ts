import { PrismaClient, PersonaCompanySize } from "@prisma/client"

type PersonaDef = {
  key: string
  name: string
  description: string
  minCompanySize: PersonaCompanySize
  permissions: string[] | "ALL"
}

export const SYSTEM_PERSONAS: PersonaDef[] = [
  {
    key: "company_owner",
    name: "Company Owner",
    description: "Manages subscription, billing, domain, authentication. First user.",
    minCompanySize: PersonaCompanySize.SIZE_0_10,
    permissions: "ALL",
  },
  {
    key: "company_admin",
    name: "Company Admin",
    description: "Operational administrator. Manages users, clients, projects, settings.",
    minCompanySize: PersonaCompanySize.SIZE_0_10,
    permissions: [
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
    ],
  },
  {
    key: "project_manager",
    name: "Project Manager",
    description: "Approves time on assigned projects, manages project delivery.",
    minCompanySize: PersonaCompanySize.SIZE_0_10,
    permissions: [
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
    ],
  },
  {
    key: "consultant",
    name: "Consultant",
    description: "Standard time recording user. Logs time, submits timesheets.",
    minCompanySize: PersonaCompanySize.SIZE_0_10,
    permissions: [
      "time.create", "time.create.assigned-only", "time.view.own",
      "time.edit.own.draft", "time.delete.own.draft",
      "timesheet.submit.own",
      "projects.view.assigned",
      "allocation.self",
      "expenses.submit", "expenses.delete.own.draft",
      "reports.own",
      "settings.profile", "settings.notifications.own",
    ],
  },
  {
    key: "finance_user",
    name: "Finance User",
    description: "Generates invoices, tracks revenue, manages billing data.",
    minCompanySize: PersonaCompanySize.SIZE_11_50,
    permissions: [
      "timesheet.view.all",
      "invoices.view", "invoices.create", "invoices.edit.draft",
      "invoices.push.xero", "invoices.mark.paid", "invoices.delete",
      "expenses.approve",
      "rates.charge.view", "rates.cost.view",
      "financials.revenue.view", "financials.margin.view",
      "reports.project", "reports.company.revenue",
      "reports.profitability", "reports.finance.dashboard",
      "settings.profile", "settings.notifications.own", "settings.integrations",
    ],
  },
  {
    key: "senior_management",
    name: "Senior Management",
    description: "Read-only commercial oversight across the firm.",
    minCompanySize: PersonaCompanySize.SIZE_11_50,
    permissions: [
      "time.view.others",
      "timesheet.view.all",
      "clients.view",
      "projects.view.all",
      "allocation.view.team",
      "rates.charge.view", "rates.cost.view",
      "financials.revenue.view", "financials.margin.view",
      "reports.project", "reports.company.revenue",
      "reports.profitability", "reports.finance.dashboard",
      "settings.profile", "settings.notifications.own",
    ],
  },
  {
    key: "client_approver",
    name: "External Client Approver",
    description: "Customer-side user. Approves time and signs SOWs (used in v4.1+ portal).",
    minCompanySize: PersonaCompanySize.SIZE_0_10,
    permissions: [], // Permissions added in v4.1 customer portal
  },
]

export async function seedPersonas(db: PrismaClient) {
  console.log("  Seeding personas…")

  // Fetch all permission rows once for lookup by key
  const allPermissions = await db.permission.findMany({ select: { id: true, key: true } })
  const permByKey = new Map(allPermissions.map(p => [p.key, p.id]))

  for (const def of SYSTEM_PERSONAS) {
    // Upsert the persona itself
    const persona = await db.persona.upsert({
      where:  { key: def.key },
      update: { name: def.name, description: def.description, minCompanySize: def.minCompanySize },
      create: {
        key:           def.key,
        name:          def.name,
        description:   def.description,
        isSystem:      true,
        minCompanySize: def.minCompanySize,
      },
    })

    // Resolve the permission IDs to assign
    const permissionIds: string[] =
      def.permissions === "ALL"
        ? allPermissions.map(p => p.id)
        : def.permissions
            .map(k => permByKey.get(k))
            .filter((id): id is string => id !== undefined)

    if (permissionIds.length > 0) {
      await db.personaPermission.createMany({
        data: permissionIds.map(permissionId => ({ personaId: persona.id, permissionId })),
        skipDuplicates: true,
      })
    }

    console.log(`    ✓ ${def.name} (${permissionIds.length} permissions)`)
  }

  console.log(`  ✓ ${SYSTEM_PERSONAS.length} personas seeded`)
}
