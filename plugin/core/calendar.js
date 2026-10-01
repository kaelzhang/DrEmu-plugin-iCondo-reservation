// Dates as the booking rules talk about them (docs/REQUIREMENTS.md §预订规则).
// A date is a local "YYYY-MM-DD" string; the local clock is the Mac's, which
// is the condo's time zone. Weeks run Monday to Sunday, as on the app's grid.
const DAY = 86_400_000;
const two = (n) => String(n).padStart(2, "0");

export const WEEKDAYS = Object.freeze(["周一", "周二", "周三", "周四", "周五", "周六", "周日"]);
// The furthest bookable day is today + BOOKING_DAYS - 1 (Thursday → next Wednesday).
export const BOOKING_DAYS = 7;

export function dateOf(at) {
  const t = new Date(at);
  return `${t.getFullYear()}-${two(t.getMonth() + 1)}-${two(t.getDate())}`;
}

// Local midnight at the start of `date`.
export function midnightOf(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function addDays(date, days) {
  const [y, m, d] = date.split("-").map(Number);
  return dateOf(new Date(y, m - 1, d + days).getTime());
}

// Whole days from `a` to `b` (DST-safe: both are local midnights, rounded).
export const daysBetween = (a, b) => Math.round((midnightOf(b) - midnightOf(a)) / DAY);

// 0 = Monday … 6 = Sunday.
export function weekdayOf(date) {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

export const mondayOf = (date) => addDays(date, -weekdayOf(date));

// The date the panel's choice names, seen from `today`: this or next week's weekday.
export const targetDate = (today, week, weekday) => addDays(mondayOf(today), (week === "next" ? 7 : 0) + weekday);

// When `date` becomes bookable: 00:00 of the day BOOKING_DAYS - 1 before it.
export const opensAt = (date) => midnightOf(addDays(date, -(BOOKING_DAYS - 1)));

// "past" (before today), "open" (bookable now) or "later" (opens at opensAt).
export function windowOf(date, now) {
  const today = dateOf(now);
  if (daysBetween(today, date) < 0) return "past";
  return now >= opensAt(date) ? "open" : "later";
}

// Where `date` sits on the app's two-week grid on `today`: row 0 is this
// week, row 1 next week, column 0 Monday. Null when it is on neither row.
export function gridCellOf(date, today) {
  const row = daysBetween(mondayOf(today), mondayOf(date)) / 7;
  return row === 0 || row === 1 ? { row, col: weekdayOf(date) } : null;
}

// The panel's choices on `today`: which weekdays of each week can be chosen.
export function weekChoices(today) {
  const todayCol = weekdayOf(today);
  return {
    this: WEEKDAYS.map((label, weekday) => ({ weekday, label, disabled: weekday < todayCol })),
    next: WEEKDAYS.map((label, weekday) => ({ weekday, label, disabled: false })),
  };
}
