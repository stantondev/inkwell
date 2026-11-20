"use client";

// How often and how much, for Plus membership. Yearly comes first and is the
// default; Member (today's price) is always the pre-selected level. Used by
// Settings → Billing and the onboarding "Choose your path" step.

import {
  LEVEL_INFO,
  plusChoice,
  plusPriceLabel,
  type PlusInterval,
  type PlusLevel,
  type PlusPrices,
} from "@/lib/plus-pitch";

export function MembershipPicker({
  prices,
  level,
  interval,
  onLevel,
  onInterval,
}: {
  prices: PlusPrices;
  level: PlusLevel;
  interval: PlusInterval;
  onLevel: (l: PlusLevel) => void;
  onInterval: (i: PlusInterval) => void;
}) {
  const chosen = plusChoice(prices, level, interval);
  const levels: PlusLevel[] = prices.supporterAvailable ? ["member", "supporter"] : ["member"];

  return (
    <div className="membership-picker">
      {prices.annualAvailable && (
        <div className="membership-interval" role="radiogroup" aria-label="How often you pay">
          {(["year", "month"] as const).map((iv) => (
            <button
              key={iv}
              type="button"
              role="radio"
              aria-checked={chosen.interval === iv}
              onClick={() => onInterval(iv)}
              className={`membership-interval-option${chosen.interval === iv ? " is-on" : ""}`}
            >
              {iv === "year" ? "Yearly" : "Monthly"}
            </button>
          ))}
        </div>
      )}

      {levels.length > 1 && (
        <div className="membership-levels" role="radiogroup" aria-label="How much you pay">
          {levels.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={chosen.level === l}
              onClick={() => onLevel(l)}
              className={`membership-level${chosen.level === l ? " is-on" : ""}`}
            >
              <span className="membership-level-top">
                <span className="membership-level-name">{LEVEL_INFO[l].name}</span>
                <span className="membership-level-price">{plusPriceLabel(prices, l, chosen.interval)}</span>
              </span>
              <span className="membership-level-note">{LEVEL_INFO[l].note}</span>
            </button>
          ))}
        </div>
      )}

      {chosen.interval === "year" && prices.annualAvailable && (
        <p className="membership-hint">One payment a year, two months cheaper than monthly.</p>
      )}
    </div>
  );
}
