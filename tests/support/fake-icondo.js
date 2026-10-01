// A stand-in for `dremu.device` that shows the real screenshots in
// screenshots/ and moves between them the way iCondo does when a region is
// tapped or the list is swiped. Lets the flows run against real pixels
// without a device. screenshots/ is local (git-ignored): `hasScreenshots`
// tells a test whether it can run here.
import { existsSync, readFileSync } from "node:fs";
import { PNG } from "pngjs";

const DIR = new URL("../../screenshots/", import.meta.url);
export const hasScreenshots = existsSync(new URL("tennis-court.png", DIR));

const cache = new Map();
function picture(name) {
  if (!cache.has(name)) {
    if (name === "blank") cache.set(name, { width: 720, height: 1280, data: Buffer.alloc(720 * 1280 * 4, 255) });
    else cache.set(name, PNG.sync.read(readFileSync(new URL(`${name}.png`, DIR))));
  }
  return cache.get(name);
}

const inside = (p, r) => p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;

// `routes[screen]` is a list of { on: "tap" | "swipe", rect?, to } — the first
// whose rect holds the tap (or any swipe) moves the screen to `to`.
export function createFakeIcondo({ screen, routes, digits = () => [] }) {
  const state = { screen, taps: [], swipes: [], app: "com.icondo" };
  function image(rect) {
    const png = picture(state.screen);
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
    const route = (routes[state.screen] ?? []).find((r) => r.on === kind && (!r.rect || inside(point, r.rect)));
    if (route) state.screen = route.to;
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
