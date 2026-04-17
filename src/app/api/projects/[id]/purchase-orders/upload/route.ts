/**
 * POST /api/projects/[id]/purchase-orders/upload — upload a PO/SOW PDF to Vercel Blob
 *
 * Only ADMIN and MANAGER roles may upload. The file is stored under
 * `projects/<projectId>/purchase-orders/<timestamp>-<sanitised-name>.pdf` with
 * public read access so that the returned URL can be embedded directly on the
 * project detail page.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { put } from "@vercel/blob"
import { getProjectForUser } from "@/lib/authorization"
import { checkRateLimit } from "@/lib/rate-limit"
import { Role } from "@prisma/client"

const MAX_BYTES = 20 * 1024 * 1024 // 20MB

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const rl = await checkRateLimit(req, "api")
  if (rl.denied) return NextResponse.json({ error: "Too many requests" }, { status: rl.status })

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  if (!session.user.mfaVerified) return NextResponse.json({ error: "MFA verification required" }, { status: 403 })
  if (session.user.role === "USER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const project = await getProjectForUser(id, session.user.id, session.user.role as Role)
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Invalid multipart payload" }, { status: 400 })
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 })
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF documents are accepted" }, { status: 415 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 20MB limit" }, { status: 413 })
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120)
  const key = `projects/${id}/purchase-orders/${Date.now()}-${safeName}`

  try {
    const blob = await put(key, file, {
      access: "public",
      contentType: "application/pdf",
    })
    return NextResponse.json({ url: blob.url, fileName: file.name })
  } catch (err) {
    return NextResponse.json(
      { error: "Upload failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
