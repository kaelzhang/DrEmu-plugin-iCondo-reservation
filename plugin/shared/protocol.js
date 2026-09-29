// The names the control script and its documents share. Each topic carries one
// slice of the plugin's state, so a publication re-renders only the component
// that reads that slice (docs/ARCHITECTURE.md §Panel protocol).
export const TOPICS = Object.freeze({
  status: "icondo.status", // { running, stoppedBecause }
  log: "icondo.log", // { append: line, keep } | { lines: [], keep }
});

export const INTENTS = Object.freeze({
  read: "icondo.state.read",
  start: "icondo.start",
  stop: "icondo.stop",
  settingsSet: "icondo.settings.set",
  logClear: "icondo.log.clear",
});
