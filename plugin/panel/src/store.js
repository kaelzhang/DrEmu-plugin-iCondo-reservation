// The panel's store (docs/ARCHITECTURE.md §Panel rendering), provided to
// every component (`usePanel()`).
//
// Rendering cost is the point of its shape. Every slice is its own ref, and a
// component reads only the slices it draws, so a change re-renders that
// component alone — never the whole panel:
//
// - `status`, `notice`, `busy`: small values replaced whole (shallowRef).
// - `log`: an array of frozen lines held in a shallowRef. A published line is
//   pushed in place and `triggerRef` announces it, so Vue never makes 500
//   line objects deeply reactive and the log view patches one new row.
// - `settings`: owned by the panel. The form binds to it with v-model; a
//   watcher saves the whole object (icondo.settings.set) a moment after the
//   last change. It is loaded from the control script only when the panel
//   opens, so nothing the person just typed can jump back.
import { inject, reactive, readonly, shallowReadonly, shallowRef, triggerRef, watch } from "vue";
import { normalizeSettings } from "../../core/settings.js";
import { INTENTS, TOPICS } from "../../shared/protocol.js";

export const PANEL = Symbol("icondo.panel");

export function usePanel() {
  return inject(PANEL);
}

const noticeOf = (reply) => (reply.outcome === "accepted" ? null : Object.freeze({ outcome: reply.outcome, reason: reply.reason, message: reply.message }));

export function createPanelStore(bridge, { saveDelayMs = 300 } = {}) {
  const version = shallowRef(null);
  const status = shallowRef(null);
  const notice = shallowRef(null);
  const busy = shallowRef(false); // start / stop only
  const log = shallowRef([]);
  let keep = 500;
  const settings = reactive(normalizeSettings());

  function replaceLog(lines, keepLines) {
    keep = keepLines ?? keep;
    log.value = lines.slice(-keep);
  }

  function appendLine(line) {
    const lines = log.value;
    lines.push(line);
    if (lines.length > keep) lines.splice(0, lines.length - keep);
    triggerRef(log);
  }

  bridge.subscribe((event) => {
    if (event.topic === TOPICS.status) status.value = Object.freeze(event.payload);
    else if (event.topic === TOPICS.log) {
      if (event.payload.append) {
        keep = event.payload.keep ?? keep;
        appendLine(event.payload.append);
      } else replaceLog(event.payload.lines ?? [], event.payload.keep);
    }
  });

  // Loading replaces `settings` from the control script without saving it back.
  let loading = false;
  function loadSettings(from) {
    loading = true;
    Object.assign(settings, normalizeSettings(from));
    loading = false;
  }

  let saveTimer = null;
  async function save() {
    const reply = await bridge.request(INTENTS.settingsSet, { settings: { facility: settings.facility, slots: [...settings.slots] } });
    notice.value = noticeOf(reply);
  }
  // Synchronous, so a load (flag set) is told apart from the person's edits.
  watch(
    settings,
    () => {
      if (loading) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, saveDelayMs);
    },
    { deep: true, flush: "sync" },
  );

  async function refresh() {
    const reply = await bridge.request(INTENTS.read);
    if (reply.outcome !== "accepted") {
      notice.value = noticeOf(reply);
      return;
    }
    const { version: v, status: s, settings: kept, log: l } = reply.payload;
    version.value = v;
    status.value = Object.freeze(s);
    replaceLog(l.lines, l.keep);
    loadSettings(kept);
  }

  async function toggle() {
    busy.value = true;
    try {
      const reply = await bridge.request(status.value?.running ? INTENTS.stop : INTENTS.start);
      notice.value = noticeOf(reply);
      if (reply.outcome === "accepted") status.value = Object.freeze(reply.payload);
    } finally {
      busy.value = false;
    }
  }

  const clearLog = () => bridge.request(INTENTS.logClear);

  return {
    version: readonly(version),
    status: readonly(status),
    notice: readonly(notice),
    busy: readonly(busy),
    log: shallowReadonly(log),
    settings,
    refresh,
    toggle,
    clearLog,
  };
}
