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

const JOB = Object.freeze({ kind: "book", date: "2026-10-08", slots: [19], phase: "waiting", openAt: Date.now() + 3_600_000, latencyMs: null, reason: null, message: null });

function standInBridge() {
  let subscriber = null;
  const sent = [];
  const line = (seq, text) => Object.freeze({ seq, at: "10:00:00", level: "info", text });
  return {
    line,
    sent,
    publish: (topic, payload) => subscriber({ kind: "event", topic, payload }),
    subscribe(fn) {
      subscriber = fn;
      return () => {};
    },
    async request(intent, payload) {
      sent.push([intent, payload]);
      if (intent === INTENTS.read) {
        return { outcome: "accepted", payload: { version: "0.2.0+abc1234", today: "2026-10-01", draft: { week: "this", weekday: 4, slots: [] }, job: JOB, log: { lines: [line(1, "plugin.start")], keep: 3 } } };
      }
      return { outcome: "accepted", payload: {} };
    },
  };
}

// Unmounted after the test whatever its outcome, so no timer outlives it.
async function mounted(t) {
  const bridge = standInBridge();
  const updates = new Map();
  const store = createPanelStore(bridge);
  const app = createApp(PanelApp).provide(PANEL, store);
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
  t.after(() => {
    app.unmount();
    store.dispose();
  });
  return { bridge, updates, root: document.querySelector("#app") };
}

test("a new log line updates the log view alone and adds one row", async (t) => {
  const { bridge, updates, root } = await mounted(t);
  const first = root.querySelector(".log-line");
  bridge.publish(TOPICS.log, { append: bridge.line(2, "job.waiting"), keep: 3 });
  await nextTick();
  assert.deepEqual([...updates.keys()], ["LogView"]);
  const rows = root.querySelectorAll(".log-line");
  assert.equal(rows.length, 2);
  assert.equal(rows[0], first, "the drawn row is kept, not redrawn");
});

test("the log keeps the last `keep` lines", async (t) => {
  const { bridge, root } = await mounted(t);
  for (let seq = 2; seq <= 5; seq += 1) bridge.publish(TOPICS.log, { append: bridge.line(seq, `line ${seq}`), keep: 3 });
  await nextTick();
  assert.deepEqual([...root.querySelectorAll(".log-line")].map((row) => row.textContent), ["10:00:00 line 3", "10:00:00 line 4", "10:00:00 line 5"]);
});

test("a job change updates the job card alone", async (t) => {
  const { bridge, updates, root } = await mounted(t);
  bridge.publish(TOPICS.job, { ...JOB, phase: "failed", reason: "slot_unavailable", message: "19:00 不可预定", finishedAt: Date.now() });
  await nextTick();
  // The form's buttons depend on the job too, but with no slot chosen they
  // stay disabled either way, so the form has nothing to re-render.
  assert.deepEqual([...updates.keys()], ["JobCard"]);
  assert.match(root.querySelector(".job").textContent, /失败/);
  assert.match(root.querySelector(".job").textContent, /19:00 不可预定（slot_unavailable）/);
});

test("choosing a slot disables the slots that are not next to it, and only the form re-renders", async (t) => {
  const { updates, root } = await mounted(t);
  const slot = (hour) => [...root.querySelectorAll(".slot")].find((b) => b.textContent.trim() === `${String(hour).padStart(2, "0")}:00`);
  slot(14).click();
  await nextTick();
  assert.deepEqual([...updates.keys()], ["TaskForm"]);
  assert.equal(slot(14).getAttribute("aria-pressed"), "true");
  assert.deepEqual([13, 15, 16, 8].map((h) => slot(h).disabled), [false, false, true, true]);
  slot(15).click();
  await nextTick();
  assert.deepEqual([13, 16].map((h) => slot(h).disabled), [true, true]);
});
