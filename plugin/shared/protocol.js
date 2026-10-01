// The names the control script and its documents share. Each topic carries one
// slice of the plugin's state, so a publication re-renders only the component
// that reads that slice (docs/ARCHITECTURE.md §面板协议).
export const TOPICS = Object.freeze({
  job: "icondo.job", // the current job, or null
  log: "icondo.log", // { append: line, keep } | { lines: [], keep }
});

export const INTENTS = Object.freeze({
  read: "icondo.state.read",
  draftSet: "icondo.draft.set",
  book: "icondo.book",
  test: "icondo.test",
  stop: "icondo.job.stop",
  logClear: "icondo.log.clear",
});

// A job's phases. The first six are a job in progress, the rest its end.
export const ACTIVE_PHASES = Object.freeze(["starting", "waiting", "arming", "grabbing", "booking", "cancelling"]);
export const isActive = (job) => Boolean(job) && ACTIVE_PHASES.includes(job.phase);
