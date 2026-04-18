"use client"

export default function InvoicePrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="btn-secondary text-sm"
    >
      Print / Save PDF
    </button>
  )
}
