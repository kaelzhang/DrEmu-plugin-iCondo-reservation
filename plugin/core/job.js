// One reservation job from start to end (docs/FLOW.md §任务): book now when
// the date is open, or wait on the facility page — keeping the device awake —
// and grab the slot the moment the date opens at 00:00. A "test" job books
// and then cancels what it booked.
import { opensAt, windowOf } from "./calendar.js";
import { slotsLabel } from "./task.js";
import { TaskFailure, sleep } from "./timing.js";

export const KEEP_ALIVE_MS = 30_000;
// Before the opening: re-measure and re-place this long before 00:00, and
// stop the keep-alive taps this long before it (so none is in flight).
const PREPARE_BEFORE_MS = 120_000;
const QUIET_BEFORE_MS = 15_000;
// Arrive this long after 00:00 (so the page is asked for after it opens),
// and keep re-entering this long while the day still shows closed.
const ARRIVE_AFTER_MS = 150;
const OPENING_WINDOW_MS = 90_000;
const FALLBACK_LATENCY_MS = 1000;

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

// `update(fields)` records progress (phase, latencyMs, …) for the panel.
// `now` and `wait(ms, signal)` are the clock (tests pass a virtual one).
export function createJob({ flow, screen, log, booking, update, now = Date.now, wait = sleep, signal }) {
  // Sleep until the wall-clock instant `at`, in slices of at most 10 s so a
  // clock that jumps (the Mac sleeping, NTP) is re-read.
  async function waitUntil(at) {
    for (let left = at - now(); left > 0; left = at - now()) await wait(Math.min(left, 10_000), signal);
  }

  // Enter and leave the booking page `times` times; the median entry time.
  async function calibrate(times) {
    const samples = [];
    for (let i = 0; i < times; i += 1) {
      const y = await flow.showTennis();
      const ms = await flow.enterTennis(y);
      if (ms === null) continue;
      samples.push(ms);
      await flow.toFacility("book");
    }
    const latencyMs = samples.length ? median(samples) : FALLBACK_LATENCY_MS;
    log.info("job.latency", { samples: samples.join(",") || "—", median: latencyMs });
    booking.info("latency", { samples, median: latencyMs });
    update({ latencyMs });
    return latencyMs;
  }

  // Tap the keep-alive spot every 30 s until `until`, re-placing the list
  // whenever the facility page is not what is on screen.
  async function keepAlive(until) {
    while (now() + KEEP_ALIVE_MS < until) {
      await wait(KEEP_ALIVE_MS, signal);
      if ((await flow.where()) !== "facility") {
        log.warn("job.keep_alive_moved", { detail: "不在 facility 页，重新回到 tennis court 位置" });
        await flow.showTennis();
      }
      await screen.tapRegion("facility-keep-alive");
    }
  }

  async function bookNow(task) {
    const y = await flow.showTennis();
    if ((await flow.enterTennis(y)) === null) screen.fail("tennis_page_missing", "点了 tennis court 没有进入预定页");
    const result = await flow.bookHere(task);
    if (result.dayClosed) screen.fail("day_closed", `${task.date} 当前不可预定`);
  }

  async function grab(task) {
    const openAt = opensAt(task.date);
    update({ phase: "waiting", openAt });
    log.info("job.waiting", { date: task.date, opens: new Date(openAt).toString() });
    booking.info("waiting", { date: task.date, slots: task.slots, openAt });
    await calibrate(3);
    await flow.showTennis();
    if (now() < openAt - PREPARE_BEFORE_MS) await keepAlive(openAt - PREPARE_BEFORE_MS);
    await waitUntil(openAt - PREPARE_BEFORE_MS);
    update({ phase: "arming" });
    const latencyMs = await calibrate(2);
    let y = await flow.showTennis();
    await keepAlive(openAt - QUIET_BEFORE_MS);
    await waitUntil(openAt - latencyMs + ARRIVE_AFTER_MS);
    update({ phase: "grabbing" });
    log.info("job.grab", { date: task.date, latencyMs });
    for (let attempt = 1; now() < openAt + OPENING_WINDOW_MS; attempt += 1) {
      const ms = await flow.enterTennis(y, { gap: 0 });
      if (ms === null) {
        log.warn("job.enter_slow", { attempt });
        y = await flow.showTennis();
        continue;
      }
      const result = await flow.bookHere(task);
      if (!result.dayClosed) {
        booking.info("grabbed", { date: task.date, slots: task.slots, attempt, sinceOpenMs: now() - openAt });
        return;
      }
      log.info("job.day_still_closed", { attempt, sinceOpenMs: now() - openAt });
      await flow.goBack("tennis");
      await screen.waitFor(async () => (await flow.where()) === "facility" || null, { timeoutMs: 4000, intervalMs: 50 });
    }
    screen.fail("day_not_opened", `00:00 之后 ${OPENING_WINDOW_MS / 1000} 秒内 ${task.date} 一直没有开放`);
  }

  // Run `job` ({ kind: "book" | "test", date, slots }) to its end. Throws
  // TaskFailure (reason, message) or AbortError; returns when done.
  return async function run(job) {
    const task = { date: job.date, slots: job.slots };
    const window = windowOf(task.date, now());
    booking.info("start", { kind: job.kind, date: task.date, slots: task.slots, window });
    if (window === "past") throw new TaskFailure("date_passed", `${task.date} 已经过去`);
    if (window === "later") {
      if (job.kind === "test") throw new TaskFailure("not_open_yet", "测试只能预定现在就开放的日期");
      await grab(task);
    } else {
      update({ phase: "booking" });
      await bookNow(task);
    }
    booking.info("booked", { date: task.date, slots: task.slots });
    log.info("job.booked", { date: task.date, slots: slotsLabel(task.slots) });
    if (job.kind === "test") {
      update({ phase: "cancelling" });
      await flow.cancelBooking(task);
      booking.info("cancelled", { date: task.date, slots: task.slots });
    }
  };
}
