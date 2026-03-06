import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import CreateCircleForm from "./create-circle-form";

export const metadata: Metadata = {
  title: "Found a Circle — Inkwell",
};

export default async function CreateCirclePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.subscription_tier !== "plus") redirect("/settings/billing");

  return (
    <div className="salon-page">
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "2rem 1rem" }}>
        <h1 style={{
          fontFamily: "var(--font-lora, Georgia, serif)",
          fontSize: "1.75rem",
          fontWeight: 600,
          color: "var(--salon-foreground)",
          textAlign: "center",
          marginBottom: "0.5rem",
        }}>
          Found a Circle
        </h1>
        <p style={{ textAlign: "center", color: "var(--salon-muted)", fontSize: "0.9375rem", fontStyle: "italic", marginBottom: "2rem" }}>
          Create a space for writers to gather
        </p>

        <CreateCircleForm />
      </div>
    </div>
  );
}
