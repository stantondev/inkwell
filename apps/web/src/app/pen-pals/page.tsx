import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { Avatar } from "@/components/avatar";
import { AcceptDeclineButtons, CancelRequestButton } from "./pending-request-actions";

export const metadata: Metadata = { title: "Pen Pals · Inkwell" };

interface PenPal {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface FediverseActor {
  id: string;
  username: string;
  domain: string;
  display_name: string | null;
  avatar_url: string | null;
  ap_id: string;
  profile_url: string;
}

export default async function PenPalsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  let penPals: PenPal[] = [];
  let readers: PenPal[] = [];
  let reading: PenPal[] = [];
  let fediverseFollowers: FediverseActor[] = [];
  let fediverseFollowing: FediverseActor[] = [];
  let incomingRequests: PenPal[] = [];
  let outgoingRequests: PenPal[] = [];

  try {
    const [ppData, rdData, rgData, ffData, fgData, prData] = await Promise.all([
      apiFetch<{ data: PenPal[] }>("/api/pen-pals", {}, session.token),
      apiFetch<{ data: PenPal[] }>("/api/readers", {}, session.token),
      apiFetch<{ data: PenPal[] }>("/api/reading", {}, session.token),
      apiFetch<{ data: FediverseActor[] }>("/api/fediverse-followers", {}, session.token),
      apiFetch<{ data: FediverseActor[] }>("/api/fediverse-following", {}, session.token),
      apiFetch<{ data: { incoming: PenPal[]; outgoing: PenPal[] } }>("/api/pending-requests", {}, session.token),
    ]);
    penPals = ppData.data ?? [];
    readers = rdData.data ?? [];
    reading = rgData.data ?? [];
    fediverseFollowers = ffData.data ?? [];
    fediverseFollowing = fgData.data ?? [];
    incomingRequests = prData.data?.incoming ?? [];
    outgoingRequests = prData.data?.outgoing ?? [];
  } catch {
    // show empty
  }

  const hasFediverseConnections = fediverseFollowers.length > 0 || fediverseFollowing.length > 0;

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold">Pen Pals</h1>
          <Link href="/search" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
            Find people →
          </Link>
        </div>

        {/* Pending Requests */}
        {(incomingRequests.length > 0 || outgoingRequests.length > 0) && (
          <section className="mb-8">
            <h2 className="text-xs font-medium uppercase tracking-widest mb-3" style={{ color: "var(--muted)" }}>
              Pending Requests · {incomingRequests.length + outgoingRequests.length}
            </h2>

            {/* Incoming requests */}
            {incomingRequests.length > 0 && (
              <div className="mb-4">
                <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>
                  People who want to be your pen pal
                </p>
                <div className="rounded-2xl border overflow-hidden"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  {incomingRequests.map((person, i) => (
                    <div key={person.id}
                      className={`flex items-center gap-3 px-5 py-3.5 ${i < incomingRequests.length - 1 ? "border-b" : ""}`}
                      style={{ borderColor: "var(--border)" }}>
                      <Link href={`/${person.username}`} className="flex items-center gap-3 flex-1 min-w-0">
                        <Avatar url={person.avatar_url} name={person.display_name} size={40} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{person.display_name}</p>
                          <p className="text-xs truncate" style={{ color: "var(--muted)" }}>@{person.username}</p>
                        </div>
                      </Link>
                      <AcceptDeclineButtons username={person.username} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Outgoing requests */}
            {outgoingRequests.length > 0 && (
              <div>
                <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>
                  Your pending pen pal requests
                </p>
                <div className="rounded-2xl border overflow-hidden"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  {outgoingRequests.map((person, i) => (
                    <div key={person.id}
                      className={`flex items-center gap-3 px-5 py-3.5 ${i < outgoingRequests.length - 1 ? "border-b" : ""}`}
                      style={{ borderColor: "var(--border)" }}>
                      <Link href={`/${person.username}`} className="flex items-center gap-3 flex-1 min-w-0">
                        <Avatar url={person.avatar_url} name={person.display_name} size={40} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{person.display_name}</p>
                          <p className="text-xs truncate" style={{ color: "var(--muted)" }}>@{person.username}</p>
                        </div>
                      </Link>
                      <CancelRequestButton username={person.username} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Pen Pals (mutual) */}
        <section className="mb-8">
          <h2 className="text-xs font-medium uppercase tracking-widest mb-3" style={{ color: "var(--muted)" }}>
            Pen Pals · {penPals.length}
          </h2>
          {penPals.length === 0 ? (
            <div className="rounded-2xl border p-8 text-center"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
                No pen pals yet. Send a pen pal request and once they accept, they&apos;ll appear here.
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
              People who follow you that you haven&apos;t sent a pen pal request to yet.
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
              People you follow who haven&apos;t accepted your pen pal request yet.
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

        {/* Fediverse Connections */}
        {hasFediverseConnections && (
          <section className="mb-8">
            <h2 className="text-xs font-medium uppercase tracking-widest mb-3 flex items-center gap-1.5" style={{ color: "var(--muted)" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              Fediverse · {fediverseFollowers.length + fediverseFollowing.length}
            </h2>
            <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
              Connections from Mastodon and other fediverse platforms.
            </p>

            {/* Fediverse Followers */}
            {fediverseFollowers.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>
                  Fediverse Followers · {fediverseFollowers.length}
                </h3>
                <div className="rounded-2xl border overflow-hidden"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  {fediverseFollowers.map((actor, i) => (
                    <a key={actor.id} href={actor.profile_url} target="_blank" rel="noopener noreferrer"
                      className={`flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--surface-hover)] ${i < fediverseFollowers.length - 1 ? "border-b" : ""}`}
                      style={{ borderColor: "var(--border)" }}>
                      <Avatar url={actor.avatar_url} name={actor.display_name || actor.username} size={40} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{actor.display_name || actor.username}</p>
                        <p className="text-xs truncate" style={{ color: "var(--muted)" }}>@{actor.username}@{actor.domain}</p>
                      </div>
                      <span className="text-xs flex items-center gap-1" style={{ color: "var(--muted)" }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        {actor.domain}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Fediverse Following */}
            {fediverseFollowing.length > 0 && (
              <div>
                <h3 className="text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>
                  Fediverse Following · {fediverseFollowing.length}
                </h3>
                <div className="rounded-2xl border overflow-hidden"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  {fediverseFollowing.map((actor, i) => (
                    <a key={actor.id} href={actor.profile_url} target="_blank" rel="noopener noreferrer"
                      className={`flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--surface-hover)] ${i < fediverseFollowing.length - 1 ? "border-b" : ""}`}
                      style={{ borderColor: "var(--border)" }}>
                      <Avatar url={actor.avatar_url} name={actor.display_name || actor.username} size={40} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{actor.display_name || actor.username}</p>
                        <p className="text-xs truncate" style={{ color: "var(--muted)" }}>@{actor.username}@{actor.domain}</p>
                      </div>
                      <span className="text-xs flex items-center gap-1" style={{ color: "var(--muted)" }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        {actor.domain}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Management links */}
        <div className="rounded-xl border p-4 flex items-center justify-between"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <span className="text-sm" style={{ color: "var(--muted)" }}>Manage your Top 6 Pen Pals</span>
          <Link href="/settings/top-friends" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
            Edit Top 6 →
          </Link>
        </div>
      </div>
    </div>
  );
}
