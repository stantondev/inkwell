// What a membership checkout sends, and the bills sentence. The rule that
// matters most: never send a level or interval that isn't on sale, and never
// fall back to a *more* expensive choice than the member picked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { billsLine, plusChoice, plusPriceCents, plusPriceLabel, plusPricesFrom } from "./plus-pitch";

const all = plusPricesFrom({
  plus_annual_available: true,
  plus_annual_cents: 5000,
  plus_supporter_available: true,
  plus_supporter_cents: 1000,
  plus_supporter_annual_cents: 10000,
});

test("every level and interval maps to its own price", () => {
  assert.equal(plusPriceCents(all, "member", "month"), 500);
  assert.equal(plusPriceCents(all, "member", "year"), 5000);
  assert.equal(plusPriceCents(all, "supporter", "month"), 1000);
  assert.equal(plusPriceCents(all, "supporter", "year"), 10000);
  assert.equal(plusPriceLabel(all, "member", "year"), "$50 a year");
  assert.equal(plusPriceLabel(all, "supporter", "month"), "$10 a month");
});

test("nothing that isn't on sale is ever sent", () => {
  const noSupporter = plusPricesFrom({ plus_annual_available: true, plus_annual_cents: 5000 });
  assert.deepEqual(plusChoice(noSupporter, "supporter", "year"), { level: "member", interval: "year" });

  const noYearly = plusPricesFrom({ plus_supporter_available: true });
  assert.deepEqual(plusChoice(noYearly, "supporter", "year"), { level: "supporter", interval: "month" });

  const nothing = plusPricesFrom(null);
  assert.deepEqual(plusChoice(nothing, "supporter", "year"), { level: "member", interval: "month" });
  assert.equal(plusPriceLabel(nothing, "supporter", "year"), "$5 a month");
});

test("the bills sentence", () => {
  assert.equal(
    billsLine(7976, 1000),
    "Inkwell's bills are $80 a month. Members cover $10 of that. That's 16 members at $5.",
  );
  assert.equal(billsLine(7976, 0), "Inkwell's bills are $80 a month. Members cover $0 of that. That's 16 members at $5.");
  assert.equal(billsLine(7976, 9000), "Inkwell's bills are $80 a month. Members cover all of it. That's 16 members at $5.");
  assert.equal(billsLine(0, 100), null);
  assert.equal(billsLine(7976, null), null);
});
