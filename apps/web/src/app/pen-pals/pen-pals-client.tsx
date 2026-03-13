"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { AcceptDeclineButtons, CancelRequestButton } from "./pending-request-actions";
import { FediverseFollowBackButton } from "./fediverse-follow-back-button";

interface PenPal {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface FediverseConnection {
  id: string;
  username: string;
  domain: string;
  display_name: string | null;
  avatar_url: string | null;
  ap_id: string;
  profile_url: string;
  relationship: "mutual" | "follower" | "follower_following_pending" | "following" | "following_pending";
}

type SourceFilter = "all" | "inkwell" | "fediverse";

const GlobeIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

function RelationshipBadge({ relationship }: { relationship: string }) {
  switch (relationship) {
    case "mutual":
      return (
        <span
          className="text-xs px-3 py-1 rounded-full font-medium flex-shrink-0"
          style={{ background: "var(--accent-light)", color: "var(--accent)" }}
        >
          Pen Pals
        </span>
      );
    case "following":
      return (
        <span
          className="text-xs px-3 py-1 rounded-full border flex-shrink-0"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          Following
        </span>
      );
    case "following_pending":
      return (
        <span
          className="text-xs px-3 py-1 rounded-full border flex-shrink-0"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          Requested
        </span>
      );
    default:
      return null;
  }
}

export function PenPalsClient({
  penPals,
  readers,
  reading,
  incomingRequests,
  outgoingRequests,
  fediverseConnections,
}: {
  penPals: PenPal[];
  readers: PenPal[];
  reading: PenPal[];
  incomingRequests: PenPal[];
  outgoingRequests: PenPal[];
  fediverseConnections: FediverseConnection[];
}) {
  const [activeSource, setActiveSource] = useState<SourceFilter>("all");

  const showInkwell = activeSource === "all" || activeSource === "inkwell";
  const showFediverse = activeSource === "all" || activeSource === "fediverse";

  const hasPending = incomingRequests.length > 0 || outgoingRequests.length > 0;
  const hasInkwell = penPals.length > 0 || readers.length > 0 || reading.length > 0 || hasPending;

  // Compute section counts based on active filter
  const fediverseCount = fediverseConnections.length;
  const inkwellCount = penPals.length + readers.length + reading.length + incomingRequests.length + outgoingRequests.length;

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold">Pen Pals</h1>
          <div className="flex items-center gap-2">
            <Link
              href="/settings/top-friends"
              className="text-xs px-3 py-1.5 rounded-full border transition-colors hover:opacity-80"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              Top 6 Pen Pals
            </Link>
            <Link
              href="/search"
              className="text-xs px-3 py-1.5 rounded-full transition-colors hover:opacity-80"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              Find people
            </Link>
          </div>
        </div>

        {/* Source filter tabs */}
        <div className="flex items-center gap-2 mb-6">
          {([
            { label: "All", value: "all" as const, count: inkwellCount + fediverseCount },
            { label: "Inkwell", value: "inkwell" as const, count: inkwellCount },
            { label: "Fediverse", value: "fediverse" as const, count: fediverseCount },
          ]).map((tab) => {
            const isActive = activeSource === tab.value;
            const isFediverse = tab.value === "fediverse";
            return (
              <button
                key={tab.value}
                onClick={() => setActiveSource(tab.value)}
                className="text-xs px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap flex items-center gap-1"
                style={isActive ? {
                  borderColor: isFediverse ? "var(--fediverse-accent, #569e85)" : "var(--accent)",
                  background: isFediverse ? "rgba(86,158,133,0.1)" : "var(--accent-light)",
                  color: isFediverse ? "var(--fediverse-accent, #569e85)" : "var(--accent)",
                  fontWeight: 500,
                } : {
                  borderColor: "var(--border)",
                  color: "var(--muted)",
                }}
              >
                {isFediverse && <GlobeIcon size={10} />}
                {tab.label}
                {tab.count > 0 && (
                  <span className="ml-1 opacity-70">{tab.count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Inkwell sections */}
        {showInkwell && (
          <>
            {/* Pending Requests */}
            {hasPending && (
              <section className="mb-8">
                <h2 className="text-xs font-medium uppercase tracking-widest mb-3" style={{ color: "var(--muted)" }}>
                  Pending Requests · {incomingRequests.length + outgoingRequests.length}
                </h2>

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

            {/* Readers */}
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

            {/* Reading */}
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
          </>
        )}

        {/* Fediverse unified section */}
        {showFediverse && fediverseConnections.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-medium uppercase tracking-widest mb-3 flex items-center gap-1.5" style={{ color: "var(--muted)" }}>
              <GlobeIcon />
              The Open Social Web · {fediverseCount}
            </h2>
            <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
              Your connections from Mastodon and the wider fediverse
            </p>

            <div className="rounded-2xl border overflow-hidden"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              {fediverseConnections.map((actor, i) => (
                <div key={actor.id}
                  className={`flex items-center gap-3 px-5 py-3.5 ${i < fediverseConnections.length - 1 ? "border-b" : ""}`}
                  style={{ borderColor: "var(--border)" }}>
                  <a href={actor.profile_url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                    <Avatar url={actor.avatar_url} name={actor.display_name || actor.username} size={40} />
                  </a>
                  <div className="flex-1 min-w-0">
                    <a href={actor.profile_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      <p className="text-sm font-medium truncate">{actor.display_name || actor.username}</p>
                    </a>
                    <p className="text-xs truncate" style={{ color: "var(--muted)" }}>@{actor.username}@{actor.domain}</p>
                  </div>

                  {/* Show Follow Back button for followers, badge for others */}
                  {actor.relationship === "follower" ? (
                    <FediverseFollowBackButton apId={actor.ap_id} initialRelationship={actor.relationship} />
                  ) : (
                    <RelationshipBadge relationship={actor.relationship} />
                  )}

                  <a href={actor.profile_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs flex items-center gap-1 flex-shrink-0" style={{ color: "var(--muted)" }}>
                    <ExternalLinkIcon />
                    {actor.domain}
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty state for fediverse-only filter */}
        {showFediverse && !showInkwell && fediverseConnections.length === 0 && (
          <div className="rounded-2xl border p-8 text-center"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <p className="text-sm mb-2" style={{ color: "var(--muted)" }}>
              No fediverse connections yet.
            </p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              When someone from Mastodon or another fediverse platform follows you, they&apos;ll appear here.
            </p>
          </div>
        )}

        {/* Empty state for inkwell-only filter with no connections */}
        {showInkwell && !showFediverse && !hasInkwell && (
          <div className="rounded-2xl border p-8 text-center"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
              No Inkwell connections yet.
            </p>
            <Link href="/search" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
              Find people to connect with
            </Link>
          </div>
        )}

      </div>
    </div>
  );
}
