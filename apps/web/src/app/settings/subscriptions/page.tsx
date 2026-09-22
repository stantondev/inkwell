import { redirect } from "next/navigation";

// Writer subscription plans are retired from the interface (they needed
// Stripe Connect). Old links land on the support-link settings instead.
export default function SubscriptionsSettingsPage() {
  redirect("/settings/support");
}
