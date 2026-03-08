"use client";

import { useState } from "react";
import { AvatarWithFrame } from "@/components/avatar-with-frame";

interface WriterPlan {
  id: string;
  name: string;
  price_cents: number;
  subscriber_count: number;
}

interface Author {
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_frame?: string | null;
}

interface PaywallCardProps {
  writerPlan: WriterPlan;
  author: Author;
  isLoggedIn: boolean;
}

export function PaywallCard({ writerPlan, author, isLoggedIn }: PaywallCardProps) {
  const [loading, setLoading] = useState(false);
  const price = (writerPlan.price_cents / 100).toFixed(writerPlan.price_cents % 100 === 0 ? 0 : 2);

  async function handleSubscribe() {
    if (!isLoggedIn) {
      window.location.href = "/login";
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/writer-plans/${writerPlan.id}/checkout`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Unable to start checkout");
      }
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="paywall-card">
      <div className="paywall-gradient" />
      <div className="paywall-content">
        <AvatarWithFrame
          url={author.avatar_url ? `/api/avatars/${author.username}` : null}
          frame={author.avatar_frame || "none"}
          size={56}
          name={author.display_name || author.username}
        />
        <h3 className="paywall-plan-name">{writerPlan.name}</h3>
        <p className="paywall-price">${price}/mo</p>
        {writerPlan.subscriber_count > 0 && (
          <p className="paywall-subscribers">
            {writerPlan.subscriber_count} {writerPlan.subscriber_count === 1 ? "subscriber" : "subscribers"}
          </p>
        )}
        <p className="paywall-description">
          This entry is for paid subscribers of{" "}
          <strong>{author.display_name || author.username}</strong>.
        </p>
        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="paywall-cta"
        >
          {loading ? "Loading..." : isLoggedIn ? "Subscribe to read" : "Sign in to subscribe"}
        </button>
      </div>
    </div>
  );
}
