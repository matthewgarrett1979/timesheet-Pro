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
import { Role } from "@prisma/client"
import { db } from "./db"

// ---------------------------------------------------------------------------
// Client authorisation
// ---------------------------------------------------------------------------

/**
 * Return a client only if the caller owns it (or is ADMIN).
 * Returns null if not found or not authorised.
 */
export async function getClientForUser(clientId: string, userId: string, role: Role) {
  return db.client.findFirst({
    where: {
      id: clientId,
      ...(role !== Role.ADMIN ? { managerId: userId } : {}),
    },
  })
}

/**
 * List clients scoped to the calling user (ADMINs see all).
 */
export async function listClientsForUser(userId: string, role: Role) {
  return db.client.findMany({
    where: role !== Role.ADMIN ? { managerId: userId } : {},
    orderBy: { name: "asc" },
  })
}

// ---------------------------------------------------------------------------
// Timesheet authorisation
// ---------------------------------------------------------------------------

/**
 * Return a timesheet only if the caller owns it (or is ADMIN).
 */
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
    include: { entries: true, client: true },
  })
}

/**
 * List timesheets scoped to the calling user and optionally filtered by client.
 * Callers must supply their own userId — never trust the request body for this.
 */
export async function listTimesheetsForUser(
  userId: string,
  role: Role,
  filters?: { clientId?: string; status?: string }
) {
  return db.timesheet.findMany({
    where: {
      ...(role !== Role.ADMIN ? { managerId: userId } : {}),
      ...(filters?.clientId ? { clientId: filters.clientId } : {}),
      ...(filters?.status ? { status: filters.status as never } : {}),
    },
    include: { client: { select: { id: true, name: true, reference: true } } },
    orderBy: { weekStart: "desc" },
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
// Invoice authorisation
// ---------------------------------------------------------------------------

export async function listInvoicesForUser(userId: string, role: Role) {
  return db.invoice.findMany({
    where: role !== Role.ADMIN ? { managerId: userId } : {},
    include: { client: { select: { id: true, name: true } } },
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
