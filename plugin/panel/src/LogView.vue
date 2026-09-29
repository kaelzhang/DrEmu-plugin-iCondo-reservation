<script setup>
// The run's log. Lines are frozen and keyed by `seq`; `v-memo` lets a line
// that is already drawn skip even its virtual-DOM diff, so a new line costs
// one row, not the whole list. The view follows new lines only while it is
// scrolled to the bottom.
import { nextTick, shallowRef, watch } from "vue";
import { usePanel } from "./store.js";

const { log, clearLog } = usePanel();
const element = shallowRef(null);

// Within a few pixels of the end counts as at the bottom.
const atBottom = (el) => el.scrollHeight - el.scrollTop - el.clientHeight < 4;

function toBottom() {
  const el = element.value;
  if (el) el.scrollTop = el.scrollHeight;
}

// `flush: "pre"` runs before the new line is drawn, so "at the bottom" is
// where the reader was.
watch(
  log,
  async () => {
    const following = !element.value || atBottom(element.value);
    await nextTick();
    if (following) toBottom();
  },
  { flush: "pre" },
);
</script>

<template>
  <section class="log-panel">
    <div class="log-bar">
      <span>日志</span>
      <span class="log-actions">
        <button type="button" class="link" @click="toBottom">到底部</button>
        <button type="button" class="link" @click="clearLog">清空</button>
      </span>
    </div>
    <div ref="element" class="log" role="log">
      <div v-for="line in log" :key="line.seq" v-memo="[line.seq]" class="log-line" :data-level="line.level">{{ line.at }} {{ line.text }}</div>
    </div>
  </section>
</template>
