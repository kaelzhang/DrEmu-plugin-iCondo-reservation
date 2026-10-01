// Reading the real screenshots: which page each one is, and the state of
// every day and slot on the booking page.
import assert from "node:assert/strict";
import test from "node:test";
import { DAYS_AREA, SLOTS_AREA, dayState, slotState } from "../plugin/core/court.js";
import { createFlow } from "../plugin/core/flow.js";
import { createScreen } from "../plugin/core/screen.js";
import assets from "./support/assets.js";
import { createFakeIcondo, hasScreenshots } from "./support/fake-icondo.js";

const skip = hasScreenshots ? false : "screenshots/ is not here";
const quiet = { debug() {}, info() {}, warn() {}, error() {} };

function on(name) {
  const fake = createFakeIcondo({ screen: name, routes: {} });
  const screen = createScreen({ device: fake.device, assets, log: quiet });
  return { fake, screen, flow: createFlow({ screen, device: fake.device, log: quiet }) };
}

test("each screenshot is recognised as its page", { skip }, async () => {
  const expected = {
    "facility-top": "facility",
    "facility-bottom": "facility",
    active: "facility",
    "tennis-court": "tennis",
    "tennis-court-next": "tennis",
    agree: "agree",
    confirm: "confirm",
    "book-success": "success",
    "cancel-confirm-top": "unknown",
    blank: "unknown",
  };
  for (const [name, page] of Object.entries(expected)) assert.equal(await on(name).flow.where(), page, name);
  assert.equal(await on("active").flow.facilityTab(), "active");
  assert.equal(await on("facility-top").flow.facilityTab(), "book");
});

test("next is lit only once a slot is chosen", { skip }, async () => {
  assert.equal(await on("tennis-court-next").screen.is("next", { image: "enabled" }), true);
  assert.equal(await on("tennis-court").screen.is("next", { image: "enabled" }), false);
  assert.equal((await on("tennis-court").screen.score("next")).image, "disabled");
  assert.equal((await on("tennis-court-next").screen.score("next")).image, "enabled");
});

test("every day and slot reads as the screenshot shows it", { skip }, async () => {
  const { screen } = on("tennis-court");
  const days = await screen.capture(DAYS_AREA);
  const row = (r) => Array.from({ length: 7 }, (_, col) => dayState(days, { row: r, col }));
  assert.deepEqual(row(0), ["closed", "closed", "closed", "selected", "open", "open", "open"]);
  assert.deepEqual(row(1), ["open", "open", "open", "closed", "closed", "closed", "closed"]);
  const slots = await screen.capture(SLOTS_AREA);
  const open = Array.from({ length: 14 }, (_, i) => 8 + i).filter((h) => slotState(slots, h) !== "closed");
  assert.deepEqual(open, [14, 15]);

  const next = on("tennis-court-next").screen;
  const nextSlots = await next.capture(SLOTS_AREA);
  assert.equal(slotState(nextSlots, 14), "selected");
  assert.equal(slotState(nextSlots, 13), "open");
  assert.equal(slotState(nextSlots, 15), "closed");
  assert.equal(dayState(await next.capture(DAYS_AREA), { row: 0, col: 4 }), "selected");
});

test("the tennis-court card is found going down the list, and only at the bottom", { skip }, async () => {
  const LIST = { top: 300, bottom: 1180 };
  assert.deepEqual(await on("facility-top").screen.scanY("tennis-court", LIST), []);
  const [found] = await on("facility-bottom").screen.scanY("tennis-court", LIST);
  assert.ok(Math.abs(found.y - 1031) <= 2, JSON.stringify(found));
});

test("only the first card on the active tab has a cancel button", { skip }, async () => {
  const cards = await on("active").screen.scanY("cancel", { top: 300, bottom: 1180 });
  assert.equal(cards.length, 1, JSON.stringify(cards));
  assert.ok(Math.abs(cards[0].y - 458) <= 2);
});
