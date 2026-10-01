// The panel's store (docs/ARCHITECTURE.md §面板渲染), provided to every
// component (`usePanel()`).
//
// Rendering cost is the point of its shape. Every slice is its own ref, and a
// component reads only the slices it draws, so a change re-renders that
// component alone — never the whole panel:
//
// - `job`, `notice`, `busy`, `version`, `today`: small values replaced whole
//   (shallowRef). `today` is re-read once a minute, so the day choices move
//   on at midnight.
// - `log`: an array of frozen lines held in a shallowRef. A published line is
//   pushed in place and `triggerRef` announces it, so Vue never makes 500
//   line objects deeply reactive and the log view patches one new row.
// - `draft`: the task form, owned by the panel. A watcher saves it
//   (icondo.draft.set) a moment after the last change; it is loaded from the
//   control script only when the panel opens.
import { inject, reactive, readonly, shallowReadonly, shallowRef, triggerRef, watch } from "vue";
import { dateOf } from "../../core/calendar.js";
import { normalizeDraft } from "../../core/task.js";
import { INTENTS, TOPICS } from "../../shared/protocol.js";

export const PANEL = Symbol("icondo.panel");

export function usePanel() {
  return inject(PANEL);
}

const noticeOf = (reply) => (reply.outcome === "accepted" ? null : Object.freeze({ outcome: reply.outcome, reason: reply.reason, message: reply.message }));

export function createPanelStore(bridge, { saveDelayMs = 300, now = Date.now, tickMs = 60_000 } = {}) {
  const version = shallowRef(null);
  const today = shallowRef(dateOf(now()));
  const job = shallowRef(null);
  const notice = shallowRef(null);
  const busy = shallowRef(false);
  const log = shallowRef([]);
  let keep = 500;
  const draft = reactive(normalizeDraft());

  const clock = setInterval(() => {
    const date = dateOf(now());
    if (date !== today.value) today.value = date;
  }, tickMs);

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
    if (event.topic === TOPICS.job) job.value = event.payload ? Object.freeze(event.payload) : null;
    else if (event.topic === TOPICS.log) {
      if (event.payload.append) {
        keep = event.payload.keep ?? keep;
        appendLine(event.payload.append);
      } else replaceLog(event.payload.lines ?? [], event.payload.keep);
    }
  });

  // Loading replaces `draft` from the control script without saving it back.
  let loading = false;
  function loadDraft(from) {
    loading = true;
    Object.assign(draft, normalizeDraft(from));
    loading = false;
  }

  let saveTimer = null;
  watch(
    draft,
    () => {
      if (loading) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => bridge.request(INTENTS.draftSet, { draft: { week: draft.week, weekday: draft.weekday, slots: [...draft.slots] } }), saveDelayMs);
    },
    { deep: true, flush: "sync" },
  );

  async function refresh() {
    const reply = await bridge.request(INTENTS.read);
    if (reply.outcome !== "accepted") {
      notice.value = noticeOf(reply);
      return;
    }
    const { version: v, job: j, draft: d, log: l } = reply.payload;
    version.value = v;
    job.value = j ? Object.freeze(j) : null;
    replaceLog(l.lines, l.keep);
    loadDraft(d);
  }

  // book / test / stop: the buttons wait for these.
  async function send(intent, payload = {}) {
    busy.value = true;
    try {
      const reply = await bridge.request(intent, payload);
      notice.value = noticeOf(reply);
      if (reply.outcome === "accepted" && reply.payload && "phase" in reply.payload) job.value = Object.freeze(reply.payload);
      return reply;
    } finally {
      busy.value = false;
    }
  }

  return {
    version: readonly(version),
    today: readonly(today),
    job: readonly(job),
    notice: readonly(notice),
    busy: readonly(busy),
    log: shallowReadonly(log),
    draft,
    refresh,
    book: (task) => send(INTENTS.book, task),
    test: (task) => send(INTENTS.test, task),
    stop: () => send(INTENTS.stop),
    clearLog: () => bridge.request(INTENTS.logClear),
    dispose: () => clearInterval(clock),
  };
}
