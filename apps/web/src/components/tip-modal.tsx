"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

// Lazy-load Stripe.js — only when modal actually opens
let stripePromise: Promise<Stripe | null> | null = null;
function getStripe() {
  if (!stripePromise) {
    stripePromise = loadStripe(
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""
    );
  }
  return stripePromise;
}

interface TipModalProps {
  recipientId: string;
  recipientName: string;
  entryId?: string;
  onClose: () => void;
}

const PRESET_AMOUNTS = [100, 300, 500, 1000]; // cents

function formatDollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Calculate total (tip + processing fee) */
function calculateTotal(amountCents: number) {
  return Math.ceil((amountCents + 30) / (1 - 0.029));
}

function calculateFee(amountCents: number) {
  return calculateTotal(amountCents) - amountCents;
}

export function TipModal({ recipientId, recipientName, entryId, onClose }: TipModalProps) {
  const [amountCents, setAmountCents] = useState(500);
  const [customAmount, setCustomAmount] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [message, setMessage] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [tipId, setTipId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"amount" | "payment" | "success">("amount");
  const [mounted, setMounted] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Ensure portal target exists (client-side only)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll while modal is open (iOS-safe)
  useEffect(() => {
    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.width = "";
        document.body.style.overflow = "";
        window.scrollTo(0, scrollY);
      };
    } else {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Initialize Stripe lazily when modal opens
  useEffect(() => {
    getStripe();
  }, []);

  const effectiveAmount = isCustom
    ? Math.round(parseFloat(customAmount || "0") * 100)
    : amountCents;

  const isValidAmount = effectiveAmount >= 100 && effectiveAmount <= 10000;

  const handleProceedToPayment = async () => {
    if (!isValidAmount) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient_id: recipientId,
          amount_cents: effectiveAmount,
          anonymous,
          message: message.trim() || null,
          ...(entryId ? { entry_id: entryId } : {}),
        }),
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        setError("Unexpected server response.");
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError(data.error || "Failed to create tip.");
        setLoading(false);
        return;
      }

      setClientSecret(data.data.client_secret);
      setTipId(data.data.tip_id);
      setStep("payment");
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  };

  // Close when clicking backdrop (not modal content)
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) {
      onClose();
    }
  };

  if (!mounted) return null;

  const modalContent = (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        background: "rgba(0, 0, 0, 0.5)",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {/* Modal */}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "28rem",
          maxHeight: "calc(100dvh - 32px)",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          borderRadius: "1rem",
          border: "1px solid var(--border)",
          padding: "1.5rem",
          boxShadow: "0 20px 25px -5px rgba(0,0,0,.1), 0 8px 10px -6px rgba(0,0,0,.1)",
          background: "var(--background)",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "1rem",
            right: "1rem",
            padding: "4px",
            borderRadius: "9999px",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "var(--foreground)",
          }}
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {step === "amount" && (
          <AmountStep
            recipientName={recipientName}
            amountCents={amountCents}
            setAmountCents={setAmountCents}
            customAmount={customAmount}
            setCustomAmount={setCustomAmount}
            isCustom={isCustom}
            setIsCustom={setIsCustom}
            anonymous={anonymous}
            setAnonymous={setAnonymous}
            message={message}
            setMessage={setMessage}
            effectiveAmount={effectiveAmount}
            isValidAmount={isValidAmount}
            loading={loading}
            error={error}
            onProceed={handleProceedToPayment}
          />
        )}

        {step === "payment" && clientSecret && (
          <Elements
            stripe={getStripe()}
            options={{ clientSecret, appearance: { theme: "stripe" } }}
          >
            <PaymentStep
              recipientName={recipientName}
              amountCents={effectiveAmount}
              tipId={tipId!}
              onSuccess={() => setStep("success")}
              onBack={() => { setStep("amount"); setClientSecret(null); }}
            />
          </Elements>
        )}

        {step === "success" && (
          <SuccessStep
            recipientName={recipientName}
            amountCents={effectiveAmount}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

// ── Step 1: Amount Selection ──────────────────────────────────────

interface AmountStepProps {
  recipientName: string;
  amountCents: number;
  setAmountCents: (v: number) => void;
  customAmount: string;
  setCustomAmount: (v: string) => void;
  isCustom: boolean;
  setIsCustom: (v: boolean) => void;
  anonymous: boolean;
  setAnonymous: (v: boolean) => void;
  message: string;
  setMessage: (v: string) => void;
  effectiveAmount: number;
  isValidAmount: boolean;
  loading: boolean;
  error: string | null;
  onProceed: () => void;
}

function AmountStep({
  recipientName, amountCents, setAmountCents, customAmount, setCustomAmount,
  isCustom, setIsCustom, anonymous, setAnonymous, message, setMessage,
  effectiveAmount, isValidAmount, loading, error, onProceed,
}: AmountStepProps) {
  return (
    <>
      <div className="flex items-center gap-2 mb-5">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
          Send postage to {recipientName}
        </h2>
      </div>

      {/* Preset amounts */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {PRESET_AMOUNTS.map((amt) => (
          <button
            key={amt}
            onClick={() => { setAmountCents(amt); setIsCustom(false); }}
            className="rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors"
            style={{
              borderColor: !isCustom && amountCents === amt ? "var(--accent)" : "var(--border)",
              background: !isCustom && amountCents === amt ? "var(--accent)" : "var(--surface)",
              color: !isCustom && amountCents === amt ? "#fff" : "var(--foreground)",
            }}
          >
            {formatDollars(amt)}
          </button>
        ))}
      </div>

      {/* Custom amount */}
      <div className="mb-4">
        <button
          onClick={() => setIsCustom(true)}
          className="text-xs mb-1.5 transition-colors"
          style={{ color: isCustom ? "var(--accent)" : "var(--muted)" }}
        >
          Custom amount
        </button>
        {isCustom && (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--muted)" }}>$</span>
            <input
              type="number"
              min="1"
              max="100"
              step="0.01"
              placeholder="5.00"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 pl-7 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" }}
              autoFocus
            />
          </div>
        )}
      </div>

      {/* Anonymous toggle */}
      <label className="flex items-center gap-2 mb-3 cursor-pointer">
        <input
          type="checkbox"
          checked={anonymous}
          onChange={(e) => setAnonymous(e.target.checked)}
          className="rounded"
        />
        <span className="text-sm" style={{ color: "var(--foreground)" }}>Send anonymously</span>
      </label>

      {/* Optional message */}
      <div className="mb-4">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 200))}
          placeholder="Leave a note for the writer... (optional)"
          rows={2}
          className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" }}
        />
        <div className="text-right text-xs mt-0.5" style={{ color: "var(--muted)" }}>
          {message.length}/200
        </div>
      </div>

      {/* Fee breakdown */}
      {isValidAmount && (
        <div className="rounded-lg border p-3 mb-4 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="flex justify-between mb-1">
            <span style={{ color: "var(--muted)" }}>Postage</span>
            <span>{formatDollars(effectiveAmount)}</span>
          </div>
          <div className="flex justify-between mb-1">
            <span style={{ color: "var(--muted)" }}>Processing fee</span>
            <span>{formatDollars(calculateFee(effectiveAmount))}</span>
          </div>
          <div className="flex justify-between font-medium pt-1 border-t" style={{ borderColor: "var(--border)" }}>
            <span>You pay</span>
            <span>{formatDollars(calculateTotal(effectiveAmount))}</span>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm mb-3" style={{ color: "var(--danger, #ef4444)" }}>{error}</p>
      )}

      <button
        onClick={onProceed}
        disabled={!isValidAmount || loading}
        className="w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-opacity disabled:opacity-50"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        {loading ? "Processing..." : `Continue — ${isValidAmount ? formatDollars(calculateTotal(effectiveAmount)) : "..."}`}
      </button>
    </>
  );
}

// ── Step 2: Stripe Payment ────────────────────────────────────────

interface PaymentStepProps {
  recipientName: string;
  amountCents: number;
  tipId: string;
  onSuccess: () => void;
  onBack: () => void;
}

function PaymentStep({ recipientName, amountCents, tipId, onSuccess, onBack }: PaymentStepProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setError(null);

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (stripeError) {
      setError(stripeError.message || "Payment failed.");
      setLoading(false);
      return;
    }

    // Confirm tip on our backend
    try {
      await fetch(`/api/tips/${tipId}/confirm`, { method: "POST" });
    } catch {
      // Webhook will handle it
    }

    setLoading(false);
    onSuccess();
  }, [stripe, elements, tipId, onSuccess]);

  return (
    <>
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm mb-4 transition-colors"
        style={{ color: "var(--muted)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
        Back
      </button>

      <h2 className="text-lg font-semibold mb-1" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
        Complete your postage
      </h2>
      <p className="text-sm mb-5" style={{ color: "var(--muted)" }}>
        {formatDollars(amountCents)} postage to {recipientName} — total {formatDollars(calculateTotal(amountCents))}
      </p>

      <form onSubmit={handleSubmit}>
        <PaymentElement />

        {error && (
          <p className="text-sm mt-3" style={{ color: "var(--danger, #ef4444)" }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={!stripe || loading}
          className="w-full mt-4 rounded-lg px-4 py-2.5 text-sm font-medium transition-opacity disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {loading ? "Processing..." : `Pay ${formatDollars(calculateTotal(amountCents))}`}
        </button>
      </form>
    </>
  );
}

// ── Step 3: Success ───────────────────────────────────────────────

function SuccessStep({ recipientName, amountCents, onClose }: { recipientName: string; amountCents: number; onClose: () => void }) {
  return (
    <div className="text-center py-4">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
        style={{ background: "var(--accent-light)" }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </div>
      <h2 className="text-lg font-semibold mb-2" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
        Thank you!
      </h2>
      <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
        Your {formatDollars(amountCents)} postage was sent to {recipientName}.
      </p>
      <button
        onClick={onClose}
        className="rounded-lg border px-6 py-2 text-sm font-medium transition-colors"
        style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
      >
        Done
      </button>
    </div>
  );
}
