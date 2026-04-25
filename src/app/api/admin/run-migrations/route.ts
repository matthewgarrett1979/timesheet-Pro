/**
 * POST /api/admin/run-migrations
 *
 * TEMPORARY recovery endpoint — remove after production DB is patched.
 *
 * Runs `prisma migrate deploy` via child_process so pending migrations
 * are applied to the production database without a redeploy.
 *
 * Auth: x-recovery-token header must match SETUP_RECOVERY_TOKEN env var.
 */
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const recoveryToken = process.env.SETUP_RECOVERY_TOKEN
  if (!recoveryToken) {
    return Response.json({ error: "SETUP_RECOVERY_TOKEN env var not set" }, { status: 500 })
  }

  const provided = req.headers.get("x-recovery-token")
  if (!provided || provided !== recoveryToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  console.log("[run-migrations] Starting prisma migrate deploy…")

  try {
    const { stdout, stderr } = await execAsync(
      "npx prisma migrate deploy",
      { cwd: process.cwd(), timeout: 60000 }
    )

    console.log("[run-migrations] stdout:", stdout)
    if (stderr) console.log("[run-migrations] stderr:", stderr)

    return Response.json({ success: true, stdout, stderr })
  } catch (err: unknown) {
    const e = err as { message?: string; stdout?: string; stderr?: string }
    console.error("[run-migrations] Failed:", e.message)
    return Response.json(
      { success: false, error: e.message, stdout: e.stdout, stderr: e.stderr },
      { status: 500 }
    )
  }
}
