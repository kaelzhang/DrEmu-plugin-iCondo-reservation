// Turn `screenshots/` into `<package>/assets.js`, an ES module the control
// script imports (docs/ARCHITECTURE.md §素材). The control script cannot
// decode PNG (no DOM, no npm), so decoding happens here, at build time.
//
// What is read is decided by `plugin/asset-list.json`; nothing else in
// screenshots/ is read, and anything listed but missing fails the build, all
// missing items at once.
//
//   regions: screenshots/<name>/capture.json (a DrEmu `region_screenshot`) gives
//            the rect; for use "match", screenshots/<name>/<image>.png are the
//            templates; use "rect" keeps the rect only (tapped, never matched).
//   crops:   a template cut from a full screenshot at a rect measured on it
//            (`from`, `rect`), for an element nobody captured on its own.
//
// Output: { frame: { width, height },
//           regions: { <name>: { rect, images: { <image>: { width, height, gray, mean? } } } } }
// `gray` is 8-bit Rec. 601 luma, row-major — what core/ssim.js compares.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const SCREENSHOTS = fileURLToPath(new URL("../screenshots/", import.meta.url));
const OUT_DIR = process.argv[2] ?? fileURLToPath(new URL("../dist", import.meta.url));

// The template's mean colour, for regions listed with "colour": true (two
// states that look alike in grey, e.g. next lit and unlit).
function meanOf(png, rect = { x: 0, y: 0, width: png.width, height: png.height }) {
  let r = 0, g = 0, b = 0;
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const p = (y * png.width + x) * 4;
      r += png.data[p]; g += png.data[p + 1]; b += png.data[p + 2];
    }
  }
  const n = rect.width * rect.height;
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

function grayOf(png, rect = { x: 0, y: 0, width: png.width, height: png.height }) {
  const gray = new Array(rect.width * rect.height);
  for (let y = 0, i = 0; y < rect.height; y += 1) {
    for (let x = 0; x < rect.width; x += 1, i += 1) {
      const p = ((rect.y + y) * png.width + rect.x + x) * 4;
      gray[i] = Math.round(0.299 * png.data[p] + 0.587 * png.data[p + 1] + 0.114 * png.data[p + 2]);
    }
  }
  return gray;
}

const readPng = (file) => {
  if (!existsSync(file)) throw new Error(`missing ${file}`);
  return PNG.sync.read(readFileSync(file));
};

function readRegion(name, { use, images = [], colour = false }) {
  const directory = join(SCREENSHOTS, name);
  const capture = JSON.parse(readFileSync(join(directory, "capture.json"), "utf8"));
  if (capture.kind !== "region_screenshot") throw new Error(`${name}/capture.json is not a region_screenshot`);
  const { top_left: tl, width_px: width, height_px: height } = capture.region;
  const rect = { x: tl.x, y: tl.y, width, height };
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isInteger)) throw new Error(`${name}: the region is not whole pixels`);
  const read = {};
  for (const image of use === "match" ? images : []) {
    const png = readPng(join(directory, `${image}.png`));
    if (png.width !== width || png.height !== height) throw new Error(`${name}/${image}.png is ${png.width}x${png.height}, the region is ${width}x${height}`);
    read[image] = { width, height, gray: grayOf(png), ...(colour ? { mean: meanOf(png) } : {}) };
  }
  return { region: { rect, images: read }, frame: `${capture.source.width_px}x${capture.source.height_px}` };
}

function readCrop(name, { from, rect }) {
  const png = readPng(join(SCREENSHOTS, from));
  if (rect.x + rect.width > png.width || rect.y + rect.height > png.height) throw new Error(`crop ${name} falls outside ${from}`);
  return { region: { rect, images: { capture: { width: rect.width, height: rect.height, gray: grayOf(png, rect) } } }, frame: `${png.width}x${png.height}` };
}

const LIST = JSON.parse(readFileSync(fileURLToPath(new URL("../plugin/asset-list.json", import.meta.url)), "utf8"));
const assets = { frame: null, regions: {} };
const frames = new Set();
const problems = [];
for (const [kind, read] of [["regions", readRegion], ["crops", readCrop]]) {
  for (const [name, entry] of Object.entries(LIST[kind] ?? {})) {
    try {
      const { region, frame } = read(name, entry);
      assets.regions[name] = region;
      frames.add(frame);
    } catch (error) {
      problems.push(`${kind} ${name}: ${error.message}`);
    }
  }
}
if (problems.length) throw new Error(`screenshots/ does not have what plugin/asset-list.json lists:\n  ${problems.join("\n  ")}`);
if (frames.size !== 1) throw new Error(`screenshots were taken on different frames: ${[...frames].join(", ")}`);
const [width, height] = [...frames][0].split("x").map(Number);
assets.frame = { width, height };

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "assets.js"), `// Generated by tools/build-assets.mjs from screenshots/ — do not edit.\nexport default ${JSON.stringify(assets)};\n`);
console.log(`assets.js: ${Object.keys(assets.regions).length} regions, frame ${width}x${height}`);
