/**
 * Root page — immediately redirects to the dashboard.
 * The middleware handles authentication and MFA gating.
 */
import { redirect } from "next/navigation"

export default function HomePage() {
  redirect("/dashboard")
}
