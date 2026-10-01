// The tennis-court booking page's fixed layout (docs/ARCHITECTURE.md §预定页):
// the two-week day grid and the 14 time slots, and how each cell's state is
// read from its pixels — no text recognition. Measured on
// screenshots/tennis-court.png and tennis-court-next.png (720 × 1280).
import { FIRST_SLOT } from "./task.js";

const DAY_X = [13, 118, 223, 329, 434, 540, 645];
const DAY_Y = [318, 413];
const DAY_SIZE = { width: 61, height: 80 };
const SLOT_X = [10, 190, 370, 550];
const SLOT_Y = [620, 708, 796, 884];
const SLOT_SIZE = { width: 160, height: 78 };

// The whole area holding both grids, captured once per look.
export const DAYS_AREA = { x: 0, y: 310, width: 720, height: 190 };
export const SLOTS_AREA = { x: 0, y: 612, width: 720, height: 356 };

export const dayRect = ({ row, col }) => ({ x: DAY_X[col], y: DAY_Y[row], ...DAY_SIZE });

export function slotRect(hour) {
  const i = hour - FIRST_SLOT;
  return { x: SLOT_X[i % 4], y: SLOT_Y[Math.floor(i / 4)], ...SLOT_SIZE };
}

// A captured area: { bgra, width, height, x, y } (x, y: its place on screen).
function pixel(area, x, y) {
  const i = ((y - area.y) * area.width + (x - area.x)) * 4;
  return { r: area.bgra[i + 2], g: area.bgra[i + 1], b: area.bgra[i] };
}

const distance = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
const luma = ({ r, g, b }) => 0.299 * r + 0.587 * g + 0.114 * b;

// The day cell's background, read from a strip near its top edge, above the
// digits. Closed: light grey; open: a darker grey; selected: teal.
export const DAY_COLOURS = Object.freeze({
  closed: { r: 0xf2, g: 0xf2, b: 0xf2 },
  open: { r: 0xe0, g: 0xe0, b: 0xe0 },
  selected: { r: 0x84, g: 0xcf, b: 0xd4 },
});

function meanColour(area, rect) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const p = pixel(area, x, y);
      r += p.r; g += p.g; b += p.b; n += 1;
    }
  }
  return { r: r / n, g: g / n, b: b / n };
}

// "closed" | "open" | "selected" | null (none of the three within 24: not
// the booking page, or a cell mid-animation).
export function dayState(area, cell) {
  const rect = dayRect(cell);
  const colour = meanColour(area, { x: rect.x + 15, y: rect.y + 5, width: rect.width - 30, height: 6 });
  let best = null;
  for (const [state, reference] of Object.entries(DAY_COLOURS)) {
    const d = distance(colour, reference);
    if (d < 24 && (!best || d < best.d)) best = { state, d };
  }
  return best?.state ?? null;
}

const SLOT_FILL = { r: 0x5b, g: 0xc6, b: 0xcc };

// "selected" (teal fill) | "open" (black text) | "closed" (light grey text).
// The fill is read just inside the left border; the text by the darkest
// pixel inside the cell.
export function slotState(area, hour) {
  const rect = slotRect(hour);
  const fill = meanColour(area, { x: rect.x + 6, y: rect.y + 30, width: 4, height: 18 });
  if (distance(fill, SLOT_FILL) < 30) return "selected";
  let darkest = 255;
  for (let y = rect.y + 6; y < rect.y + rect.height - 6; y += 2) {
    for (let x = rect.x + 6; x < rect.x + rect.width - 6; x += 2) darkest = Math.min(darkest, luma(pixel(area, x, y)));
  }
  return darkest < 120 ? "open" : "closed";
}
