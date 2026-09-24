import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { redirect } from "next/navigation";
import CreateCircleForm from "./create-circle-form";
import type { MyCirclesMeta } from "../circle-types";

export const metadata: Metadata = {
  title: "Start a circle",
};

export default async function CreateCirclePage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/circles/new");

  let meta: MyCirclesMeta | null = null;
  try {
    meta = (await apiFetch<{ meta: MyCirclesMeta }>("/api/my-circles", {}, session.token)).meta;
  } catch {
    // Let the form try; the API gives the same answer on submit.
  }

  return (
    <div className="circle-page">
      <div className="max-w-2xl mx-auto" style={{ padding: "2rem 1rem" }}>
        <h1 className="circle-title" style={{ textAlign: "center", marginBottom: "0.5rem" }}>
          Start a circle
        </h1>
        <p style={{ textAlign: "center", color: "var(--muted)", fontSize: "0.9375rem", marginBottom: "2rem" }}>
          A circle is a small community. Members post journal entries to it, and you can give them a prompt to
          write about.
        </p>

        {meta && !meta.can_create ? (
          <div className="circle-card" style={{ textAlign: "center" }}>
            <p style={{ marginBottom: "1rem" }}>{meta.create_message}</p>
            <Link href="/circles" className="circle-btn" style={{ textDecoration: "none" }}>
              Find a circle to join
            </Link>
          </div>
        ) : (
          <CreateCircleForm />
        )}
      </div>
    </div>
  );
}
