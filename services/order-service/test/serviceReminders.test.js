import test from "node:test";
import assert from "node:assert/strict";
import { isReminderEligible, localDateInTimeZone } from "../src/serviceReminders.js";

test("reminder eligibility includes today and the seventh day", () => {
  const today = "2026-10-17";
  assert.equal(isReminderEligible("2026-10-17", today), true);
  assert.equal(isReminderEligible("2026-10-24", today), true);
});

test("reminder eligibility excludes past dates and dates beyond seven days", () => {
  const today = "2026-10-17";
  assert.equal(isReminderEligible("2026-10-16", today), false);
  assert.equal(isReminderEligible("2026-10-25", today), false);
});

test("reminder eligibility skips missing or malformed dates", () => {
  assert.equal(isReminderEligible(null, "2026-10-17"), false);
  assert.equal(isReminderEligible("not-a-date", "2026-10-17"), false);
});

test("reminder date uses the Guatemala calendar date", () => {
  const instant = new Date("2026-10-17T05:30:00.000Z");
  assert.equal(localDateInTimeZone(instant), "2026-10-16");
});
