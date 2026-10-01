// Time as the flows see it: abortable sleeps and the errors they reason about.
export class AbortError extends Error {
  constructor(message = "aborted") {
    super(message);
    this.name = "AbortError";
  }
}

// A booking or cancellation that cannot go on: `reason` is a stable token,
// the message says why for a person (the panel shows both).
export class TaskFailure extends Error {
  constructor(reason, message) {
    super(message);
    this.name = "TaskFailure";
    this.reason = reason;
  }
}

export const isAbort = (error) => error?.name === "AbortError";
export const isFailure = (error) => error?.name === "TaskFailure";

export function throwIfAborted(signal) {
  if (signal?.aborted) throw new AbortError();
}

// Resolve after `ms`; reject with AbortError the moment `signal` aborts.
export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortError());
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, Math.max(0, ms));
    function onAbort() {
      clearTimeout(timer);
      reject(new AbortError());
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
