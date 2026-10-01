// The screen as the flows talk about it: "is it X", "wait for X", "tap X",
// "find X going down the list". One driver wraps the `dremu.device` surface
// and the templates built from screenshots/ (docs/ARCHITECTURE.md §目录, docs/ASSETS.md).
import { bgraToGray, ssim } from "./ssim.js";
import { TaskFailure, sleep, throwIfAborted } from "./timing.js";

export const MATCH = 0.8; // a template is on screen at or above this SSIM
export const STAY = 0.6; // …and is still there, once seen, at or above this (hysteresis)
// A template that carries its mean colour matches only within this distance
// of it (0..441): grey structure alone cannot tell next lit from unlit.
export const COLOUR = 12;
const TAP_MARGIN = 0.1; // a region tap lands in its inner 80%

// The point to tap in `rect` for two numbers in [0, 1): within the inner 80%.
export function pointInside(rect, rx, ry) {
  const axis = (start, length, r) => start + length * (TAP_MARGIN + (1 - 2 * TAP_MARGIN) * r);
  return { x: axis(rect.x, rect.width, rx), y: axis(rect.y, rect.height, ry) };
}

const yieldTurn = () => sleep(0);

function meanColour({ bgra, width, height }) {
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < width * height * 4; i += 4) {
    b += bgra[i]; g += bgra[i + 1]; r += bgra[i + 2];
  }
  const n = width * height;
  return { r: r / n, g: g / n, b: b / n };
}

export function createScreen({ device, assets, signal, log, random = Math.random, gapMs = 250, now = Date.now }) {
  let lastInputAt = -Infinity;

  function region(name) {
    const found = assets.regions[name];
    if (!found) throw new Error(`asset_missing: region "${name}"`);
    return found;
  }

  async function capture(rect) {
    throwIfAborted(signal);
    const image = await device.capturePage(rect);
    const { width, height } = image.getSize();
    if (width !== rect.width || height !== rect.height) {
      throw new Error(`capture_size_mismatch: captured ${width}x${height}, expected ${rect.width}x${rect.height}`);
    }
    return { bgra: image.toBitmap(), width, height, x: rect.x, y: rect.y };
  }

  // The best SSIM of the region's templates against the screen, at the
  // region's own rect moved by (dx, dy). { image, score }
  async function score(name, { dx = 0, dy = 0, images } = {}) {
    const { rect, images: all } = region(name);
    const at = { ...rect, x: rect.x + dx, y: rect.y + dy };
    const shot = await capture(at);
    const gray = bgraToGray(shot.bgra, shot.width, shot.height);
    let mean = null;
    let best = { image: null, score: -1 };
    for (const [image, template] of Object.entries(all)) {
      if (images && !images.includes(image)) continue;
      let s = ssim(gray, template.gray, template.width, template.height);
      if (template.mean) {
        mean ??= meanColour(shot);
        if (Math.hypot(mean.r - template.mean.r, mean.g - template.mean.g, mean.b - template.mean.b) > COLOUR) s = 0;
      }
      if (s > best.score) best = { image, score: s };
    }
    if (best.image === null) throw new Error(`asset_missing: region "${name}" has no template${images ? ` among ${images.join(", ")}` : ""}`);
    return best;
  }

  // One gate for every input: never two inside `gapMs`.
  async function gate(gap = gapMs) {
    throwIfAborted(signal);
    const wait = lastInputAt + gap - now();
    if (wait > 0) await sleep(wait, signal);
    lastInputAt = now();
  }

  const screen = {
    region,
    capture,
    score,

    // Whether the region shows one of its templates — or, with `image`, that
    // one: it must also look more like `image` than like the region's other
    // templates (a tab's "on" template still scores 0.81 on the tab off).
    async is(name, { image, threshold = MATCH, dx, dy } = {}) {
      const best = await score(name, { dx, dy });
      return best.score >= threshold && (!image || best.image === image);
    },

    // Wait until `check()` returns a truthy value `stable` times in a row
    // (the same value each time), polling every `intervalMs`. Returns the
    // value, or null when `timeoutMs` ran out.
    async waitFor(check, { timeoutMs, intervalMs = 150, stable = 1 }) {
      const deadline = now() + timeoutMs;
      let last = null;
      let streak = 0;
      for (;;) {
        throwIfAborted(signal);
        const value = await check();
        if (value && (streak === 0 || JSON.stringify(value) === JSON.stringify(last))) streak += 1;
        else streak = value ? 1 : 0;
        last = value;
        if (streak >= stable) return value;
        if (now() >= deadline) return null;
        await sleep(intervalMs, signal);
      }
    },

    // Wait for a region's template to appear; seen once, it counts as there
    // until it falls under STAY (dialogs animate: 1.000 then 0.79).
    // With `image`, it must look more like that than like the region's other templates.
    async waitForRegion(name, { timeoutMs, image, stable = 1 }) {
      let seen = false;
      return screen.waitFor(async () => {
        const best = await score(name);
        seen = best.score >= (seen ? STAY : MATCH) && (!image || best.image === image);
        return seen ? best.image : null;
      }, { timeoutMs, stable });
    },

    async tapAt(point, label, { gap } = {}) {
      await gate(gap);
      log.debug("tap", { at: label, x: Math.round(point.x), y: Math.round(point.y) });
      await device.tap(point);
    },

    // Tap a random point of the rect's inner 80%.
    tapRect(rect, label, options) {
      return screen.tapAt(pointInside(rect, random(), random()), label, options);
    },

    tapRegion(name, options) {
      return screen.tapRect(region(name).rect, name, options);
    },

    async swipe(from, to, label, duration = 350) {
      await gate();
      log.debug("swipe", { at: label, from: `${from.x},${from.y}`, to: `${to.x},${to.y}` });
      await device.swipe({ from, to, duration, easing: "ease" });
    },

    // Find the region's template going down a column: the region's own x and
    // width, any y in [top, bottom). Returns every place it is, top first:
    // [{ y, score }]. A coarse pass over a half-size picture (mean absolute
    // difference, cheap) proposes places; SSIM at full size around each
    // proposal decides. Yields between rows so a long scan never holds the
    // engine for one long turn.
    async scanY(name, { top, bottom, threshold = MATCH }) {
      const { rect, images } = region(name);
      const template = Object.values(images)[0];
      const area = { x: rect.x, y: top, width: rect.width, height: bottom - top };
      const shot = await capture(area);
      const gray = bgraToGray(shot.bgra, shot.width, shot.height);
      const half = (pixels, w, h) => {
        const hw = w >> 1, hh = h >> 1, out = new Float32Array(hw * hh);
        for (let y = 0; y < hh; y += 1) for (let x = 0; x < hw; x += 1) {
          const i = 2 * y * w + 2 * x;
          out[y * hw + x] = (pixels[i] + pixels[i + 1] + pixels[i + w] + pixels[i + w + 1]) / 4;
        }
        return { pixels: out, width: hw, height: hh };
      };
      const small = half(gray, area.width, area.height);
      const tsmall = half(template.gray, template.width, template.height);
      const proposals = [];
      for (let y = 0; y + tsmall.height <= small.height; y += 1) {
        let sum = 0;
        for (let j = 0; j < tsmall.height; j += 1) {
          for (let i = 0; i < tsmall.width; i += 1) sum += Math.abs(small.pixels[(y + j) * small.width + i] - tsmall.pixels[j * tsmall.width + i]);
        }
        proposals.push({ y: y * 2, mad: sum / (tsmall.width * tsmall.height) });
        if (y % 32 === 31) await yieldTurn();
      }
      // Local minima of the difference that are close enough to be worth a look.
      const found = [];
      const candidates = proposals.filter((p, i) => p.mad < 24 && (i === 0 || p.mad <= proposals[i - 1].mad) && (i === proposals.length - 1 || p.mad <= proposals[i + 1].mad));
      for (const { y } of candidates) {
        let best = { y: -1, score: -1 };
        for (let dy = -3; dy <= 3; dy += 1) {
          const yy = y + dy;
          if (yy < 0 || yy + template.height > area.height) continue;
          const window = gray.subarray(yy * area.width, (yy + template.height) * area.width);
          const s = ssim(window, template.gray, template.width, template.height);
          if (s > best.score) best = { y: top + yy, score: s };
        }
        if (best.score >= threshold && !found.some((f) => Math.abs(f.y - best.y) < template.height / 2)) found.push(best);
        await yieldTurn();
      }
      return found.sort((a, b) => a.y - b.y);
    },

    // The host's reading of the numbers in `rect` (an Apple Vision OCR; see
    // the Let's Go lessons on its known misreads). [] when nothing was read.
    async digits(rect) {
      throwIfAborted(signal);
      try {
        const result = await device.recognizeDigits(rect);
        return result.found ? result.digits.map((d) => d.text) : [];
      } catch (error) {
        if (/^(no_frame_available|recognition_busy|recognition_timeout)/.test(String(error?.message))) return [];
        throw error;
      }
    },

    fail(reason, message) {
      throw new TaskFailure(reason, message);
    },
  };
  return Object.freeze(screen);
}
