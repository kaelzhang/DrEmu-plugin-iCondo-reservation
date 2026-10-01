// The booking rules: dates, the opening time, the grid, and the slot choices.
import assert from "node:assert/strict";
import test from "node:test";
import { gridCellOf, opensAt, targetDate, weekChoices, windowOf } from "../plugin/core/calendar.js";
import { checkTask, normalizeDraft, slotSelectable, toggleSlot } from "../plugin/core/task.js";

const at = (y, m, d, h = 0, min = 0, s = 0, ms = 0) => new Date(y, m - 1, d, h, min, s, ms).getTime();
const THURSDAY = "2026-10-01";

test("on a Thursday, the furthest bookable day is next Wednesday", () => {
  assert.equal(windowOf("2026-10-07", at(2026, 10, 1, 12)), "open");
  assert.equal(windowOf("2026-10-08", at(2026, 10, 1, 12)), "later");
  assert.equal(windowOf("2026-09-30", at(2026, 10, 1, 12)), "past");
  assert.equal(windowOf(THURSDAY, at(2026, 10, 1, 23, 59)), "open", "today stays bookable");
});

test("next Thursday opens at 00:00 on Friday", () => {
  assert.equal(opensAt("2026-10-08"), at(2026, 10, 2));
  assert.equal(windowOf("2026-10-08", at(2026, 10, 1, 23, 59, 59, 999)), "later");
  assert.equal(windowOf("2026-10-08", at(2026, 10, 2)), "open");
});

test("this / next week and a weekday name a date; past weekdays of this week cannot be chosen", () => {
  assert.equal(targetDate(THURSDAY, "this", 4), "2026-10-02");
  assert.equal(targetDate(THURSDAY, "next", 0), "2026-10-05");
  assert.equal(targetDate("2026-10-04", "next", 6), "2026-10-11", "Sunday's next week starts the day after");
  const { this: thisWeek, next } = weekChoices(THURSDAY);
  assert.deepEqual(thisWeek.map((d) => d.disabled), [true, true, true, false, false, false, false]);
  assert.ok(next.every((d) => !d.disabled));
});

test("the grid row is decided on the day the booking runs", () => {
  assert.deepEqual(gridCellOf("2026-10-02", THURSDAY), { row: 0, col: 4 });
  assert.deepEqual(gridCellOf("2026-10-11", THURSDAY), { row: 1, col: 6 });
  // Set on Thursday for next Sunday, it opens on Monday — when it is this week's row.
  assert.deepEqual(gridCellOf("2026-10-11", "2026-10-05"), { row: 0, col: 6 });
  assert.equal(gridCellOf("2026-10-12", THURSDAY), null);
});

test("one slot, or two adjacent slots; others are disabled once one is chosen", () => {
  assert.ok(slotSelectable([], 8));
  assert.deepEqual([13, 14, 15, 16].map((h) => slotSelectable([14], h)), [true, true, true, false]);
  assert.equal(slotSelectable([14, 15], 16), false);
  assert.deepEqual(toggleSlot([14], 15), [14, 15]);
  assert.deepEqual(toggleSlot([14], 17), [14], "a non-adjacent slot is not added");
  assert.deepEqual(toggleSlot([14, 15], 14), [15]);
  assert.deepEqual(normalizeDraft({ week: "next", weekday: 3, slots: [10, 12] }), { week: "next", weekday: 3, slots: [] });
});

test("a task is checked before it is accepted", () => {
  const now = at(2026, 10, 1, 12);
  assert.deepEqual(checkTask({ date: "2026-10-08", slots: [15, 14] }, now), { value: { date: "2026-10-08", slots: [14, 15] } });
  assert.equal(checkTask({ date: "2026-09-30", slots: [14] }, now).reason, "date_passed");
  assert.equal(checkTask({ date: "2026-10-08", slots: [14, 16] }, now).reason, "bad_task");
  assert.equal(checkTask({ date: "2026-10-08", slots: [22] }, now).reason, "bad_task");
  assert.equal(checkTask({ date: "2026-02-30", slots: [14] }, now).reason, "bad_task");
});
