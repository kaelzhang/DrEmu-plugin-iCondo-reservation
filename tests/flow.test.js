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

function run(screen, routes = ROUTES(), { lagMs = 0 } = {}) {
  const fake = createFakeIcondo({ screen, routes, digits, lagMs });
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

// The device as it behaves: every tap answered after 300 ms of the old
// screen, pushed pages, and a slot grid that shows the previous day's for a
// while after a day is chosen. Nothing may be judged before it is ready.
test("a test job goes through when every response is late, pages are pushed and the slots reload", { skip, timeout: 60_000 }, async () => {
  const routes = PUSHED(300);
  routes["facility-bottom"] = routes["facility-bottom"].map((route) => (route.to === "tennis-court-next" ? { ...route, to: "tennis-court" } : route));
  routes["tennis-court"] = [
    { on: "tap", rect: dayRect({ row: 0, col: 4 }), to: "tennis-court-next", via: { screen: "tennis-court-next-stale", ms: 800 } },
    { on: "tap", rect: BACK, to: "facility-bottom" },
  ];
  routes["tennis-court-next"] = [{ on: "tap", rect: slotRect(13), to: "tennis-court-next-13" }, { on: "tap", rect: BACK, to: "facility-bottom" }];
  routes["tennis-court-next-13"] = [{ on: "tap", rect: r(260, 1106, 207, 63), to: "agree", via: { screen: "blank", ms: 300 } }];
  const digitsFor13 = (screen, rect) => (screen !== "active" ? [] : rect.y === 458 ? ["02", "2026"] : rect.y === 492 ? ["01", "00", "02", "00"] : []);
  const fake = createFakeIcondo({ screen: "facility-top", routes, digits: digitsFor13, lagMs: 300 });
  const shown = createScreen({ device: fake.device, assets, log: quiet });
  const flow = createFlow({ screen: shown, device: fake.device, log: quiet, now });
  const job = createJob({ flow, screen: shown, log: quiet, booking: { info() {} }, update() {}, now });
  await job({ kind: "test", date: "2026-10-02", slots: [13] });
  assert.equal(fake.state.screen, "active");
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

test("the active list arriving 4 s after the tab is waited for, and the booking is cancelled", { skip, timeout: 60_000 }, async () => {
  const routes = ROUTES();
  routes["facility-bottom"] = routes["facility-bottom"].map((r) => (r.to === "active" ? { ...r, via: { screen: "active-loading", ms: 4000 } } : r));
  const { fake, flow } = run("facility-bottom", routes);
  await flow.cancelBooking({ date: "2026-10-02", slots: [14] });
  assert.equal(fake.state.screen, "active");
  assert.deepEqual(fake.state.taps.map((t) => t.screen), ["facility-bottom", "active", "cancel-confirm-bottom"]);
});

test("an ignored tap on the active tab is made again, and the list is only looked at once the tab is on", { skip, timeout: 60_000 }, async () => {
  const routes = ROUTES();
  routes["facility-bottom"] = routes["facility-bottom"].map((r) => (r.to === "active" ? { ...r, ignore: 1 } : r));
  const { fake, flow } = run("facility-bottom", routes);
  const started = Date.now();
  await flow.cancelBooking({ date: "2026-10-02", slots: [14] });
  assert.equal(fake.state.screen, "active");
  assert.deepEqual(fake.state.taps.map((t) => t.screen), ["facility-bottom", "facility-bottom", "active", "cancel-confirm-bottom"]);
  assert.ok(Date.now() - started < 1500, `took ${Date.now() - started} ms`);
});

test("the cancel sheet is swiped up at once to reach yes, without waiting on its first screen", { skip, timeout: 30_000 }, async () => {
  const { fake, flow } = run("active");
  const started = Date.now();
  await flow.cancelBooking({ date: "2026-10-02", slots: [14] });
  assert.equal(fake.state.screen, "active");
  assert.equal(fake.state.swipes.length, 1);
  assert.ok(Date.now() - started < 1500, `took ${Date.now() - started} ms`);
});

test("a yes tap the sheet swallowed (still gliding) is made again while yes is still there", { skip, timeout: 30_000 }, async () => {
  const routes = ROUTES();
  routes["cancel-confirm-bottom"] = [{ on: "tap", rect: r(380, 1024, 290, 120), to: "active", ignore: 1 }];
  const { fake, flow } = run("active", routes);
  const started = Date.now();
  await flow.cancelBooking({ date: "2026-10-02", slots: [14] });
  assert.equal(fake.state.screen, "active");
  assert.deepEqual(fake.state.taps.map((t) => t.screen), ["active", "cancel-confirm-bottom", "cancel-confirm-bottom"]);
  assert.ok(Date.now() - started < 1500, `took ${Date.now() - started} ms`);
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

test("a back tap the page ignored is tried again within seconds, and the page is still named", { skip, timeout: 30_000 }, async () => {
  const routes = ROUTES();
  routes["book-success"] = [{ on: "tap", rect: BACK, to: "facility-bottom", ignore: 1 }];
  const { fake, flow } = run("book-success", routes);
  const started = Date.now();
  await flow.toFacility("book");
  assert.equal(fake.state.screen, "facility-bottom");
  assert.deepEqual(fake.state.taps.map((t) => t.screen), ["book-success", "book-success"]);
  assert.ok(Date.now() - started < 1500, `took ${Date.now() - started} ms`);
});

test("an ignored tap on next or agree is made again; the booking goes through with one confirm", { skip, timeout: 30_000 }, async () => {
  const routes = ROUTES();
  routes["tennis-court-next"] = [{ on: "tap", rect: r(260, 1106, 207, 63), to: "agree", ignore: 1 }];
  routes.agree = [{ on: "tap", rect: r(10, 1111, 698, 51), to: "confirm", ignore: 1 }];
  const { fake, flow } = run("tennis-court-next", routes);
  const started = Date.now();
  assert.deepEqual(await flow.bookHere({ date: "2026-10-02", slots: [14] }), { booked: true });
  assert.deepEqual(fake.state.taps.map((t) => t.screen), ["tennis-court-next", "tennis-court-next", "agree", "agree", "confirm"]);
  assert.ok(Date.now() - started < 2500, `took ${Date.now() - started} ms`);
});

test("on the book tab the list is swiped at once and tennis court looked for right after (R23)", { skip, timeout: 30_000 }, async () => {
  const { fake, flow } = run("facility-top");
  const started = Date.now();
  const y = await flow.showTennis();
  assert.ok(Math.abs(y - 1031) <= 2, `y ${y}`);
  assert.equal(fake.state.swipes.length, 1);
  assert.ok(Date.now() - started < 1500, `took ${Date.now() - started} ms`);
});

test("an ignored tap on the day or on cancel is made again within a second", { skip, timeout: 30_000 }, async () => {
  const routes = ROUTES();
  routes["tennis-court"] = routes["tennis-court"].map((route) => (route.to === "tennis-court-next" && route.rect.y === 318 ? { ...route, ignore: 1 } : route));
  const day = run("tennis-court", routes);
  let started = Date.now();
  assert.deepEqual(await day.flow.bookHere({ date: "2026-10-02", slots: [14] }), { booked: true });
  assert.deepEqual(day.fake.state.taps.slice(0, 2).map((t) => t.screen), ["tennis-court", "tennis-court"]);
  assert.ok(Date.now() - started < 2500, `day: ${Date.now() - started} ms`);

  routes.active = routes.active.map((route) => (route.to === "cancel-confirm-top" ? { ...route, ignore: 1 } : route));
  const sheet = run("active", routes);
  started = Date.now();
  await sheet.flow.cancelBooking({ date: "2026-10-02", slots: [14] });
  assert.deepEqual(sheet.fake.state.taps.map((t) => t.screen), ["active", "active", "cancel-confirm-bottom"]);
  assert.ok(Date.now() - started < 2500, `cancel: ${Date.now() - started} ms`);
});

test("a tap on the tennis-court card the list swallowed (still gliding) is made again within a second", { skip, timeout: 30_000 }, async () => {
  const routes = ROUTES();
  routes["facility-bottom"] = routes["facility-bottom"].map((route) => (route.rect === CARD ? { ...route, ignore: 1 } : route));
  const { fake, flow } = run("facility-bottom", routes);
  const ms = await flow.enterTennis(1031);
  assert.notEqual(ms, null, "the booking page was reached");
  assert.equal(fake.state.screen, "tennis-court-next");
  assert.deepEqual(fake.state.taps.map((t) => t.screen), ["facility-bottom", "facility-bottom"]);
  assert.ok(ms < 1500, `${ms} ms`);
});

test("a list that jumps back to the top as the card is tapped is scrolled again and the card tapped there", { skip, timeout: 30_000 }, async () => {
  const routes = ROUTES();
  // The list re-renders once its data arrives, back at the top: the card is gone.
  routes["facility-bottom"] = [{ on: "tap", rect: CARD, to: "facility-top", times: 1 }, ...routes["facility-bottom"]];
  const { fake, flow } = run("facility-bottom", routes);
  const started = Date.now();
  const ms = await flow.enterTennis(1031);
  assert.notEqual(ms, null, "the booking page was reached");
  assert.equal(fake.state.screen, "tennis-court-next");
  assert.equal(fake.state.swipes.length, 1);
  assert.ok(Date.now() - started < 2500, `took ${Date.now() - started} ms`);
});

test("after a day is chosen, its slots are waited for; the previous day's grid is not taken for them", { skip, timeout: 30_000 }, async () => {
  const routes = ROUTES();
  // Choosing Friday: the day turns at once, the slots still show Thursday's for 600 ms.
  routes["tennis-court"] = [{ on: "tap", rect: dayRect({ row: 0, col: 4 }), to: "tennis-court-next", via: { screen: "tennis-court-next-stale", ms: 600 } }];
  routes["tennis-court-next"] = [{ on: "tap", rect: slotRect(13), to: "tennis-court-next-13" }];
  routes["tennis-court-next-13"] = [{ on: "tap", rect: r(260, 1106, 207, 63), to: "agree" }];
  const { flow } = run("tennis-court", routes);
  // Friday 13:00 is closed on Thursday's grid and open on Friday's.
  assert.deepEqual(await flow.bookHere({ date: "2026-10-02", slots: [13] }), { booked: true });
});

test("iCondo leaving the front stops the flow", { skip }, async () => {
  const { fake, flow } = run("facility-top");
  fake.state.app = "com.android.launcher";
  await assert.rejects(flow.toFacility("book"), failure("icondo_left"));
});
