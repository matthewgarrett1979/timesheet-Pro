/**
 * Row-level authorisation helpers.
 *
 * Every database query for sensitive resources MUST go through one of these
 * helpers. They enforce that a user can only access their own data,
 * regardless of what the UI presents or what parameters arrive in the request.
 *
 * An ADMIN can read all resources but still cannot read another user's
 * encrypted secrets.
 */
import { Role, TimesheetStatus, TimeEntryStatus } from "@prisma/client"
import { db } from "./db"

// ---------------------------------------------------------------------------
// Client authorisation
// ---------------------------------------------------------------------------

export async function getClientForUser(clientId: string, userId: string, role: Role) {
  if (role === Role.USER) return null
  return db.client.findFirst({
    where: {
      id: clientId,
      ...(role !== Role.ADMIN ? { managerId: userId } : {}),
    },
  })
}

export async function listClientsForUser(userId: string, role: Role) {
  if (role === Role.USER) return []
  return db.client.findMany({
    where: role !== Role.ADMIN ? { managerId: userId } : {},
    orderBy: { name: "asc" },
  })
}

// ---------------------------------------------------------------------------
// Time entry authorisation
// ---------------------------------------------------------------------------

const TIME_ENTRY_INCLUDE = {
  client:        { select: { id: true, name: true, reference: true, defaultRate: true } },
  project:       { select: { id: true, name: true, rateOverride: true, billingType: true } },
  phase:         { select: { id: true, name: true } },
  category:      { select: { id: true, name: true, colour: true, isBillable: true } },
  purchaseOrder: { select: { id: true, poNumber: true, status: true } },
} as const

export async function getTimeEntryForUser(
  entryId: string,
  userId: string,
  role: Role
) {
  return db.timeEntry.findFirst({
    where: {
      id: entryId,
      ...(role !== Role.ADMIN ? { managerId: userId } : {}),
    },
    include: TIME_ENTRY_INCLUDE,
  })
}

export async function listTimeEntriesForUser(
  userId: string,
  role: Role,
  filters?: {
    clientId?:    string
    projectId?:   string
    phaseId?:     string
    categoryId?:  string
    status?:      string
    isBillable?:  boolean
    timesheetId?: string | null  // null = unsubmitted entries
    dateFrom?:    string
    dateTo?:      string
  }
) {
  return db.timeEntry.findMany({
    where: {
      ...(role !== Role.ADMIN ? { managerId: userId } : {}),
      ...(filters?.clientId   ? { clientId:   filters.clientId }   : {}),
      ...(filters?.projectId  ? { projectId:  filters.projectId }  : {}),
      ...(filters?.phaseId    ? { phaseId:    filters.phaseId }    : {}),
      ...(filters?.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters?.status     ? { status: filters.status as TimeEntryStatus } : {}),
      ...(filters?.isBillable !== undefined ? { isBillable: filters.isBillable } : {}),
      // null means "unsubmitted" — timesheetId IS NULL
      ...(filters?.timesheetId !== undefined
        ? { timesheetId: filters.timesheetId }
        : {}),
      ...(filters?.dateFrom || filters?.dateTo
        ? {
            date: {
              ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
              ...(filters.dateTo   ? { lte: new Date(filters.dateTo) }   : {}),
            },
          }
        : {}),
    },
    include: TIME_ENTRY_INCLUDE,
    orderBy: { date: "desc" },
  })
}

// ---------------------------------------------------------------------------
// Timesheet authorisation
// ---------------------------------------------------------------------------

const TIMESHEET_INCLUDE = {
  client: {
    select: {
      id: true, name: true, reference: true, defaultRate: true,
      approvalType: true, approvalGranularity: true,
    },
  },
  entries: {
    include: {
      project:  { select: { id: true, name: true, rateOverride: true, billingType: true } },
      phase:    { select: { id: true, name: true } },
      category: { select: { id: true, name: true, colour: true } },
    },
  },
} as const

export async function getTimesheetForUser(
  timesheetId: string,
  userId: string,
  role: Role
) {
  return db.timesheet.findFirst({
    where: {
      id: timesheetId,
      ...(role !== Role.ADMIN ? { managerId: userId } : {}),
    },
    include: TIMESHEET_INCLUDE,
  })
}

export async function listTimesheetsForUser(
  userId: string,
  role: Role,
  filters?: { clientId?: string; status?: string; projectId?: string }
) {
  return db.timesheet.findMany({
    where: {
      ...(role !== Role.ADMIN ? { managerId: userId } : {}),
      ...(filters?.clientId ? { clientId: filters.clientId } : {}),
      ...(filters?.status   ? { status: filters.status as TimesheetStatus } : {}),
      ...(filters?.projectId
        ? { entries: { some: { projectId: filters.projectId } } }
        : {}),
    },
    include: {
      client: { select: { id: true, name: true, reference: true, defaultRate: true } },
      entries: {
        include: {
          project:  { select: { id: true, name: true, rateOverride: true } },
          phase:    { select: { id: true, name: true } },
          category: { select: { id: true, name: true, colour: true } },
        },
      },
    },
    orderBy: { periodStart: "desc" },
  })
}

/**
 * Verify that a client belongs to the calling user before creating a timesheet
 * for it. Prevents cross-client data injection.
 */
export async function assertClientOwnership(
  clientId: string,
  userId: string,
  role: Role
): Promise<void> {
  const client = await getClientForUser(clientId, userId, role)
  if (!client) {
    throw new UnauthorisedError(
      `User ${userId} does not own client ${clientId}`
    )
  }
}

// ---------------------------------------------------------------------------
// Project authorisation
// ---------------------------------------------------------------------------

export async function getProjectForUser(projectId: string, userId: string, role: Role) {
  if (role === Role.USER) {
    const assignment = await db.userProject.findUnique({
      where: { userId_projectId: { userId, projectId } },
      include: { project: { include: { client: { select: { id: true, name: true } } } } },
    })
    return assignment?.project ?? null
  }
  return db.project.findFirst({
    where: {
      id: projectId,
      ...(role !== Role.ADMIN ? { managerId: userId } : {}),
    },
    include: { client: { select: { id: true, name: true } } },
  })
}

export async function listProjectsForUser(
  userId: string,
  role: Role,
  filters?: { clientId?: string; active?: boolean }
) {
  if (role === Role.USER) {
    const assignments = await db.userProject.findMany({
      where: { userId },
      include: { project: { include: { client: { select: { id: true, name: true } } } } },
    })
    let projects = assignments.map((a) => a.project)
    if (filters?.clientId !== undefined) {
      projects = projects.filter((p) => p.clientId === filters.clientId)
    }
    if (filters?.active !== undefined) {
      projects = projects.filter((p) => p.active === filters.active)
    }
    return projects
  }
  return db.project.findMany({
    where: {
      ...(role !== Role.ADMIN ? { managerId: userId } : {}),
      ...(filters?.clientId !== undefined ? { clientId: filters.clientId } : {}),
      ...(filters?.active   !== undefined ? { active:   filters.active }   : {}),
    },
    include: { client: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  })
}

// ---------------------------------------------------------------------------
// Expense authorisation
// ---------------------------------------------------------------------------

export async function getExpenseForUser(expenseId: string, userId: string, role: Role) {
  return db.expense.findFirst({
    where: {
      id: expenseId,
      ...(role !== Role.ADMIN ? { managerId: userId } : {}),
    },
    include: { client: { select: { id: true, name: true } } },
  })
}

export async function listExpensesForUser(
  userId: string,
  role: Role,
  filters?: { clientId?: string; status?: string }
) {
  return db.expense.findMany({
    where: {
      ...(role !== Role.ADMIN ? { managerId: userId } : {}),
      ...(filters?.clientId ? { clientId: filters.clientId } : {}),
      ...(filters?.status   ? { status: filters.status as never } : {}),
    },
    include: { client: { select: { id: true, name: true } } },
    orderBy: { date: "desc" },
  })
}

// ---------------------------------------------------------------------------
// Invoice authorisation
// ---------------------------------------------------------------------------

export async function listInvoicesForUser(userId: string, role: Role) {
  if (role === Role.USER) return []
  return db.invoice.findMany({
    where: role !== Role.ADMIN ? { managerId: userId } : {},
    include: {
      client: {
        select: {
          id: true,
          name: true,
          companyName: true,
          tradingName: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          county: true,
          postcode: true,
          country: true,
          vatNumber: true,
          contactName: true,
          contactEmail: true,
          contactPhone: true,
          purchaseOrderNumber: true,
          invoicePaymentTerms: true,
          invoiceCurrency: true,
          defaultRate: true,
        },
      },
      purchaseOrder: {
        select: {
          id: true,
          poNumber: true,
          sowReference: true,
          value: true,
          currency: true,
          status: true,
          expiryDate: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })
}

// ---------------------------------------------------------------------------
// Shared error type
// ---------------------------------------------------------------------------

export class UnauthorisedError extends Error {
  readonly status = 403
  constructor(message: string) {
    super(message)
    this.name = "UnauthorisedError"
  }
}
