// A stand-in for `dremu.device` that shows the real screenshots in
// screenshots/ and moves between them the way iCondo does when a region is
// tapped or the list is swiped. Lets the flows run against real pixels
// without a device. screenshots/ is local (git-ignored): `hasScreenshots`
// tells a test whether it can run here.
import { existsSync, readFileSync } from "node:fs";
import { PNG } from "pngjs";

const DIR = new URL("../../screenshots/", import.meta.url);
export const hasScreenshots = existsSync(new URL("tennis-court.png", DIR));

const blank = () => ({ width: 720, height: 1280, data: Buffer.alloc(720 * 1280 * 4, 255) });

// "home": no full screenshot of it exists, so a white screen with the two
// regions that tell it apart pasted where they were captured.
function home() {
  const screen = blank();
  for (const name of ["home", "facility"]) {
    const { region } = JSON.parse(readFileSync(new URL(`${name}/capture.json`, DIR), "utf8"));
    const crop = PNG.sync.read(readFileSync(new URL(`${name}/capture.png`, DIR)));
    for (let y = 0; y < crop.height; y += 1) {
      crop.data.copy(screen.data, ((region.top_left.y + y) * 720 + region.top_left.x) * 4, y * crop.width * 4, (y + 1) * crop.width * 4);
    }
  }
  return screen;
}

// "active-loading": the active tab before its list has arrived — active.png
// with everything below the tab bar painted the page's grey.
function activeLoading() {
  const screen = PNG.sync.read(readFileSync(new URL("active.png", DIR)));
  for (let i = 300 * 720 * 4; i < 1180 * 720 * 4; i += 4) screen.data.fill(0xf1, i, i + 3);
  return screen;
}

// "tennis-court-next-stale": Friday just chosen (tennis-court-next.png above
// the slots) while the slots still show Thursday's (tennis-court.png below
// y 612) — the grid reloads after a day is chosen.
function staleSlots() {
  const top = PNG.sync.read(readFileSync(new URL("tennis-court-next.png", DIR)));
  const bottom = PNG.sync.read(readFileSync(new URL("tennis-court.png", DIR)));
  bottom.data.copy(top.data, 612 * 720 * 4, 612 * 720 * 4, 968 * 720 * 4);
  return top;
}

// "tennis-court-next-13": tennis-court-next.png with 13:00 chosen as well
// (its cell filled with the chosen teal).
function thirteenChosen() {
  const screen = PNG.sync.read(readFileSync(new URL("tennis-court-next.png", DIR)));
  for (let y = 710; y < 784; y += 1) {
    for (let x = 192; x < 348; x += 1) {
      const i = (y * 720 + x) * 4;
      screen.data[i] = 0x5b;
      screen.data[i + 1] = 0xc6;
      screen.data[i + 2] = 0xcc;
    }
  }
  return screen;
}

const cache = new Map();
function picture(name) {
  if (!cache.has(name)) {
    if (name === "blank") cache.set(name, blank());
    else if (name === "home") cache.set(name, home());
    else if (name === "active-loading") cache.set(name, activeLoading());
    else if (name === "tennis-court-next-stale") cache.set(name, staleSlots());
    else if (name === "tennis-court-next-13") cache.set(name, thirteenChosen());
    else cache.set(name, PNG.sync.read(readFileSync(new URL(`${name}.png`, DIR))));
  }
  return cache.get(name);
}

const inside = (p, r) => p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;

// `routes[screen]` is a list of { on: "tap" | "swipe", rect?, to, via? } —
// the first whose rect holds the tap (or any swipe) moves the screen to `to`.
// `via: { screen, ms }` shows `screen` for that long first: a page
// transition, as the device shows it mid-animation. `ignore: n` lets the
// first n matching taps do nothing (a page not yet taking input); `times: n`
// lets the route apply to the first n matching taps only, later ones fall
// through to the next route.
// `lagMs`: after every tap or swipe that changes the screen, the old screen
// stays this long before anything happens — the device's response time.
// With it, code that judges the screen right after acting fails its tests.
export function createFakeIcondo({ screen, routes, digits = () => [], lagMs = 0 }) {
  const state = { screen, taps: [], swipes: [], app: "com.icondo", timeline: [] };
  function image(rect) {
    const at = Date.now();
    const shown = state.timeline.find((frame) => at < frame.until)?.screen ?? state.screen;
    const png = picture(shown);
    const bgra = new Uint8Array(rect.width * rect.height * 4);
    for (let y = 0; y < rect.height; y += 1) {
      for (let x = 0; x < rect.width; x += 1) {
        const s = ((rect.y + y) * png.width + rect.x + x) * 4;
        const d = (y * rect.width + x) * 4;
        bgra[d] = png.data[s + 2];
        bgra[d + 1] = png.data[s + 1];
        bgra[d + 2] = png.data[s];
        bgra[d + 3] = 255;
      }
    }
    return { getSize: () => ({ width: rect.width, height: rect.height }), toBitmap: () => bgra };
  }
  function follow(kind, point) {
    const route = (routes[state.screen] ?? []).find((r) => r.on === kind && (!r.rect || inside(point, r.rect)) && r.times !== 0);
    if (!route) return;
    if (route.times > 0) route.times -= 1;
    if (route.ignore > 0) {
      route.ignore -= 1;
      return;
    }
    const at = Date.now();
    const shownNow = state.timeline.find((frame) => at < frame.until)?.screen ?? state.screen;
    state.timeline = [];
    if (lagMs > 0) state.timeline.push({ screen: shownNow, until: at + lagMs });
    if (route.via) state.timeline.push({ screen: route.via.screen, until: at + lagMs + route.via.ms });
    state.screen = route.to;
  }
  const device = {
    async capturePage(rect) {
      return image(rect);
    },
    async tap(point) {
      state.taps.push({ screen: state.screen, x: point.x, y: point.y });
      follow("tap", point);
    },
    async swipe({ from, to }) {
      state.swipes.push({ screen: state.screen, from, to });
      follow("swipe", from);
    },
    async currentApplication() {
      return { packageId: state.app };
    },
    async recognizeDigits(rect) {
      const texts = digits(state.screen, rect);
      return { found: texts.length > 0, digits: texts.map((text) => ({ text })) };
    },
  };
  return { device, state };
}
