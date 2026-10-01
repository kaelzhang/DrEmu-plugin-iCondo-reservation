// A reservation task: one date and one slot, or two adjacent slots, of the
// tennis court (docs/REQUIREMENTS.md §面板). Shared by the panel (whose form
// enforces the rules as the person clicks) and the control script (which
// checks what it is sent).
import { WEEKDAYS, dateOf, windowOf } from "./calendar.js";

// A slot is named by its starting hour: 8 is 08:00–09:00 … 21 is 21:00–22:00.
export const FIRST_SLOT = 8;
export const LAST_SLOT = 21;
export const SLOTS = Object.freeze(Array.from({ length: LAST_SLOT - FIRST_SLOT + 1 }, (_, i) => FIRST_SLOT + i));

export const slotLabel = (hour) => `${String(hour).padStart(2, "0")}:00`;
export const slotsLabel = (slots) => (slots.length ? `${slotLabel(slots[0])}–${slotLabel(slots.at(-1) + 1)}` : "—");

// Whether `hour` may be clicked given the chosen `slots`: anything while
// none is chosen; a chosen one (to unchoose it); with one chosen, its two
// neighbours; with two chosen, nothing else.
export function slotSelectable(slots, hour) {
  if (slots.includes(hour)) return true;
  if (slots.length === 0) return true;
  if (slots.length >= 2) return false;
  return Math.abs(slots[0] - hour) === 1;
}

export function toggleSlot(slots, hour) {
  if (slots.includes(hour)) return slots.filter((h) => h !== hour);
  if (!slotSelectable(slots, hour)) return slots;
  return [...slots, hour].sort((a, b) => a - b);
}

// The form the panel keeps: which week, which weekday, which slots.
export function normalizeDraft(from = {}) {
  const source = from && typeof from === "object" ? from : {};
  const slots = Array.isArray(source.slots) ? source.slots.filter((h) => SLOTS.includes(h)).sort((a, b) => a - b) : [];
  const valid = slots.length <= 2 && (slots.length < 2 || slots[1] - slots[0] === 1);
  return {
    week: source.week === "next" ? "next" : "this",
    weekday: Number.isInteger(source.weekday) && source.weekday >= 0 && source.weekday < WEEKDAYS.length ? source.weekday : 0,
    slots: valid ? slots : [],
  };
}

// `{ value }` for a task the plugin accepts at `now`, `{ reason, message }` otherwise.
export function checkTask(task, now) {
  if (!task || typeof task !== "object") return { reason: "bad_task", message: "任务必须是对象" };
  const { date, slots } = task;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || dateOf(Date.parse(`${date}T12:00:00`)) !== date) {
    return { reason: "bad_task", message: `日期 ${JSON.stringify(date)} 不是 YYYY-MM-DD` };
  }
  if (!Array.isArray(slots) || slots.length < 1 || slots.length > 2 || !slots.every((h) => SLOTS.includes(h))) {
    return { reason: "bad_task", message: "时段必须是 1 或 2 个 8–21 点的整点" };
  }
  const sorted = [...slots].sort((a, b) => a - b);
  if (sorted.length === 2 && sorted[1] - sorted[0] !== 1) return { reason: "bad_task", message: "两个时段必须相邻" };
  if (windowOf(date, now) === "past") return { reason: "date_passed", message: `${date} 已经过去` };
  return { value: { date, slots: sorted } };
}
