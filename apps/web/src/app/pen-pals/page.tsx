import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { Avatar } from "@/components/avatar";

export const metadata: Metadata = { title: "Pen Pals · Inkwell" };

interface PenPal {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export default async function PenPalsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  let penPals: PenPal[] = [];
  let readers: PenPal[] = [];
  let reading: PenPal[] = [];

  try {
    const [ppData, rdData, rgData] = await Promise.all([
      apiFetch<{ data: PenPal[] }>("/api/pen-pals", {}, session.token),
      apiFetch<{ data: PenPal[] }>("/api/readers", {}, session.token),
      apiFetch<{ data: PenPal[] }>("/api/reading", {}, session.token),
    ]);
    penPals = ppData.data ?? [];
    readers = rdData.data ?? [];
    reading = rgData.data ?? [];
  } catch {
    // show empty
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold">Pen Pals</h1>
          <Link href="/search" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
            Find people →
          </Link>
        </div>

        {/* Pen Pals (mutual) */}
        <section className="mb-8">
          <h2 className="text-xs font-medium uppercase tracking-widest mb-3" style={{ color: "var(--muted)" }}>
            Pen Pals · {penPals.length}
          </h2>
          {penPals.length === 0 ? (
            <div className="rounded-2xl border p-8 text-center"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
                No pen pals yet. When you and someone both follow each other, they&apos;ll appear here.
              </p>
              <Link href="/search" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
                Search for people
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl border overflow-hidden"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              {penPals.map((pal, i) => (
                <Link key={pal.id} href={`/${pal.username}`}
                  className={`flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--surface-hover)] ${i < penPals.length - 1 ? "border-b" : ""}`}
                  style={{ borderColor: "var(--border)" }}>
                  <Avatar url={pal.avatar_url} name={pal.display_name} size={40} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{pal.display_name}</p>
                    <p className="text-xs truncate" style={{ color: "var(--muted)" }}>@{pal.username}</p>
                  </div>
                  <span className="text-xs px-2.5 py-0.5 rounded-full"
                    style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                    Pen Pal
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Readers (people following you, one-way) */}
        {readers.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-medium uppercase tracking-widest mb-3" style={{ color: "var(--muted)" }}>
              Readers · {readers.length}
            </h2>
            <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
              People reading your journal who you haven&apos;t followed back yet.
            </p>
            <div className="rounded-2xl border overflow-hidden"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              {readers.map((reader, i) => (
                <Link key={reader.id} href={`/${reader.username}`}
                  className={`flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--surface-hover)] ${i < readers.length - 1 ? "border-b" : ""}`}
                  style={{ borderColor: "var(--border)" }}>
                  <Avatar url={reader.avatar_url} name={reader.display_name} size={40} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{reader.display_name}</p>
                    <p className="text-xs truncate" style={{ color: "var(--muted)" }}>@{reader.username}</p>
                  </div>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>Reader</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Reading (people you follow, one-way) */}
        {reading.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-medium uppercase tracking-widest mb-3" style={{ color: "var(--muted)" }}>
              Reading · {reading.length}
            </h2>
            <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
              People whose journals you read who haven&apos;t followed you back yet.
            </p>
            <div className="rounded-2xl border overflow-hidden"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              {reading.map((person, i) => (
                <Link key={person.id} href={`/${person.username}`}
                  className={`flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--surface-hover)] ${i < reading.length - 1 ? "border-b" : ""}`}
                  style={{ borderColor: "var(--border)" }}>
                  <Avatar url={person.avatar_url} name={person.display_name} size={40} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{person.display_name}</p>
                    <p className="text-xs truncate" style={{ color: "var(--muted)" }}>@{person.username}</p>
                  </div>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>Reading</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Management links */}
        <div className="rounded-xl border p-4 flex items-center justify-between"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <span className="text-sm" style={{ color: "var(--muted)" }}>Manage your Top 8 Pen Pals</span>
          <Link href="/settings/top-friends" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
            Edit Top 8 →
          </Link>
        </div>
      </div>
    </div>
  );
}
