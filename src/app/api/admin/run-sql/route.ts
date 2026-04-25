/**
 * POST /api/admin/run-sql
 *
 * TEMPORARY recovery endpoint — remove after production DB is patched.
 *
 * SQL fallback for when prisma migrate deploy cannot run in Vercel's runtime.
 * Accepts a "sql" field in the JSON body and executes it via $executeRawUnsafe.
 *
 * Auth: x-recovery-token header must match SETUP_RECOVERY_TOKEN env var.
 */
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const recoveryToken = process.env.SETUP_RECOVERY_TOKEN
  if (!recoveryToken) {
    return NextResponse.json({ error: "SETUP_RECOVERY_TOKEN env var not set" }, { status: 500 })
  }

  const provided = req.headers.get("x-recovery-token")
  if (!provided || provided !== recoveryToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let sql: string
  try {
    const body = await req.json()
    if (!body?.sql || typeof body.sql !== "string") {
      return NextResponse.json({ error: "Missing or invalid 'sql' field in body" }, { status: 400 })
    }
    sql = body.sql
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  console.log("[run-sql] Executing:", sql.slice(0, 200))

  try {
    const result = await db.$executeRawUnsafe(sql)
    console.log("[run-sql] Success, rows affected:", result)
    return NextResponse.json({ success: true, rowsAffected: result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[run-sql] Failed:", message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
