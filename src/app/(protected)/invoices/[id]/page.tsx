import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Role } from "@prisma/client"
import InvoicePrintButton from "./InvoicePrintButton"

export const dynamic = "force-dynamic"

interface Props { params: Promise<{ id: string }> }

export default async function InvoicePreviewPage({ params }: Props) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect("/login")
  if (session.user.role === Role.USER) redirect("/dashboard")

  const role = session.user.role as Role

  const [invoice, settings] = await Promise.all([
    db.invoice.findFirst({
      where: {
        id,
        ...(role !== Role.ADMIN ? { managerId: session.user.id } : {}),
      },
      include: {
        client: {
          select: {
            id: true, name: true, companyName: true, tradingName: true,
            addressLine1: true, addressLine2: true, city: true, county: true,
            postcode: true, country: true, vatNumber: true,
            contactName: true, contactEmail: true, contactPhone: true,
            purchaseOrderNumber: true, invoicePaymentTerms: true, invoiceCurrency: true,
            defaultRate: true,
          },
        },
      },
    }),
    db.appSettings.findFirst(),
  ])

  if (!invoice) notFound()

  // Fetch timesheets to get line items
  const timesheets = invoice.timesheetIds.length
    ? await db.timesheet.findMany({
        where: { id: { in: invoice.timesheetIds } },
        include: {
          entries: {
            include: {
              project:  { select: { id: true, name: true, rateOverride: true } },
              phase:    { select: { id: true, name: true } },
              category: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { periodStart: "asc" },
      })
    : []

  const dueDate = new Date(invoice.createdAt)
  const paymentTerms = invoice.client.invoicePaymentTerms ?? 30
  dueDate.setDate(dueDate.getDate() + paymentTerms)

  const invoiceNumber = `${settings?.invoicePrefix ?? "INV"}-${id.slice(-6).toUpperCase()}`
  const currency = invoice.client.invoiceCurrency || invoice.currency || "GBP"

  function fmt(v: number) {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(v)
  }

  function fmtDate(d: Date | string) {
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  }

  // Build line items: group billable entries by project
  type LineItem = { description: string; hours: number; rate: number; amount: number }
  const lineItems: LineItem[] = []
  const clientRate = invoice.client.defaultRate ? Number(invoice.client.defaultRate) : 0

  for (const ts of timesheets) {
    const byProject: Record<string, { hours: number; rate: number; desc: string }> = {}
    for (const entry of ts.entries) {
      if (!entry.isBillable) continue
      const key   = entry.projectId ?? "__no_project"
      const rate  = entry.project?.rateOverride ? Number(entry.project.rateOverride) : clientRate
      const desc  = entry.project?.name
        ? `${entry.project.name}${entry.phase ? ` — ${entry.phase.name}` : ""}`
        : "General time"
      if (!byProject[key]) byProject[key] = { hours: 0, rate, desc }
      byProject[key]!.hours += Number(entry.hours)
    }
    for (const item of Object.values(byProject)) {
      if (item.hours > 0) {
        lineItems.push({
          description: item.desc,
          hours: item.hours,
          rate: item.rate,
          amount: item.hours * item.rate,
        })
      }
    }
  }

  const subtotal = lineItems.reduce((s, l) => s + l.amount, 0)
  const vatRate  = settings?.vatRegistered ? 0.20 : 0
  const vatAmt   = subtotal * vatRate
  const total    = subtotal + vatAmt

  const companyAddress = settings?.companyAddress ?? ""
  const companyLines   = companyAddress.split("\n").filter(Boolean)

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-page-bg, #f9fafb)" }}>
      {/* Toolbar — hidden on print */}
      <div className="print:hidden px-6 py-3 border-b border-gray-200 bg-white flex items-center gap-4">
        <Link href="/invoices" className="text-sm text-blue-600 hover:underline">← Invoices</Link>
        <span className="text-sm text-gray-500 flex-1">{invoiceNumber}</span>
        <InvoicePrintButton />
        <span className={`badge ${
          invoice.status === "PAID" ? "badge-paid" :
          invoice.status === "SENT" ? "badge-sent" : "badge-draft"
        }`}>
          {invoice.status}
        </span>
      </div>

      {/* Invoice body */}
      <div
        id="invoice-print-area"
        className="max-w-3xl mx-auto my-8 print:my-0 bg-white shadow-sm print:shadow-none border border-gray-200 print:border-0 rounded-lg print:rounded-none p-10 print:p-8"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-10">
          <div>
            {settings?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logoUrl} alt="Company logo" className="h-14 mb-3 object-contain" />
            ) : (
              <div className="text-xl font-bold text-gray-900 mb-1">
                {settings?.companyName ?? settings?.companyLegalName ?? "Your Company"}
              </div>
            )}
            {settings?.companyLegalName && settings?.companyName !== settings?.companyLegalName && (
              <p className="text-sm text-gray-500">{settings.companyLegalName}</p>
            )}
            {companyLines.map((line, i) => (
              <p key={i} className="text-sm text-gray-600">{line}</p>
            ))}
            {settings?.companyEmail && <p className="text-sm text-gray-600">{settings.companyEmail}</p>}
            {settings?.companyPhone && <p className="text-sm text-gray-600">{settings.companyPhone}</p>}
            {settings?.vatNumber && (
              <p className="text-sm text-gray-500 mt-1">VAT No: {settings.vatNumber}</p>
            )}
            {settings?.companyRegNumber && (
              <p className="text-sm text-gray-500">Reg No: {settings.companyRegNumber}</p>
            )}
          </div>

          <div className="text-right">
            <h1 className="text-3xl font-bold text-gray-900 mb-1">INVOICE</h1>
            <p className="text-sm text-gray-600 font-mono">{invoiceNumber}</p>
            <div className="mt-3 text-sm text-gray-600 space-y-0.5">
              <p><span className="text-gray-400">Date:</span> {fmtDate(invoice.createdAt)}</p>
              <p><span className="text-gray-400">Due:</span> {fmtDate(dueDate)}</p>
              {invoice.client.purchaseOrderNumber && (
                <p><span className="text-gray-400">PO:</span> {invoice.client.purchaseOrderNumber}</p>
              )}
            </div>
          </div>
        </div>

        {/* Bill To */}
        <div className="mb-8 grid grid-cols-2 gap-8">
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Bill To</h2>
            <p className="font-semibold text-gray-900">
              {invoice.client.companyName ?? invoice.client.tradingName ?? invoice.client.name}
            </p>
            {invoice.client.tradingName && invoice.client.companyName && (
              <p className="text-sm text-gray-500">t/a {invoice.client.tradingName}</p>
            )}
            {invoice.client.contactName && (
              <p className="text-sm text-gray-600">Attn: {invoice.client.contactName}</p>
            )}
            {invoice.client.addressLine1 && <p className="text-sm text-gray-600">{invoice.client.addressLine1}</p>}
            {invoice.client.addressLine2 && <p className="text-sm text-gray-600">{invoice.client.addressLine2}</p>}
            {invoice.client.city && (
              <p className="text-sm text-gray-600">
                {[invoice.client.city, invoice.client.county, invoice.client.postcode].filter(Boolean).join(", ")}
              </p>
            )}
            {invoice.client.country && <p className="text-sm text-gray-600">{invoice.client.country}</p>}
            {invoice.client.vatNumber && (
              <p className="text-sm text-gray-500 mt-1">VAT: {invoice.client.vatNumber}</p>
            )}
          </div>
        </div>

        {/* Line items */}
        <table className="w-full mb-6 text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left py-2 font-semibold text-gray-700">Description</th>
              <th className="text-right py-2 font-semibold text-gray-700 w-16">Hours</th>
              <th className="text-right py-2 font-semibold text-gray-700 w-24">Rate</th>
              <th className="text-right py-2 font-semibold text-gray-700 w-24">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lineItems.length > 0 ? lineItems.map((item, i) => (
              <tr key={i}>
                <td className="py-2.5 text-gray-800">{item.description}</td>
                <td className="py-2.5 text-right font-mono text-gray-600">{item.hours.toFixed(2)}</td>
                <td className="py-2.5 text-right font-mono text-gray-600">{fmt(item.rate)}</td>
                <td className="py-2.5 text-right font-mono text-gray-800 font-medium">{fmt(item.amount)}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={4} className="py-3 text-gray-500 italic">Professional services</td>
                <td className="py-3 text-right font-mono">{fmt(Number(invoice.amount))}</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-8">
          <div className="w-64 space-y-1 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-mono font-medium">{fmt(lineItems.length > 0 ? subtotal : Number(invoice.amount))}</span>
            </div>
            {settings?.vatRegistered && (
              <div className="flex justify-between py-1">
                <span className="text-gray-600">VAT (20%)</span>
                <span className="font-mono">{fmt(lineItems.length > 0 ? vatAmt : Number(invoice.amount) * 0.20)}</span>
              </div>
            )}
            <div className="flex justify-between py-2 border-t-2 border-gray-800 font-bold text-base">
              <span>Total</span>
              <span className="font-mono">
                {fmt(lineItems.length > 0 ? total : Number(invoice.amount) * (settings?.vatRegistered ? 1.20 : 1))}
              </span>
            </div>
          </div>
        </div>

        {/* Payment details */}
        {(settings?.bankName || settings?.accountNumber || settings?.iban) && (
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Payment Details</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {settings.bankName    && <div><span className="text-gray-500">Bank:</span> {settings.bankName}</div>}
              {settings.accountName && <div><span className="text-gray-500">Account name:</span> {settings.accountName}</div>}
              {settings.sortCode    && <div><span className="text-gray-500">Sort code:</span> {settings.sortCode}</div>}
              {settings.accountNumber && <div><span className="text-gray-500">Account no:</span> {settings.accountNumber}</div>}
              {settings.iban        && <div><span className="text-gray-500">IBAN:</span> {settings.iban}</div>}
              {settings.swiftBic    && <div><span className="text-gray-500">SWIFT/BIC:</span> {settings.swiftBic}</div>}
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Payment due within {paymentTerms} days of invoice date.
            </p>
          </div>
        )}

        {/* Notes */}
        {invoice.client.contactEmail && (
          <p className="text-xs text-gray-400 mt-6 text-center">
            Queries: {invoice.client.contactEmail}
          </p>
        )}
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  )
}
