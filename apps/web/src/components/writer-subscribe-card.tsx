"use client";

import { useState } from "react";

interface WriterPlan {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  subscriber_count: number;
  is_subscribed: boolean;
}

interface WriterSubscribeCardProps {
  plan: WriterPlan;
  writerId: string;
  isOwnProfile: boolean;
  isLoggedIn: boolean;
}

export function WriterSubscribeCard({ plan, writerId, isOwnProfile, isLoggedIn }: WriterSubscribeCardProps) {
  const [loading, setLoading] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(plan.is_subscribed);
  const [canceling, setCanceling] = useState(false);
  const price = (plan.price_cents / 100).toFixed(plan.price_cents % 100 === 0 ? 0 : 2);

  async function handleSubscribe() {
    if (!isLoggedIn) {
      window.location.href = "/login";
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/writer-plans/${plan.id}/checkout`, { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Unable to start checkout");
      }
    } catch {
      alert("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!confirm("Cancel your subscription? You'll lose access at the end of your billing period.")) return;
    setCanceling(true);
    try {
      const res = await fetch(`/api/writer-plans/subscriptions/${writerId}`, { method: "DELETE" });
      if (res.ok) {
        setIsSubscribed(false);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to cancel");
      }
    } catch {
      alert("Something went wrong.");
    } finally {
      setCanceling(false);
    }
  }

  return (
    <div
      className="rounded-xl border p-4"
      style={{
        borderColor: "var(--border)",
        background: "var(--surface)",
        opacity: isOwnProfile ? 0.6 : 1,
        pointerEvents: isOwnProfile ? "none" : undefined,
      }}
    >
      <h3
        className="text-sm font-semibold mb-1"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)", color: "var(--foreground)" }}
      >
        {plan.name}
      </h3>
      <p className="text-lg font-bold mb-1" style={{ color: "var(--accent)" }}>
        ${price}/mo
      </p>
      {plan.subscriber_count > 0 && (
        <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>
          {plan.subscriber_count} {plan.subscriber_count === 1 ? "subscriber" : "subscribers"}
        </p>
      )}
      {plan.description && (
        <p className="text-xs mb-3 line-clamp-3" style={{ color: "var(--muted)", lineHeight: 1.5 }}>
          {plan.description}
        </p>
      )}

      {isOwnProfile ? (
        <div
          className="text-xs text-center py-2 rounded-full border"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          Preview
        </div>
      ) : isSubscribed ? (
        <div className="flex flex-col gap-2">
          <div
            className="text-xs text-center py-2 rounded-full"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Subscribed
          </div>
          <button
            onClick={handleCancel}
            disabled={canceling}
            className="text-xs text-center py-1.5 rounded-full border transition-colors hover:border-[var(--accent)]"
            style={{ borderColor: "var(--border)", color: "var(--muted)", background: "transparent", cursor: "pointer" }}
          >
            {canceling ? "Canceling..." : "Cancel subscription"}
          </button>
        </div>
      ) : (
        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="w-full text-sm py-2 rounded-full font-medium transition-opacity hover:opacity-90"
          style={{ background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer" }}
        >
          {loading ? "Loading..." : "Subscribe"}
        </button>
      )}
    </div>
  );
}
