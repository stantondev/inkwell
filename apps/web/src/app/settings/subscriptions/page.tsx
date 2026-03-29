"use client";

import { useState, useEffect } from "react";
import { AvatarWithFrame } from "@/components/avatar-with-frame";

interface WriterPlan {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  status: string;
  subscriber_count: number;
  total_earned_cents: number;
}

interface PlanStats {
  active_subscribers: number;
  mrr_cents: number;
  total_earned_cents: number;
}

interface Subscriber {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_frame: string | null;
  avatar_animation?: string | null;
  subscribed_at: string;
  status: string;
}

interface UserData {
  subscription_tier?: string;
  stripe_connect_enabled?: boolean;
  stripe_connect_onboarded?: boolean;
  has_writer_plan?: boolean;
}

function formatDollars(cents: number) {
  const dollars = cents / 100;
  return `$${dollars.toFixed(dollars % 1 === 0 ? 0 : 2)}`;
}

export default function SubscriptionsSettingsPage() {
  const [user, setUser] = useState<UserData | null>(null);
  const [plan, setPlan] = useState<WriterPlan | null>(null);
  const [stats, setStats] = useState<PlanStats | null>(null);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [subscriberTotal, setSubscriberTotal] = useState(0);
  const [subscriberOffset, setSubscriberOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Create form
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPrice, setFormPrice] = useState(5);

  // Edit form
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        const [userRes, planRes] = await Promise.all([
          fetch("/api/me"),
          fetch("/api/writer-plans/mine"),
        ]);

        if (userRes.ok) {
          const userData = await userRes.json();
          setUser(userData.data);
        }

        if (planRes.ok) {
          const planText = await planRes.text();
          try {
            const planData = JSON.parse(planText);
            if (planData.data) {
              setPlan(planData.data);
              setEditName(planData.data.name);
              setEditDesc(planData.data.description || "");
            }
          } catch { /* no plan */ }
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Fetch stats and subscribers when plan exists
  useEffect(() => {
    if (!plan) return;

    fetch("/api/writer-plans/stats")
      .then(res => res.ok ? res.text() : null)
      .then(text => {
        if (!text) return;
        try { setStats(JSON.parse(text).data); } catch { /* */ }
      })
      .catch(() => {});

    fetchSubscribers(0);
  }, [plan]);

  async function fetchSubscribers(offset: number) {
    try {
      const res = await fetch(`/api/writer-plans/subscribers?offset=${offset}&limit=20`);
      if (res.ok) {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          setSubscribers(data.data || []);
          setSubscriberTotal(data.total || 0);
          setSubscriberOffset(offset);
        } catch { /* */ }
      }
    } catch { /* */ }
  }

  async function handleCreate() {
    if (!formName.trim()) { setError("Plan name is required."); return; }
    if (formPrice < 1 || formPrice > 100) { setError("Price must be between $1 and $100."); return; }

    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/writer-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          description: formDesc.trim() || null,
          price_cents: Math.round(formPrice * 100),
        }),
      });
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (res.ok && data.data) {
          setPlan(data.data);
          setEditName(data.data.name);
          setEditDesc(data.data.description || "");
          setSuccess("Subscription plan created!");
          setTimeout(() => setSuccess(""), 3000);
        } else {
          setError(data.error || "Failed to create plan.");
        }
      } catch {
        setError("Unexpected response from server.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveEdit() {
    if (!editName.trim()) { setError("Plan name is required."); return; }
    if (!plan) return;

    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/writer-plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDesc.trim() || null,
        }),
      });
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (res.ok && data.data) {
          setPlan(data.data);
          setEditing(false);
          setSuccess("Plan updated!");
          setTimeout(() => setSuccess(""), 3000);
        } else {
          setError(data.error || "Failed to update plan.");
        }
      } catch {
        setError("Unexpected response.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!plan) return;
    setArchiving(true);
    setError("");
    try {
      const res = await fetch(`/api/writer-plans/${plan.id}`, { method: "DELETE" });
      if (res.ok) {
        setPlan(null);
        setStats(null);
        setSubscribers([]);
        setShowArchiveConfirm(false);
        setSuccess("Plan archived. Existing subscribers will retain access until their billing period ends.");
        setTimeout(() => setSuccess(""), 6000);
      } else {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          setError(data.error || "Failed to archive plan.");
        } catch {
          setError("Failed to archive plan.");
        }
      }
    } catch {
      setError("Network error.");
    } finally {
      setArchiving(false);
    }
  }

  const isPlus = user?.subscription_tier === "plus";
  const hasConnect = user?.stripe_connect_onboarded === true || user?.stripe_connect_enabled === true;

  const inputClass = "w-full rounded-lg border px-3 py-2 text-sm bg-transparent outline-none focus:ring-2 focus:ring-[var(--accent)] transition";
  const inputStyle = { borderColor: "var(--border)" };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-pulse text-sm" style={{ color: "var(--muted)" }}>
          Loading subscription settings...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1
          className="text-xl font-bold mb-1"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          Writer Subscriptions
        </h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Create a monthly subscription plan for your readers. Subscribers get access to your paid entries.
        </p>
      </div>

      {/* Status messages */}
      {error && (
        <div className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)", background: "var(--surface)" }}>
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--success, #22c55e)", color: "var(--success, #22c55e)", background: "var(--surface)" }}>
          {success}
        </div>
      )}

      {/* Prerequisites check */}
      {(!isPlus || !hasConnect) && !plan && (
        <div className="rounded-xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <h2 className="text-base font-semibold mb-3" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
            Before you begin
          </h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-xs"
                style={{
                  background: isPlus ? "var(--success, #22c55e)" : "var(--border)",
                  color: isPlus ? "#fff" : "var(--muted)",
                }}
              >
                {isPlus ? "\u2713" : "1"}
              </div>
              <div>
                <span className="text-sm font-medium">
                  {isPlus ? "Inkwell Plus" : "Upgrade to Inkwell Plus"}
                </span>
                {!isPlus && (
                  <span className="text-sm" style={{ color: "var(--muted)" }}>
                    {" "}&mdash;{" "}
                    <a href="/settings/billing" className="underline" style={{ color: "var(--accent)" }}>
                      $5/mo
                    </a>
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-xs"
                style={{
                  background: hasConnect ? "var(--success, #22c55e)" : "var(--border)",
                  color: hasConnect ? "#fff" : "var(--muted)",
                }}
              >
                {hasConnect ? "\u2713" : "2"}
              </div>
              <div>
                <span className="text-sm font-medium">
                  {hasConnect ? "Stripe Connected" : "Connect Stripe"}
                </span>
                {!hasConnect && isPlus && (
                  <span className="text-sm" style={{ color: "var(--muted)" }}>
                    {" "}&mdash;{" "}
                    <a href="/settings/support" className="underline" style={{ color: "var(--accent)" }}>
                      Set up Postage
                    </a>
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-xs"
                style={{ background: "var(--border)", color: "var(--muted)" }}
              >
                3
              </div>
              <span className="text-sm font-medium">Create your subscription plan</span>
            </div>
          </div>
        </div>
      )}

      {/* Create plan form */}
      {!plan && isPlus && hasConnect && (
        <div className="rounded-xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <h2 className="text-base font-semibold mb-1" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
            Create your subscription plan
          </h2>
          <p className="text-xs mb-5" style={{ color: "var(--muted)" }}>
            Subscribers pay monthly. You receive 92% — Inkwell takes 8% to keep the platform running.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Plan name</label>
              <input
                type="text"
                value={formName}
                maxLength={100}
                onChange={e => setFormName(e.target.value)}
                placeholder="e.g. Premium, Supporter, Inner Circle"
                className={inputClass}
                style={inputStyle}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Description</label>
              <textarea
                value={formDesc}
                maxLength={1000}
                onChange={e => setFormDesc(e.target.value)}
                placeholder="What do subscribers get? Describe the value..."
                className={inputClass}
                style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Monthly price</label>
              <div className="flex items-center gap-3">
                <div className="relative" style={{ width: "120px" }}>
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--muted)" }}>$</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={formPrice}
                    onChange={e => setFormPrice(Math.max(1, Math.min(100, Number(e.target.value))))}
                    className={inputClass}
                    style={{ ...inputStyle, paddingLeft: "1.5rem" }}
                  />
                </div>
                <span className="text-sm" style={{ color: "var(--muted)" }}>/month</span>
              </div>
              <p className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
                $1 &ndash; $100 per month. Choose carefully &mdash; price can&apos;t be changed once you have subscribers.
              </p>
            </div>

            <button
              onClick={handleCreate}
              disabled={creating || !formName.trim()}
              className="rounded-full px-6 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer" }}
            >
              {creating ? "Creating..." : "Create plan"}
            </button>
          </div>
        </div>
      )}

      {/* Active plan card */}
      {plan && (
        <>
          <div className="rounded-xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                    {plan.name}
                  </h2>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      background: plan.status === "active" ? "var(--success, #22c55e)" : "var(--muted)",
                      color: "#fff",
                    }}
                  >
                    {plan.status === "active" ? "Active" : "Archived"}
                  </span>
                </div>
                <p className="text-lg font-bold" style={{ color: "var(--accent)" }}>
                  {formatDollars(plan.price_cents)}/mo
                </p>
              </div>
              {plan.status === "active" && !editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="text-sm font-medium transition-colors"
                  style={{ color: "var(--accent)", cursor: "pointer", background: "none", border: "none" }}
                >
                  Edit
                </button>
              )}
            </div>

            {plan.description && !editing && (
              <p className="text-sm mb-4" style={{ color: "var(--muted)", lineHeight: 1.6 }}>
                {plan.description}
              </p>
            )}

            {/* Edit form */}
            {editing && (
              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <input
                    type="text"
                    value={editName}
                    maxLength={100}
                    onChange={e => setEditName(e.target.value)}
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea
                    value={editDesc}
                    maxLength={1000}
                    onChange={e => setEditDesc(e.target.value)}
                    className={inputClass}
                    style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSaveEdit}
                    disabled={saving || !editName.trim()}
                    className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                    style={{ background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer" }}
                  >
                    {saving ? "Saving..." : "Save changes"}
                  </button>
                  <button
                    onClick={() => { setEditing(false); setEditName(plan.name); setEditDesc(plan.description || ""); }}
                    className="text-sm"
                    style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  Price can&apos;t be changed while your plan is active. To change pricing, archive this plan and create a new one.
                </p>
              </div>
            )}

            {/* Stats grid */}
            {stats && (
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-lg border p-3 text-center" style={{ borderColor: "var(--border)" }}>
                  <div className="text-lg font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                    {stats.active_subscribers}
                  </div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>Subscribers</div>
                </div>
                <div className="rounded-lg border p-3 text-center" style={{ borderColor: "var(--border)" }}>
                  <div className="text-lg font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                    {formatDollars(stats.mrr_cents)}
                  </div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>MRR</div>
                </div>
                <div className="rounded-lg border p-3 text-center" style={{ borderColor: "var(--border)" }}>
                  <div className="text-lg font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                    {formatDollars(stats.total_earned_cents)}
                  </div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>Total earned</div>
                </div>
              </div>
            )}

            {/* Archive button */}
            {plan.status === "active" && (
              <div className="pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                {!showArchiveConfirm ? (
                  <button
                    onClick={() => setShowArchiveConfirm(true)}
                    className="text-xs font-medium"
                    style={{ color: "var(--danger, #dc2626)", background: "none", border: "none", cursor: "pointer" }}
                  >
                    Archive plan
                  </button>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-xs" style={{ color: "var(--danger, #dc2626)" }}>
                      Archive this plan? Existing subscribers keep access until their billing period ends.
                    </span>
                    <button
                      onClick={handleArchive}
                      disabled={archiving}
                      className="rounded px-3 py-1 text-xs font-medium disabled:opacity-50"
                      style={{ background: "var(--danger, #dc2626)", color: "#fff", border: "none", cursor: "pointer" }}
                    >
                      {archiving ? "..." : "Archive"}
                    </button>
                    <button
                      onClick={() => setShowArchiveConfirm(false)}
                      className="text-xs"
                      style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Subscribers list */}
          {subscribers.length > 0 && (
            <div className="rounded-xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <h2 className="text-base font-semibold mb-4" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                Subscribers ({subscriberTotal})
              </h2>
              <div className="space-y-3">
                {subscribers.map(sub => (
                  <div
                    key={sub.id}
                    className="flex items-center gap-3 py-2"
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <a href={`/${sub.username}`}>
                      <AvatarWithFrame
                        url={sub.avatar_url ? `/api/avatars/${sub.username}` : null}
                        name={sub.display_name || sub.username}
                        size={36}
                        frame={sub.avatar_frame}
                        animation={sub.avatar_animation}
                      />
                    </a>
                    <div className="flex-1 min-w-0">
                      <a
                        href={`/${sub.username}`}
                        className="text-sm font-medium hover:underline block truncate"
                        style={{ color: "var(--foreground)" }}
                      >
                        {sub.display_name || sub.username}
                      </a>
                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        @{sub.username}
                      </span>
                    </div>
                    <div className="text-right">
                      <span
                        className="text-xs rounded-full px-2 py-0.5"
                        style={{
                          background: sub.status === "active" ? "var(--success, #22c55e)" : "var(--muted)",
                          color: "#fff",
                        }}
                      >
                        {sub.status}
                      </span>
                      <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                        {new Date(sub.subscribed_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {subscriberTotal > 20 && (
                <div className="flex justify-center gap-3 mt-4">
                  <button
                    onClick={() => fetchSubscribers(Math.max(0, subscriberOffset - 20))}
                    disabled={subscriberOffset === 0}
                    className="text-sm disabled:opacity-40"
                    style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer" }}
                  >
                    Previous
                  </button>
                  <span className="text-xs self-center" style={{ color: "var(--muted)" }}>
                    {subscriberOffset + 1}&ndash;{Math.min(subscriberOffset + 20, subscriberTotal)} of {subscriberTotal}
                  </span>
                  <button
                    onClick={() => fetchSubscribers(subscriberOffset + 20)}
                    disabled={subscriberOffset + 20 >= subscriberTotal}
                    className="text-sm disabled:opacity-40"
                    style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer" }}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Info footer */}
      <div className="text-xs space-y-1" style={{ color: "var(--muted)" }}>
        <p>
          <strong>How it works:</strong> Create a subscription plan, then publish entries with &ldquo;Paid subscribers only&rdquo;
          privacy. Only subscribers can read paid entries. You receive 92% of each subscription &mdash; Inkwell takes 8%.
        </p>
        <p>
          Subscription payments are recurring. See our{" "}
          <a href="/terms" className="underline" target="_blank" rel="noopener noreferrer">Terms of Service</a>{" "}
          for details.
        </p>
      </div>
    </div>
  );
}
