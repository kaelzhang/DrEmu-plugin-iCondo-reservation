// The person's reservation settings: which facility to book and the time
// slots wanted, in order of preference. Shared by the control script (which
// keeps them in dremu.storage) and the panel (whose form edits them).
export const MAX_FACILITY_LENGTH = 64;
export const MAX_SLOTS = 12;
const SLOT = /^([01]\d|2[0-3]):[0-5]\d$/;

export function normalizeSettings(from = {}) {
  const source = from && typeof from === "object" ? from : {};
  return {
    facility: typeof source.facility === "string" ? source.facility.trim().slice(0, MAX_FACILITY_LENGTH) : "",
    slots: Array.isArray(source.slots) ? [...new Set(source.slots.filter((slot) => typeof slot === "string" && SLOT.test(slot)))].slice(0, MAX_SLOTS) : [],
  };
}

// `{ value }` for settings the plugin keeps as given, `{ error }` otherwise.
export function checkSettings(settings) {
  if (!settings || typeof settings !== "object") return { error: "settings must be an object" };
  if (typeof settings.facility !== "string" || settings.facility.trim().length > MAX_FACILITY_LENGTH) {
    return { error: `facility must be a string of at most ${MAX_FACILITY_LENGTH} characters` };
  }
  if (!Array.isArray(settings.slots) || settings.slots.length > MAX_SLOTS) {
    return { error: `slots must be a list of at most ${MAX_SLOTS} times` };
  }
  const bad = settings.slots.find((slot) => typeof slot !== "string" || !SLOT.test(slot));
  if (bad !== undefined) return { error: `slot ${JSON.stringify(bad)} is not a 24-hour HH:MM time` };
  if (new Set(settings.slots).size !== settings.slots.length) return { error: "slots must not repeat" };
  return { value: normalizeSettings(settings) };
}
