// The flows against the real screenshots: a stand-in device shows them and
// moves between them as iCondo does (support/fake-icondo.js).
import assert from "node:assert/strict";
import test from "node:test";
import { dayRect, slotRect } from "../plugin/core/court.js";
import { createFlow } from "../plugin/core/flow.js";
import { createJob } from "../plugin/core/job.js";
import { createScreen } from "../plugin/core/screen.js";
import assets from "./support/assets.js";
import { createFakeIcondo, hasScreenshots } from "./support/fake-icondo.js";

const skip = hasScreenshots ? false : "screenshots/ is not here";
const quiet = { debug() {}, info() {}, warn() {}, error() {} };
const r = (x, y, width, height) => ({ x, y, width, height });

// Thursday 1 October 2026, 13:00, moving with real time.
const BASE = new Date(2026, 9, 1, 13).getTime();
const started = Date.now();
const now = () => BASE + (Date.now() - started);

const BACK = r(20, 85, 70, 60);
const CARD = r(20, 1020, 680, 140);
const ACTIVE_TAB = r(232, 192, 75, 89);
const BOOK_TAB = r(58, 192, 64, 90);
const FACILITY_ICON = r(57, 187, 62, 63);
const ROUTES = (tennis = "tennis-court-next") => ({
  // The facility page takes a few frames to appear: what is seen meanwhile is no page at all.
  home: [{ on: "tap", rect: FACILITY_ICON, to: "facility-top", via: { screen: "blank", ms: 1500 } }],
  "facility-top": [{ on: "swipe", to: "facility-bottom" }, { on: "tap", rect: ACTIVE_TAB, to: "active" }],
  "facility-bottom": [{ on: "tap", rect: CARD, to: tennis }, { on: "tap", rect: ACTIVE_TAB, to: "active" }],
  "tennis-court": [
    { on: "tap", rect: slotRect(14), to: "tennis-court-next" },
    { on: "tap", rect: dayRect({ row: 0, col: 4 }), to: "tennis-court-next" },
    { on: "tap", rect: BACK, to: "facility-bottom" },
  ],
  "tennis-court-next": [{ on: "tap", rect: r(260, 1106, 207, 63), to: "agree" }, { on: "tap", rect: BACK, to: "facility-bottom" }],
  agree: [{ on: "tap", rect: r(10, 1111, 698, 51), to: "confirm" }],
  confirm: [{ on: "tap", rect: r(86, 1108, 544, 58), to: "book-success" }],
  "book-success": [{ on: "tap", rect: BACK, to: "facility-bottom" }],
  active: [{ on: "tap", rect: r(560, 458, 100, 100), to: "cancel-confirm-top" }, { on: "tap", rect: BOOK_TAB, to: "facility-bottom" }],
  "cancel-confirm-top": [{ on: "swipe", to: "cancel-confirm-bottom" }],
  "cancel-confirm-bottom": [{ on: "tap", rect: r(380, 1024, 290, 120), to: "active" }],
});

// The active tab's first card: Fri, 02 Oct 2026, 02:00 PM - 03:00 PM.
function digits(screen, rect) {
  if (screen !== "active") return [];
  if (rect.y === 458) return ["02", "2026"];
  if (rect.y === 492) return ["02", "00", "03", "00"];
  return [];
}

// The same routes with every tap's page pushed in: `ms` of a blank frame first.
const PUSHED = (ms) => Object.fromEntries(Object.entries(ROUTES()).map(([from, routes]) => [from, routes.map((route) => (route.on === "tap" ? { ...route, via: { screen: "blank", ms } } : route))]));

function run(screen, routes = ROUTES()) {
  const fake = createFakeIcondo({ screen, routes, digits });
  const shown = createScreen({ device: fake.device, assets, log: quiet, gapMs: 0 });
  const flow = createFlow({ screen: shown, device: fake.device, log: quiet, now });
  return { fake, flow, screen: shown };
}

const failure = (reason) => (error) => {
  assert.equal(error.name, "TaskFailure", error.stack);
  assert.equal(error.reason, reason, error.message);
  return true;
};

test("a test job books Friday 14:00 from the facility list and cancels it again", { skip, timeout: 60_000 }, async () => {
  const { fake, flow, screen } = run("facility-top");
  const updates = [];
  const records = [];
  const job = createJob({ flow, screen, log: quiet, booking: { info: (e) => records.push(e) }, update: (f) => updates.push(f), now });
  await job({ kind: "test", date: "2026-10-02", slots: [14] });
  assert.equal(fake.state.screen, "active");
  assert.deepEqual(updates.map((u) => u.phase), ["booking", "cancelling"]);
  assert.deepEqual(records, ["start", "booked", "cancelled"]);
  assert.deepEqual(fake.state.taps.map((t) => t.screen), [
    "facility-bottom", // the tennis-court card
    "tennis-court-next", // next (day and slot were already chosen: nothing re-tapped)
    "agree",
    "confirm",
    "book-success", // back
    "facility-bottom", // the active tab
    "active", // cancel
    "cancel-confirm-bottom", // yes
  ]);
});

test("the same test job goes through when every tapped page is pushed in over 400 ms", { skip, timeout: 60_000 }, async () => {
  const { fake, flow, screen } = run("facility-top", PUSHED(400));
  const job = createJob({ flow, screen, log: quiet, booking: { info() {} }, update() {}, now });
  await job({ kind: "test", date: "2026-10-02", slots: [14] });
  assert.equal(fake.state.screen, "active");
  assert.equal(fake.state.taps.length, 8, JSON.stringify(fake.state.taps.map((t) => t.screen)));
});

test("an open day and an open slot are tapped once each before next", { skip, timeout: 30_000 }, async () => {
  const day = run("tennis-court");
  assert.deepEqual(await day.flow.bookHere({ date: "2026-10-02", slots: [14] }), { booked: true });
  assert.deepEqual(day.fake.state.taps.slice(0, 1).map((t) => t.screen), ["tennis-court"]);
  const slot = run("tennis-court");
  assert.deepEqual(await slot.flow.bookHere({ date: "2026-10-01", slots: [14] }), { booked: true });
  assert.equal(slot.fake.state.taps.filter((t) => t.screen === "tennis-court").length, 1);
});

test("a taken slot fails the task without a tap", { skip }, async () => {
  const { fake, flow } = run("tennis-court");
  await assert.rejects(flow.bookHere({ date: "2026-10-01", slots: [16] }), failure("slot_unavailable"));
  assert.deepEqual(fake.state.taps, []);
});

test("two slots when only one is free: the whole task fails (R10)", { skip }, async () => {
  const { fake, flow } = run("tennis-court-next");
  await assert.rejects(flow.bookHere({ date: "2026-10-02", slots: [14, 15] }), failure("slot_unavailable"));
  assert.deepEqual(fake.state.taps, []);
});

test("a day that has not opened is reported, not tapped", { skip }, async () => {
  const { fake, flow } = run("tennis-court");
  assert.deepEqual(await flow.bookHere({ date: "2026-10-08", slots: [14] }), { dayClosed: true });
  assert.deepEqual(fake.state.taps, []);
});

test("a booking not on the active tab is not cancelled", { skip, timeout: 30_000 }, async () => {
  const { fake, flow } = run("active");
  await assert.rejects(flow.cancelBooking({ date: "2026-10-06", slots: [8, 9] }), failure("cancel_not_found"));
  assert.equal(fake.state.taps.length, 0);
});

test("an unknown screen without a back arrow stops the flow: the system back is never tapped there (R16)", { skip }, async () => {
  const { fake, flow } = run("blank");
  await assert.rejects(flow.toFacility("book"), failure("unknown_screen"));
  assert.deepEqual(fake.state.taps, []);
});

test("from home, a page still animating in is waited for, not taken for an unknown screen", { skip, timeout: 30_000 }, async () => {
  const { fake, flow } = run("home");
  await flow.toFacility("book");
  assert.equal(fake.state.screen, "facility-top");
  assert.deepEqual(fake.state.taps.map((t) => t.screen), ["home"], "the facility icon, once; no back of any kind");
});

test("iCondo leaving the front stops the flow", { skip }, async () => {
  const { fake, flow } = run("facility-top");
  fake.state.app = "com.android.launcher";
  await assert.rejects(flow.toFacility("book"), failure("icondo_left"));
});
