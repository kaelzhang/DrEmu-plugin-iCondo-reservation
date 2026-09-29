// The one path a document has to the control script: the host's
// `globalThis.dremuPanel` message bridge. A request is answered by exactly one
// reply; a reply that is not `accepted` is returned as a value, never thrown.
// An event frame the host relays (`kind: "event"`) goes to every subscriber.
export function createRequestBridge(host, surface, topics) {
  if (!host || typeof host.send !== "function" || typeof host.receive !== "function") {
    throw new TypeError("The document message host (dremuPanel) is unavailable.");
  }
  const pending = new Map();
  const subscribers = new Set();
  let sequence = 0;
  host.receive((message) => {
    if (message?.kind === "event") {
      for (const subscriber of subscribers) subscriber(message);
      return;
    }
    const id = message?.id ?? message?.request_id;
    const waiter = pending.get(id);
    if (!waiter) return;
    pending.delete(id);
    waiter(message);
  });
  // Subscribe before the first request, so nothing published in between is missed.
  host.send(`icondo-${surface}-subscribe`, "$subscribe", { topics });
  return Object.freeze({
    request(intent, payload = {}) {
      sequence += 1;
      const id = `icondo-${surface}-${sequence}`;
      return new Promise((resolve) => {
        pending.set(id, resolve);
        try {
          host.send(id, intent, payload);
        } catch (failure) {
          pending.delete(id);
          resolve({
            outcome: "failed",
            reason: "bridge_send_failed",
            message: failure instanceof Error ? failure.message : String(failure),
            state_changed: false,
          });
        }
      });
    },
    subscribe(subscriber) {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
  });
}
