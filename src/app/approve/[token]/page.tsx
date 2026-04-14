/**
 * /approve/[token]  — Customer-facing approval page
 *
 * Shown when a customer clicks the approval link in their email.
 * Renders a page showing the timesheet details and Approve / Request Changes buttons.
 *
 * Public route — no auth required.
 */
"use client"

import { useState } from "react"
import { useParams, useSearchParams } from "next/navigation"

export default function ApprovalPage() {
  const params       = useParams()
  const token        = params.token as string
  const searchParams = useSearchParams()
  const defaultAction = searchParams.get("action") // "approve" | "reject" pre-filled from email link

  const [step, setStep]   = useState<"form" | "done" | "error">("form")
  const [action, setAction]  = useState<"approve" | "reject" | null>(
    defaultAction === "approve" ? "approve" : defaultAction === "reject" ? "reject" : null
  )
  const [email, setEmail]    = useState("")
  const [note, setNote]      = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !action) return
    if (action === "reject" && !note.trim()) return

    setSubmitting(true)
    try {
      const res = await fetch(`/api/approvals/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approverEmail: email,
          action,
          comment: note || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage(data.error ?? "Something went wrong.")
        setStep("error")
      } else {
        setStep("done")
        setMessage(action === "approve"
          ? "Timesheet approved. Thank you — we'll be in touch shortly."
          : "Your request for changes has been sent. We'll review and get back to you."
        )
      }
    } catch {
      setMessage("Network error. Please try again.")
      setStep("error")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="bg-slate-800 px-6 py-5">
          <h1 className="text-xl font-bold text-white">Timesheet Approval</h1>
          <p className="text-sm text-slate-300 mt-1">Tech Timesheet</p>
        </div>

        <div className="px-6 py-6">
          {step === "done" && (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                   style={{ backgroundColor: action === "approve" ? "#dcfce7" : "#fef3c7" }}>
                <span className="text-3xl">{action === "approve" ? "✓" : "↩"}</span>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                {action === "approve" ? "Timesheet Approved" : "Changes Requested"}
              </h2>
              <p className="text-sm text-gray-600">{message}</p>
            </div>
          )}

          {step === "error" && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm font-medium text-red-800 mb-1">Unable to process</p>
              <p className="text-sm text-red-600">{message}</p>
              <p className="text-xs text-red-400 mt-3">
                This link may have already been used or has expired.
                Please contact the sender to request a new approval link.
              </p>
            </div>
          )}

          {step === "form" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-gray-600">
                Please review and confirm your decision for this timesheet.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Your email address *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@company.com"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Decision *</p>
                <div className="flex gap-3">
                  <label className={`flex items-center gap-2 px-4 py-3 border-2 rounded-lg cursor-pointer flex-1 ${action === "approve" ? "border-green-500 bg-green-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <input type="radio" name="action" value="approve" checked={action === "approve"} onChange={() => setAction("approve")} className="sr-only" />
                    <span className="text-green-600 font-medium text-sm">✓ Approve</span>
                  </label>
                  <label className={`flex items-center gap-2 px-4 py-3 border-2 rounded-lg cursor-pointer flex-1 ${action === "reject" ? "border-amber-500 bg-amber-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <input type="radio" name="action" value="reject" checked={action === "reject"} onChange={() => setAction("reject")} className="sr-only" />
                    <span className="text-amber-600 font-medium text-sm">↩ Request Changes</span>
                  </label>
                </div>
              </div>

              {action === "reject" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Please describe the changes required *
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="e.g. The hours logged for project X appear incorrect..."
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={!email || !action || (action === "reject" && !note.trim()) || submitting}
                className={`w-full py-2.5 rounded-md text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  action === "approve" ? "bg-green-600 hover:bg-green-700" :
                  action === "reject"  ? "bg-amber-600 hover:bg-amber-700" :
                  "bg-gray-400"
                }`}
              >
                {submitting ? "Submitting…" : action === "approve" ? "Confirm Approval" : action === "reject" ? "Send Request for Changes" : "Select a decision above"}
              </button>
            </form>
          )}
        </div>

        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center">
            This link is single-use and expires after 30 days.
            If you have questions, contact the sender directly.
          </p>
        </div>
      </div>
    </div>
  )
}
