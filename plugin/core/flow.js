// The iCondo screens and the steps between them (docs/FLOW.md): where we
// are, getting to the facility page, booking on the tennis-court page, and
// cancelling a booking from the active tab. Every step waits for what it
// expects to see and fails with a stable reason when it does not appear.
//
// Nothing is judged right after a tap: iCondo pushes most pages in with an
// animation, and a frame mid-push is no page at all. After every tap or
// swipe, what should come next is waited for, with a timeout (Kael: 「你不可以
// 在 tap Region 之后，就立即做判断，你需要 waitFor」, 「默认情况下，你需要
// waitFor + timeout」).
import { DAYS_AREA, SLOTS_AREA, dayRect, dayState, slotRect, slotState } from "./court.js";
import { dateOf, gridCellOf } from "./calendar.js";
import { slotsLabel } from "./task.js";
import { ICONDO_PACKAGE } from "./icondo.js";

// Waits for what iCondo loads over the network (the booking page's days and
// slots, the active tab's list): seconds, more at the 00:00 rush.
const LOADING_MS = 10_000;
const ACTIVE_LIST_MS = 15_000;
// Finding the tennis-court card: at most this many swipes, within this long.
const MAX_LIST_SWIPES = 6;
const SHOW_TENNIS_MS = 15_000;
// Finding yes in the cancel sheet: at most this many swipes, within this long.
const MAX_SHEET_SWIPES = 5;
const SHEET_MS = 10_000;
// A tap after which nothing on screen has moved for this long did nothing
// (seen on the device when tapping a page still sliding in, or a list still
// gliding); it is made again. Taps that work move something within ~0.2 s.
const STILL_MS = 800;
// The facility list scrolls between these; the tennis-court card is found in it.
const LIST = { top: 300, bottom: 1180 };
const LIST_SWIPE = { from: { x: 360, y: 1000 }, to: { x: 360, y: 450 } };
const SHEET_SWIPE = { from: { x: 360, y: 950 }, to: { x: 360, y: 400 } };
// A card in the list is tapped across its width, at the found icon's rows.
const CARD = { x: 40, width: 640 };
// The pages the in-app back arrow (or, failing it, the system back) leaves
// without closing the app. Never system-back from "home" or an unknown screen.
const INNER_PAGES = new Set(["tennis", "agree", "confirm", "success", "sheet"]);

const twelve = (hour) => ((hour + 11) % 12) + 1;

export function createFlow({ screen, device, log, now = Date.now }) {
  // ---- where are we ------------------------------------------------------
  // Pages and how each is told; `expect` is looked for first (the page a
  // tap is meant to lead to), so the usual answer costs one or two captures.
  const PAGES = [
    ["tennis", () => screen.is("tennis-page")],
    ["agree", () => screen.is("agree")],
    ["confirm", () => screen.is("confirm")],
    ["success", () => screen.is("calendar")],
    ["facility", () => screen.is("book-tab")],
    // The home page's facility icon looks like the facility page's book tab,
    // so home is told by its own logo as well.
    ["home", async () => (await screen.is("home")) && (await screen.is("facility"))],
  ];

  async function where(expect = null) {
    const first = PAGES.find(([page]) => page === expect);
    for (const [page, shows] of first ? [first, ...PAGES.filter((p) => p !== first)] : PAGES) {
      if (await shows()) return page;
    }
    return "unknown";
  }

  // Wait for a page we know; "unknown" when none shows within `timeoutMs`.
  async function knownPage({ timeoutMs = 4000, leaving = null, expect = null } = {}) {
    // A tap that left `leaving` shows a moving frame (no page) or the next
    // page. `leaving` itself, unchanged for STILL_MS with nothing moving in
    // between, means the tap did nothing: it is returned at once, so the
    // caller taps again instead of waiting out the timeout.
    const started = now();
    let moved = false;
    const page = await screen.waitFor(async () => {
      const seen = await where(expect);
      if (seen !== leaving) moved = true;
      if (seen !== "unknown" && seen !== leaving) return seen;
      if (leaving && seen === leaving && !moved && now() - started >= STILL_MS) return leaving;
      return null;
    }, { timeoutMs });
    return page ?? "unknown";
  }

  // The facility page's tab: "book" | "active" | null.
  async function facilityTab() {
    if (await screen.is("book-tab", { image: "on" })) return "book";
    if (await screen.is("active-tab", { image: "on" })) return "active";
    return null;
  }

  async function assertInFront() {
    const front = (await device.currentApplication())?.packageId ?? null;
    if (front !== ICONDO_PACKAGE) screen.fail("icondo_left", `前台已不是 iCondo（现在是 ${front ?? "无"}），已停止，避免误操作`);
  }

  // The in-app back arrow: where the template was captured (facility,
  // confirm, success) or 6 px to its left (tennis court, terms). Its rect, or null.
  async function backShown() {
    const { rect } = screen.region("back");
    for (const dx of [0, -6]) if ((await screen.is("back", { dx })) === true) return { ...rect, x: rect.x + dx };
    return null;
  }

  // Leave the current page by its back arrow, or by the system back when the
  // page is one we know sits above the facility page — never from home or
  // an unknown screen, where the system back could close iCondo.
  async function goBack(page) {
    const back = await backShown();
    if (back) return screen.tapRect(back, "back");
    if (!INNER_PAGES.has(page)) screen.fail("unknown_screen", `无法识别当前画面（${page}），也没有返回按钮，已停止`);
    log.info("nav.system_back", { from: page });
    return screen.tapRegion("system-back");
  }

  // Tap a facility tab until it is on: a tap made while the page was still
  // sliding in is ignored, and tapping a tab again has no other effect.
  async function switchTab(tab, timeoutMs = 6000) {
    return tapUntil(`${tab}-tab`, {
      tap: () => screen.tapRegion(`${tab}-tab`),
      done: () => screen.is(`${tab}-tab`, { image: "on" }),
      still: () => screen.is(`${tab}-tab`, { image: "off" }),
      timeoutMs,
    });
  }

  // ---- getting to the facility page ---------------------------------------
  async function toFacility(tab = "book") {
    // The page the last tap meant to leave, and the page it should lead to;
    // a tap the page ignored (it was still sliding in) shows as that page,
    // unmoved, and the step is simply taken again.
    let leaving = null;
    let expect = "facility";
    for (let step = 0; step < 10; step += 1) {
      await assertInFront();
      const started = now();
      let page = leaving ? await knownPage({ leaving, expect, timeoutMs: 6000 }) : "unknown";
      if (page === "unknown") page = await knownPage({ expect, timeoutMs: 4000 });
      if (leaving) log.debug("nav.arrived", { from: leaving, at: page, ms: now() - started });
      leaving = null;
      if (page === "facility") {
        if ((await facilityTab()) !== tab && !(await switchTab(tab))) screen.fail("tab_not_on", `${tab} 标签点了没有亮起`);
        return;
      }
      log.debug("nav.step", { page, to: `facility/${tab}` });
      if (page === "home") await screen.tapRegion("facility");
      else await goBack(page);
      leaving = page;
      expect = page === "home" ? "facility" : null;
    }
    screen.fail("facility_unreachable", "10 步之内没能回到 facility 页");
  }

  // On the facility page's book tab, scroll until the tennis-court card is
  // in view; its icon's y is returned (for tapping it later without a scan).
  // The list is swiped as soon as the book tab is there, ready or not, and
  // looked at right after each swipe (Kael: 「你只要看到 book-tab 了，你就可以
  // 尝试 swipe up 了」). A card that has been found is taken once a second
  // look finds it in the same place: the list may still be gliding.
  async function showTennis() {
    await toFacility("book");
    const deadline = now() + SHOW_TENNIS_MS;
    let swipes = 0;
    let last = null;
    while (now() < deadline) {
      const [found] = await screen.scanY("tennis-court", LIST);
      if (found && last !== null && Math.abs(found.y - last) <= 2) return found.y;
      last = found ? found.y : null;
      if (!found && swipes < MAX_LIST_SWIPES) {
        await screen.swipe(LIST_SWIPE.from, LIST_SWIPE.to, "facility-list");
        swipes += 1;
      }
    }
    screen.fail("tennis_not_found", `facility 列表滑了 ${swipes} 次、${SHOW_TENNIS_MS / 1000} 秒内没找到 tennis court`);
  }

  const tennisRect = (y) => ({ x: CARD.x, y, width: CARD.width, height: screen.region("tennis-court").rect.height });

  // Tap the card at `y` and wait for the booking page. Returns the ms it took, or null.
  async function enterTennis(y, { timeoutMs = 8000, gap } = {}) {
    await screen.tapRect(tennisRect(y), "tennis-court", { gap });
    const tapped = now();
    const page = await screen.waitFor(() => screen.is("tennis-page"), { timeoutMs });
    return page ? now() - tapped : null;
  }

  // Tap the region `name` and wait for `next` to show, tapping again while
  // `name` sits unmoved (tapUntil). Only for taps with no side effect beyond
  // moving on — never confirm or a cell (a second tap there would submit
  // twice or undo the choice).
  async function tapThrough(name, next, { timeoutMs }) {
    return tapUntil(name, {
      tap: () => screen.tapRegion(name),
      done: () => screen.is(next),
      still: () => screen.is(name, name === "next" ? { image: "enabled" } : {}),
      timeoutMs,
    });
  }

  // Tap, then wait for `done()`. If instead `still()` — the thing tapped,
  // unchanged where it was — holds for STILL_MS with nothing moving in
  // between, the tap did nothing (the page was still sliding in or gliding):
  // tap again at once. Once anything moved, only `done()` or the timeout ends
  // the wait. True when done.
  async function tapUntil(label, { tap, done, still, timeoutMs }) {
    const deadline = now() + timeoutMs;
    while (now() < deadline) {
      await tap();
      const tapped = now();
      let moved = false;
      const outcome = await screen.waitFor(async () => {
        if (await done()) return "done";
        if (!(await still())) moved = true;
        else if (!moved && now() - tapped >= STILL_MS) return "still";
        return null;
      }, { timeoutMs: Math.max(0, deadline - now()) });
      if (outcome === "done") return true;
      if (outcome !== "still") return false;
      log.debug("tap.again", { at: label, afterMs: now() - tapped });
    }
    return false;
  }

  // ---- the booking page --------------------------------------------------
  async function readDay(cell) {
    return dayState(await screen.capture(DAYS_AREA), cell);
  }

  async function readSlots() {
    const area = await screen.capture(SLOTS_AREA);
    const states = {};
    for (let hour = 8; hour <= 21; hour += 1) states[hour] = slotState(area, hour);
    return states;
  }

  // Book `task` on the tennis-court page. Returns { dayClosed: true } when the
  // day is not open yet (the caller decides whether to come back), and
  // { booked: true } once the success page shows; anything else fails.
  async function bookHere(task) {
    const today = dateOf(now());
    const cell = gridCellOf(task.date, today);
    if (!cell) screen.fail("date_off_grid", `${task.date} 不在今天（${today}）看到的两周里`);
    // The grid may still be loading: two equal reads in a row.
    const day = await screen.waitFor(() => readDay(cell), { timeoutMs: LOADING_MS, stable: 2 });
    if (!day) screen.fail("day_unreadable", `读不出 ${task.date} 那一格的状态`);
    log.debug("book.day", { date: task.date, row: cell.row, col: cell.col, state: day });
    if (day === "closed") return { dayClosed: true };
    if (day === "open") {
      // Choosing a day twice chooses it still: a tap that did nothing is made again.
      const chosen = await tapUntil(`day ${task.date}`, {
        tap: () => screen.tapRect(dayRect(cell), `day ${task.date}`),
        done: async () => (await readDay(cell)) === "selected",
        still: async () => (await readDay(cell)) === "open",
        timeoutMs: 4000,
      });
      if (!chosen) screen.fail("day_not_selected", `点了 ${task.date} 没有选中`);
    }
    const slots = await screen.waitFor(readSlots, { timeoutMs: LOADING_MS, stable: 2 });
    if (!slots) screen.fail("slots_unreadable", "时段区域一直在变化，读不稳");
    const taken = task.slots.filter((hour) => slots[hour] === "closed");
    log.info("book.slots", { date: task.date, want: slotsLabel(task.slots), states: task.slots.map((h) => `${h}:${slots[h]}`).join(" ") });
    if (taken.length) screen.fail("slot_unavailable", `${task.date} ${slotsLabel(task.slots)} 中 ${taken.map((h) => `${h}:00`).join("、")} 不可预定`);
    for (const hour of task.slots) {
      if (slots[hour] === "selected") continue; // tapping a chosen slot would unchoose it
      await screen.tapRect(slotRect(hour), `slot ${hour}`);
      const chosen = await screen.waitFor(async () => (await readSlots())[hour] === "selected" || null, { timeoutMs: 3000 });
      if (!chosen) screen.fail("slot_not_selected", `点了 ${hour}:00 没有选中（可能刚被别人订走）`);
    }
    if (!(await screen.waitForRegion("next", { image: "enabled", timeoutMs: 5000 }))) screen.fail("next_not_lit", "选好时段后 next 没有亮起");
    if (!(await tapThrough("next", "agree", { timeoutMs: 10_000 }))) screen.fail("agree_missing", "点 next 后没有出现同意条款");
    if (!(await tapThrough("agree", "confirm", { timeoutMs: 10_000 }))) screen.fail("confirm_missing", "同意条款后没有出现确认预定");
    await screen.tapRegion("confirm");
    if (!(await screen.waitForRegion("calendar", { timeoutMs: 20_000 }))) {
      screen.fail("success_missing", "点了确认预定后 20 秒内没有看到预定成功页；预定可能已成功，请到 active 页核对");
    }
    log.info("book.success", { date: task.date, slots: slotsLabel(task.slots) });
    return { booked: true };
  }

  // ---- cancelling ----------------------------------------------------------
  // Which booking a card on the active tab is, read from its date and time
  // lines beside its cancel button: { day, from, to } in 12-hour hours.
  async function cardOf(cancelY) {
    const date = await screen.digits({ x: 55, y: cancelY, width: 260, height: 36 });
    const time = await screen.digits({ x: 55, y: cancelY + 34, width: 320, height: 38 });
    return { day: Number(date[0]), from: Number(time[0]), to: Number(time[2]), read: `${date.join(" ")} | ${time.join(" ")}` };
  }

  async function cancelBooking(task) {
    await toFacility("active");
    const want = { day: Number(task.date.slice(8)), from: twelve(task.slots[0]), to: twelve(task.slots.at(-1) + 1) };
    // Wait for the list's cancel buttons: the list loads over the network
    // after the tab is tapped. None within the timeout is none.
    const started = now();
    let looks = 0;
    const cards = (await screen.waitFor(async () => {
      looks += 1;
      const found = await screen.scanY("cancel", LIST);
      return found.length ? found : null;
    }, { timeoutMs: ACTIVE_LIST_MS })) ?? [];
    log.debug("cancel.list", { found: cards.length, looks, ms: now() - started });
    let target = null;
    for (const { y } of cards) {
      const card = await cardOf(y);
      log.debug("cancel.card", { y, read: card.read });
      if (card.day === want.day && card.from === want.from && card.to === want.to) {
        target = y;
        break;
      }
    }
    if (target === null) screen.fail("cancel_not_found", `active 页里没找到 ${task.date} ${slotsLabel(task.slots)} 的可取消预订（${Math.round((now() - started) / 1000)} 秒内看了 ${looks} 次，找到 ${cards.length} 个 cancel）`);
    // The sheet covers the button as it slides up; a button still in place,
    // unmoved, means the tap did nothing and it is made again.
    const cancelRect = { ...screen.region("cancel").rect, y: target };
    const still = () => screen.is("cancel", { dy: target - screen.region("cancel").rect.y });
    if (!(await tapUntil("cancel", { tap: () => screen.tapRect(cancelRect, "cancel"), done: async () => !(await still()), still, timeoutMs: 6000 }))) {
      screen.fail("cancel_sheet_missing", "点了 cancel 没有弹出取消确认");
    }
    // The sheet slides up from the bottom; yes sits below its first screen.
    // Look, and swipe up at once when it is not there (as for the list). A
    // tap on a sheet still gliding only stops it, so yes is tapped once a
    // second look finds it in the same place; and tapped again while it sits
    // unmoved (a tap that worked closes the sheet).
    const deadline = now() + SHEET_MS;
    let swipes = 0;
    let last = null;
    while (now() < deadline) {
      const [yes] = await screen.scanY("cancel-yes", { top: 500, bottom: 1180 });
      if (yes && last !== null && Math.abs(yes.y - last) <= 2) {
        const rect = { ...screen.region("cancel-yes").rect, y: yes.y };
        const closed = await tapUntil("cancel-yes", {
          tap: () => screen.tapRect(rect, "cancel-yes"),
          done: async () => (await facilityTab()) === "active",
          still: () => screen.is("cancel-yes", { dy: yes.y - screen.region("cancel-yes").rect.y }),
          timeoutMs: Math.max(0, deadline - now()),
        });
        if (closed) {
          log.info("cancel.success", { date: task.date, slots: slotsLabel(task.slots) });
          return;
        }
        break;
      }
      last = yes ? yes.y : null;
      if (!yes && swipes < MAX_SHEET_SWIPES) {
        await screen.swipe(SHEET_SWIPE.from, SHEET_SWIPE.to, "cancel-sheet");
        swipes += 1;
      }
    }
    await goBack("sheet");
    screen.fail("cancel_unconfirmed", "取消确认面板里的 yes 点不下去，或一直没找到 yes");
  }

  return Object.freeze({ where, facilityTab, toFacility, showTennis, enterTennis, bookHere, cancelBooking, goBack, backShown });
}
