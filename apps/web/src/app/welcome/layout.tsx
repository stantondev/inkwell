import { requireSession } from "@/lib/require-session";

/**
 * Onboarding only works signed in (every step saves through an authenticated
 * endpoint). The middleware turns away visitors with no token cookie; this
 * catches a cookie the API no longer accepts, which used to get the whole
 * wizard and fail at the end. After signing in, a new account comes back
 * here on its own.
 */
export default async function WelcomeLayout({ children }: { children: React.ReactNode }) {
  await requireSession("/welcome");
  return children;
}
