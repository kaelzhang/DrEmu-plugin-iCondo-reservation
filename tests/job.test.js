// The grab's timing against a virtual clock and a scripted flow: wait with
// keep-alive taps, measure, arrive just after 00:00, re-enter while the day
// is still closed.
import assert from "node:assert/strict";
import test from "node:test";
import { opensAt } from "../plugin/core/calendar.js";
import { createJob } from "../plugin/core/job.js";

const quiet = { debug() {}, info() {}, warn() {}, error() {} };

function harness({ start, closedTimes = 0, latency = 800 }) {
  let t = start;
  const events = [];
  let closed = closedTimes;
  const flow = {
    async where() { return "facility"; },
    async showTennis() { return 1031; },
    async toFacility() {},
    async enterTennis() { events.push(["enter", t]); t += latency; return latency; },
    async goBack() { events.push(["back", t]); },
    async bookHere() {
      if (closed > 0) { closed -= 1; return { dayClosed: true }; }
      events.push(["booked", t]);
      return { booked: true };
    },
    async cancelBooking() {},
  };
  const screen = {
    async tapRegion(name) { events.push([name, t]); },
    async waitFor() { return "facility"; },
    fail(reason, message) { throw Object.assign(new Error(message), { name: "TaskFailure", reason }); },
  };
  const updates = [];
  const job = createJob({
    flow, screen, log: quiet, booking: { info() {} },
    update: (f) => updates.push(f.phase ?? `latency ${f.latencyMs}`),
    now: () => t,
    wait: async (ms) => { t += ms; },
  });
  return { job, events, updates, now: () => t };
}

test("a later date waits with keep-alive taps and enters just after 00:00", async () => {
  const openAt = opensAt("2026-10-08"); // Friday 2 Oct 00:00
  const h = harness({ start: openAt - 10 * 60_000 });
  await h.job({ kind: "book", date: "2026-10-08", slots: [19] });
  const keepAlive = h.events.filter(([e]) => e === "facility-keep-alive").map(([, at]) => at);
  assert.ok(keepAlive.length >= 14, `${keepAlive.length} keep-alive taps over 10 minutes`);
  assert.ok(keepAlive.every((at, i) => i === 0 || at - keepAlive[i - 1] >= 30_000));
  assert.ok(keepAlive.at(-1) <= openAt - 15_000, "no keep-alive tap in the last 15 s");
  const grabEnter = h.events.filter(([e]) => e === "enter").at(-1)[1];
  assert.equal(grabEnter, openAt - 800 + 150, "tapped one entry time before 00:00, to arrive 150 ms after");
  assert.deepEqual(h.updates.filter((u) => !u.startsWith("latency")), ["waiting", "arming", "grabbing"]);
});

test("while the day still shows closed, the page is left and entered again", async () => {
  const openAt = opensAt("2026-10-08");
  const h = harness({ start: openAt - 60_000, closedTimes: 2 });
  await h.job({ kind: "book", date: "2026-10-08", slots: [19] });
  const after = h.events.filter(([, at]) => at >= openAt - 1000).map(([e]) => e);
  assert.deepEqual(after.filter((e) => e !== "facility-keep-alive"), ["enter", "back", "enter", "back", "enter", "booked"]);
});

test("a day that never opens fails after the opening window", async () => {
  const openAt = opensAt("2026-10-08");
  const h = harness({ start: openAt - 60_000, closedTimes: Infinity });
  await assert.rejects(h.job({ kind: "book", date: "2026-10-08", slots: [19] }), (e) => e.reason === "day_not_opened");
  assert.ok(h.now() >= openAt + 90_000);
});

test("a test job refuses a date that is not open yet", async () => {
  const h = harness({ start: opensAt("2026-10-08") - 60_000 });
  await assert.rejects(h.job({ kind: "test", date: "2026-10-08", slots: [19] }), (e) => e.reason === "not_open_yet");
  assert.deepEqual(h.events, []);
});
