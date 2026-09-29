// The panel re-renders only the component whose slice changed (R2: no
// whole-panel refresh). Mounts the real components in jsdom over a stand-in
// bridge and counts each component's updates.
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><main id=app></main>", { pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document });
for (const name of ["Node", "Element", "HTMLElement", "SVGElement", "Event", "CustomEvent"]) globalThis[name] = dom.window[name];

const { createApp, nextTick } = await import("vue");
const { default: PanelApp } = await import("../plugin/panel/src/PanelApp.vue");
const { PANEL, createPanelStore } = await import("../plugin/panel/src/store.js");
const { INTENTS, TOPICS } = await import("../plugin/shared/protocol.js");

function standInBridge() {
  let subscriber = null;
  const line = (seq, text) => Object.freeze({ seq, at: "10:00:00", level: "info", text });
  return {
    line,
    publish: (topic, payload) => subscriber({ kind: "event", topic, payload }),
    subscribe(fn) {
      subscriber = fn;
      return () => {};
    },
    async request(intent) {
      if (intent === INTENTS.read) {
        return {
          outcome: "accepted",
          payload: { version: "0.1.0", status: { running: false, stoppedBecause: null }, settings: { facility: "", slots: [] }, log: { lines: [line(1, "plugin.start")], keep: 3 } },
        };
      }
      return { outcome: "accepted", payload: {} };
    },
  };
}

async function mounted() {
  const bridge = standInBridge();
  const updates = new Map();
  const app = createApp(PanelApp).provide(PANEL, createPanelStore(bridge));
  app.mixin({
    updated() {
      const name = this.$.type.__name;
      updates.set(name, (updates.get(name) ?? 0) + 1);
    },
  });
  const ready = new Promise((resolve) => window.addEventListener("dremu-panel-ready", resolve, { once: true }));
  app.mount(document.querySelector("#app"));
  await ready;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
  updates.clear();
  return { app, bridge, updates, root: document.querySelector("#app") };
}

test("a new log line updates the log view alone and adds one row", async () => {
  const { app, bridge, updates, root } = await mounted();
  const first = root.querySelector(".log-line");
  bridge.publish(TOPICS.log, { append: bridge.line(2, "settings.change"), keep: 3 });
  await nextTick();
  assert.deepEqual([...updates.keys()], ["LogView"]);
  const rows = root.querySelectorAll(".log-line");
  assert.equal(rows.length, 2);
  assert.equal(rows[0], first, "the drawn row is kept, not redrawn");
  app.unmount();
});

test("the log keeps the last `keep` lines", async () => {
  const { app, bridge, root } = await mounted();
  for (let seq = 2; seq <= 5; seq += 1) bridge.publish(TOPICS.log, { append: bridge.line(seq, `line ${seq}`), keep: 3 });
  await nextTick();
  assert.deepEqual([...root.querySelectorAll(".log-line")].map((row) => row.textContent), ["10:00:00 line 3", "10:00:00 line 4", "10:00:00 line 5"]);
  app.unmount();
});

test("a status change updates the run control alone", async () => {
  const { app, bridge, updates, root } = await mounted();
  bridge.publish(TOPICS.status, { running: true, stoppedBecause: null });
  await nextTick();
  assert.deepEqual([...updates.keys()], ["RunControl"]);
  assert.equal(root.querySelector(".toggle").textContent.trim(), "停止");
  app.unmount();
});
