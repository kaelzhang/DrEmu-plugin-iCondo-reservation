// The control script as DrEmu runs it: the built package in dist/, admitted
// and driven through the panel channel by the devkit (no device).
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

beforeEach(async () => devkit.reset());

async function running(t) {
  await devkit.plugin.enable();
  t.after(() => {
    if (devkit.plugin.state().running) devkit.plugin.stop();
  });
  devkit.panel.open();
}

test("the first read carries status, settings and the log", async (t) => {
  await running(t);
  const reply = await devkit.panel.send("icondo.state.read", {});
  assert.equal(reply.outcome, "accepted", JSON.stringify(reply));
  assert.deepEqual(reply.payload.status, { running: false, stoppedBecause: null });
  assert.deepEqual(reply.payload.settings, { facility: "", slots: [] });
  assert.match(reply.payload.log.lines.at(-1).text, /^plugin\.start /);
});

test("settings are validated, kept in storage and read back after a restart", async (t) => {
  await running(t);
  const bad = await devkit.panel.send("icondo.settings.set", { settings: { facility: "Tennis", slots: ["25:00"] } });
  assert.equal(bad.outcome, "invalid-payload", JSON.stringify(bad)); // the host's wire spelling of `invalid_payload`
  assert.equal(bad.reason, "bad_settings");

  const settings = { facility: "Tennis Court 1", slots: ["19:00", "20:00"] };
  const good = await devkit.panel.send("icondo.settings.set", { settings });
  assert.equal(good.outcome, "accepted", JSON.stringify(good));
  assert.deepEqual(devkit.storage.read().settings, settings);

  await devkit.plugin.restart();
  devkit.panel.open();
  const read = await devkit.panel.send("icondo.state.read", {});
  assert.deepEqual(read.payload.settings, settings);
});

test("a log line is published alone, never with the whole state", async (t) => {
  await running(t);
  devkit.panel.subscribe("icondo.log");
  const before = devkit.observed.publications().length;
  await devkit.panel.send("icondo.settings.set", { settings: { facility: "Squash", slots: [] } });
  await devkit.clock.settle();
  const published = devkit.observed.publications().slice(before);
  assert.equal(published.length, 1, JSON.stringify(published));
  assert.equal(published[0].topic, "icondo.log");
  assert.deepEqual(Object.keys(published[0].payload).sort(), ["append", "keep"]);
  assert.match(published[0].payload.append.text, /^settings\.change facility=Squash/);
});

test("a run starts, reports that the flow is undefined and stops by itself", async (t) => {
  await running(t);
  const started = await devkit.panel.send("icondo.start", {});
  assert.equal(started.outcome, "accepted", JSON.stringify(started));
  await devkit.clock.settle();
  const read = await devkit.panel.send("icondo.state.read", {});
  assert.deepEqual(read.payload.status, { running: false, stoppedBecause: "flow_undefined" });
  const stop = await devkit.panel.send("icondo.stop", {});
  assert.equal(stop.outcome, "refused");
  assert.equal(stop.reason, "not_running");
});
