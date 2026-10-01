// The iCondo Reservation control script (docs/ARCHITECTURE.md).
//
// Runs in DrEmu's sandboxed engine: no DOM, no network, only `dremu`. The
// panel asks for one job at a time — book a tennis-court slot, or test the
// whole path by booking and then cancelling — and hears the job and the log
// on separate topics. `assets.js` and `version.js` are generated into dist/
// by the build (tools/build-assets.mjs, tools/build-dist.mjs).
import assets from "./assets.js";
import VERSION from "./version.js";
import { dateOf } from "./core/calendar.js";
import { createFlow } from "./core/flow.js";
import { ICONDO_PACKAGE } from "./core/icondo.js";
import { createJob } from "./core/job.js";
import { createLogger } from "./core/logger.js";
import { createScreen } from "./core/screen.js";
import { checkTask, normalizeDraft, slotsLabel } from "./core/task.js";
import { isAbort, isFailure } from "./core/timing.js";
import { INTENTS, TOPICS, isActive } from "./shared/protocol.js";

const DRAFT_KEY = "draft";
const JOB_KEY = "job";
// Phases a restarted plugin may resume: nothing has been tapped toward a booking yet.
const RESUMABLE = ["starting", "waiting", "arming"];

const plugin = {
  deviceId: null,
  signal: null,
  draft: normalizeDraft(),
  job: null, // the current or last job, persisted under JOB_KEY
  run: null, // { controller, promise } while a job runs
  logger: null,
  booking: null, // the `booking` log channel: one record per job event
};

// The plugin's own log, for `dremuctl plugin-log`, on a runtime that has one.
function echo(line) {
  const log = globalThis.dremu?.log;
  if (log && typeof log[line.level] === "function") log[line.level](line.text);
}

function bookingChannel() {
  try {
    const channel = dremu.log?.channel?.("booking");
    if (channel) return channel;
  } catch {
    // A runtime without the channel: the panel log still carries every event.
  }
  return { info() {}, warn() {}, error() {} };
}

async function saveJob(fields) {
  plugin.job = { ...plugin.job, ...fields };
  dremu.panel.publish(TOPICS.job, plugin.job);
  await dremu.storage.put(JOB_KEY, plugin.job);
}

function startJob(job) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  plugin.signal.addEventListener("abort", stop, { once: true });
  const log = plugin.logger;
  const screen = createScreen({ device: dremu.device, assets, signal: controller.signal, log });
  const flow = createFlow({ screen, device: dremu.device, log });
  const run = createJob({ flow, screen, log, booking: plugin.booking, signal: controller.signal, update: (fields) => saveJob(fields) });
  const promise = run(job)
    .then(() => ({ phase: "succeeded", reason: null, message: job.kind === "test" ? "已预订并已取消" : "预订成功" }))
    .catch((error) => {
      // The plugin itself stopping (Refresh, disable) leaves the job as it
      // was, so the next start resumes it; only the person's stop ends it.
      if (isAbort(error) && plugin.signal.aborted) return null;
      if (isAbort(error)) return { phase: "stopped", reason: "stopped", message: "已停止" };
      if (isFailure(error)) return { phase: "failed", reason: error.reason, message: error.message };
      log.error("job.error", { error: error?.message ?? String(error) });
      return { phase: "failed", reason: "error", message: error?.message ?? String(error) };
    })
    .then(async (end) => {
      plugin.signal.removeEventListener("abort", stop);
      if (plugin.run?.controller === controller) plugin.run = null;
      if (!end) return;
      const level = end.phase === "succeeded" ? "info" : "warn";
      log[level]("job.end", { phase: end.phase, reason: end.reason ?? "—", message: end.message });
      plugin.booking[level]("end", { kind: job.kind, date: job.date, slots: job.slots, ...end });
      await saveJob({ ...end, finishedAt: Date.now() });
    });
  plugin.run = { controller, promise };
}

async function createAndStart(kind, payload) {
  if (plugin.run) return { outcome: "refused", reason: "job_running", message: "已有任务在进行，先停止它" };
  const { value, reason, message } = checkTask(payload, Date.now());
  if (!value) return { outcome: "refused", reason, message };
  const front = (await dremu.device.currentApplication())?.packageId ?? null;
  if (front !== ICONDO_PACKAGE) return { outcome: "refused", reason: "icondo_not_in_front", message: `请先打开 iCondo（${ICONDO_PACKAGE}），现在前台是 ${front ?? "无"}` };
  plugin.logger.info("job.create", { kind, date: value.date, slots: slotsLabel(value.slots) });
  plugin.job = null;
  await saveJob({ kind, ...value, phase: "starting", openAt: null, latencyMs: null, reason: null, message: null, startedAt: Date.now(), finishedAt: null });
  const created = plugin.job;
  startJob(created);
  return { outcome: "accepted", payload: created };
}

export async function main(context) {
  plugin.deviceId = context.deviceId;
  plugin.signal = context.signal;
  plugin.logger = createLogger({
    onAppend(line) {
      echo(line);
      dremu.panel.publish(TOPICS.log, { append: line, keep: plugin.logger?.keep ?? 500 });
    },
  });
  plugin.booking = bookingChannel();
  plugin.draft = normalizeDraft(await dremu.storage.get(DRAFT_KEY));
  plugin.job = (await dremu.storage.get(JOB_KEY)) ?? null;
  plugin.logger.info("plugin.start", { version: VERSION, device: context.deviceId });
  if (isActive(plugin.job)) {
    if (RESUMABLE.includes(plugin.job.phase)) {
      plugin.logger.info("job.resume", { kind: plugin.job.kind, date: plugin.job.date, phase: plugin.job.phase });
      startJob(plugin.job);
    } else {
      await saveJob({ phase: "failed", reason: "interrupted", message: "插件在预订进行中被重启；预订可能已完成，请到 active 页核对", finishedAt: Date.now() });
    }
  }
  await new Promise((resolve) => context.signal.addEventListener("abort", resolve, { once: true }));
  await plugin.run?.promise;
}

const accepted = (payload) => ({ outcome: "accepted", payload });
const OBJECT = { type: "object" };
const TASK = { type: "object", properties: { date: { type: "string" }, slots: { type: "array" } }, required: ["date", "slots"] };

export const panel = {
  intents: {
    // Everything a document needs to draw itself once; later changes arrive on the topics.
    [INTENTS.read]: {
      payloadSchema: OBJECT,
      async handle() {
        return accepted({ version: VERSION, today: dateOf(Date.now()), draft: plugin.draft, job: plugin.job, log: { lines: plugin.logger.lines(), keep: plugin.logger.keep } });
      },
    },
    // The panel's form, kept so it reopens as it was left.
    [INTENTS.draftSet]: {
      payloadSchema: { type: "object", properties: { draft: OBJECT }, required: ["draft"] },
      async handle({ draft }) {
        plugin.draft = normalizeDraft(draft);
        await dremu.storage.put(DRAFT_KEY, plugin.draft);
        return accepted(plugin.draft);
      },
    },
    [INTENTS.book]: { payloadSchema: TASK, handle: (payload) => createAndStart("book", payload) },
    [INTENTS.test]: { payloadSchema: TASK, handle: (payload) => createAndStart("test", payload) },
    [INTENTS.stop]: {
      payloadSchema: OBJECT,
      async handle() {
        if (!plugin.run) return { outcome: "refused", reason: "not_running", message: "没有进行中的任务" };
        const { controller, promise } = plugin.run;
        controller.abort();
        await promise;
        return accepted(plugin.job);
      },
    },
    [INTENTS.logClear]: {
      payloadSchema: OBJECT,
      async handle() {
        plugin.logger.clear();
        dremu.panel.publish(TOPICS.log, { lines: [], keep: plugin.logger.keep });
        return accepted({});
      },
    },
    "dremu.panel.close_requested": {
      payloadSchema: OBJECT,
      async handle() {
        return accepted({});
      },
    },
  },
  topics: {
    [TOPICS.job]: { type: ["object", "null"] },
    [TOPICS.log]: OBJECT,
  },
};
