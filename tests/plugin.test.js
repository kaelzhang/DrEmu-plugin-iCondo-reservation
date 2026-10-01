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

const two = (n) => String(n).padStart(2, "0");
const dateIn = (days) => {
  const t = new Date(devkit.clock.now());
  t.setDate(t.getDate() + days);
  return `${t.getFullYear()}-${two(t.getMonth() + 1)}-${two(t.getDate())}`;
};

test("the first read carries the version, today, the draft, the job and the log", async (t) => {
  await running(t);
  const reply = await devkit.panel.send("icondo.state.read", {});
  assert.equal(reply.outcome, "accepted", JSON.stringify(reply));
  assert.match(reply.payload.version, /^0\.2\.0\+[0-9a-f]{7,}(-dirty)?$/);
  assert.equal(reply.payload.today, dateIn(0));
  assert.deepEqual(reply.payload.draft, { week: "this", weekday: 0, slots: [] });
  assert.equal(reply.payload.job, null);
  assert.match(reply.payload.log.lines.at(-1).text, /^plugin\.start /);
});

test("the draft is kept in storage and read back after a restart", async (t) => {
  await running(t);
  const draft = { week: "next", weekday: 3, slots: [19, 20] };
  const set = await devkit.panel.send("icondo.draft.set", { draft });
  assert.equal(set.outcome, "accepted", JSON.stringify(set));
  assert.deepEqual(devkit.storage.read().draft, draft);
  await devkit.plugin.restart();
  devkit.panel.open();
  assert.deepEqual((await devkit.panel.send("icondo.state.read", {})).payload.draft, draft);
});

test("a task is refused before anything is tapped when it cannot be done", async (t) => {
  await running(t);
  const cases = [
    [{ date: dateIn(-1), slots: [14] }, "date_passed"],
    [{ date: dateIn(3), slots: [14, 16] }, "bad_task"],
  ];
  for (const [task, reason] of cases) {
    const reply = await devkit.panel.send("icondo.book", task);
    assert.equal(reply.outcome, "refused", JSON.stringify(reply));
    assert.equal(reply.reason, reason);
  }
  devkit.device.setApplication("com.android.launcher");
  const away = await devkit.panel.send("icondo.book", { date: dateIn(3), slots: [14] });
  assert.equal(away.reason, "icondo_not_in_front");
  assert.equal(devkit.observed.touches().length, 0);
});

test("a book job on a screen that is not iCondo's ends failed, publishes its end and taps nothing", async (t) => {
  await running(t);
  devkit.panel.subscribe("icondo.job");
  const reply = await devkit.panel.send("icondo.book", { date: dateIn(1), slots: [14] });
  assert.equal(reply.outcome, "accepted", JSON.stringify(reply));
  assert.equal(reply.payload.phase, "starting");
  await devkit.clock.settle();
  const jobs = devkit.observed.publications().filter((p) => p.topic === "icondo.job").map((p) => p.payload);
  const end = jobs.at(-1);
  assert.equal(end.phase, "failed", JSON.stringify(jobs));
  assert.ok(end.reason && end.message, JSON.stringify(end));
  assert.equal(devkit.observed.touches().length, 0, "nothing tapped on a screen it does not know");
  assert.equal(devkit.storage.read().job.phase, "failed");
});
