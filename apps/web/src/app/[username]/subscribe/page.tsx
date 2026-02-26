import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { SubscribeForm } from "./subscribe-form";

interface PageProps {
  params: Promise<{ username: string }>;
}

interface WriterInfo {
  username: string;
  display_name: string;
  avatar_url: string | null;
  newsletter_name: string | null;
  newsletter_description: string | null;
  subscriber_count: number;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params;
  return { title: `Subscribe to @${username}` };
}

export default async function SubscribePage({ params }: PageProps) {
  const { username } = await params;

  let writer: WriterInfo;
  try {
    const data = await apiFetch<{ data: WriterInfo }>(`/api/newsletter/${username}`);
    writer = data.data;
  } catch {
    notFound();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16" style={{ background: "var(--background)" }}>
      <div className="w-full max-w-md">
        <div className="rounded-2xl border p-8" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          {/* Writer info */}
          <div className="text-center mb-6">
            {writer.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={writer.avatar_url}
                alt={writer.display_name}
                className="w-16 h-16 rounded-full mx-auto mb-3 object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center text-xl font-semibold"
                style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                {writer.display_name?.[0]?.toUpperCase() ?? "?"}
              </div>
            )}
            <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
              {writer.newsletter_name || writer.display_name}
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              by @{writer.username}
            </p>
            {writer.newsletter_description && (
              <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
                {writer.newsletter_description}
              </p>
            )}
            {writer.subscriber_count > 0 && (
              <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                {writer.subscriber_count} {writer.subscriber_count === 1 ? "subscriber" : "subscribers"}
              </p>
            )}
          </div>

          {/* Subscribe form (client component) */}
          <SubscribeForm username={username} />
        </div>

        {/* Powered by Inkwell */}
        <p className="text-center text-xs mt-4" style={{ color: "var(--muted)" }}>
          Powered by{" "}
          <a href="https://inkwell.social" className="hover:underline" style={{ color: "var(--accent)" }}>
            Inkwell
          </a>
        </p>
      </div>
    </div>
  );
}
