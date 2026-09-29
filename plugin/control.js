// The iCondo Reservation control script (docs/ARCHITECTURE.md).
//
// Runs in DrEmu's sandboxed engine: no DOM, no network, only `dremu`. The
// panel starts and stops one reservation run and edits the settings; the
// run's status and its log lines reach the panel on separate topics, so a new
// log line never re-sends the status and vice versa. `version.js` is
// generated into dist/ by tools/build-dist.mjs from the manifest's version.
import VERSION from "./version.js";
import { ICONDO_PACKAGE } from "./core/icondo.js";
import { createLogger } from "./core/logger.js";
import { checkSettings, normalizeSettings } from "./core/settings.js";
import { INTENTS, TOPICS } from "./shared/protocol.js";

const SETTINGS_KEY = "settings";

const plugin = {
  deviceId: null,
  settings: normalizeSettings(), // persisted in dremu.storage under SETTINGS_KEY
  logger: null,
  run: null, // { controller, promise } while a run is going
  stoppedBecause: null,
};

const status = () => ({ running: plugin.run !== null, stoppedBecause: plugin.stoppedBecause });

function publishStatus() {
  dremu.panel.publish(TOPICS.status, status());
}

// The plugin's own log, for `dremuctl plugin-log`, on a runtime that has one.
function echo(line) {
  const log = globalThis.dremu?.log;
  if (log && typeof log[line.level] === "function") log[line.level](line.text);
}

// One reservation run. The booking flow itself is not specified yet
// (docs/REQUIREMENTS.md §Open questions), so a run records its settings and
// ends by saying so rather than pretending to book.
async function reserve(signal) {
  const { facility, slots } = plugin.settings;
  plugin.logger.info("run.begin", { facility: facility || "—", slots: slots.join(",") || "—" });
  if (signal.aborted) return "user";
  plugin.logger.warn("run.flow_undefined", { detail: "the reservation flow is not implemented yet" });
  return "flow_undefined";
}

function startRun() {
  const controller = new AbortController();
  plugin.stoppedBecause = null;
  const promise = reserve(controller.signal)
    .catch((error) => {
      plugin.logger.error("run.failed", { error: error?.message ?? String(error) });
      return "error";
    })
    .then((because) => {
      if (plugin.run?.controller !== controller) return;
      plugin.run = null;
      plugin.stoppedBecause = because;
      plugin.logger.info("run.end", { because });
      publishStatus();
    });
  plugin.run = { controller, promise };
  publishStatus();
}

async function stopRun(because) {
  const run = plugin.run;
  if (!run) return;
  run.controller.abort();
  plugin.run = null;
  plugin.stoppedBecause = because;
  plugin.logger.info("run.end", { because });
  publishStatus();
  await run.promise;
}

export async function main(context) {
  plugin.deviceId = context.deviceId;
  plugin.logger = createLogger({
    onAppend(line) {
      echo(line);
      dremu.panel.publish(TOPICS.log, { append: line, keep: plugin.logger?.keep ?? 500 });
    },
  });
  plugin.settings = normalizeSettings(await dremu.storage.get(SETTINGS_KEY));
  plugin.logger.info("plugin.start", { version: VERSION, device: context.deviceId });
  await new Promise((resolve) => context.signal.addEventListener("abort", resolve, { once: true }));
  await stopRun("plugin_stopped");
}

const accepted = (payload) => ({ outcome: "accepted", payload });
const OBJECT = { type: "object" };

export const panel = {
  intents: {
    // Everything a document needs to draw itself once; later changes arrive on the topics.
    [INTENTS.read]: {
      payloadSchema: OBJECT,
      async handle() {
        return accepted({ version: VERSION, status: status(), settings: plugin.settings, log: { lines: plugin.logger.lines(), keep: plugin.logger.keep } });
      },
    },
    [INTENTS.start]: {
      payloadSchema: OBJECT,
      async handle() {
        if (plugin.run) return { outcome: "refused", reason: "already_running", message: "A reservation run is already going." };
        const front = (await dremu.device.currentApplication())?.packageId ?? null;
        if (front !== ICONDO_PACKAGE) {
          return { outcome: "refused", reason: "icondo_not_in_front", message: `Open iCondo (${ICONDO_PACKAGE}) first; ${front ?? "nothing"} is in front.` };
        }
        startRun();
        return accepted(status());
      },
    },
    [INTENTS.stop]: {
      payloadSchema: OBJECT,
      async handle() {
        if (!plugin.run) return { outcome: "refused", reason: "not_running", message: "Nothing is running." };
        await stopRun("user");
        return accepted(status());
      },
    },
    // The whole settings object, as the panel's form holds it (core/settings.js).
    [INTENTS.settingsSet]: {
      payloadSchema: { type: "object", properties: { settings: OBJECT }, required: ["settings"] },
      async handle({ settings }) {
        const { value, error } = checkSettings(settings);
        if (error) return { outcome: "invalid_payload", reason: "bad_settings", message: error };
        await dremu.storage.put(SETTINGS_KEY, value);
        plugin.settings = value;
        plugin.logger.info("settings.change", { facility: value.facility || "—", slots: value.slots.join(",") || "—" });
        return accepted(value);
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
    [TOPICS.status]: OBJECT,
    [TOPICS.log]: OBJECT,
  },
};
