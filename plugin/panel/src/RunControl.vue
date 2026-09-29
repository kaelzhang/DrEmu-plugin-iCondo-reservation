<script setup>
// The header: the plugin's name, the run's status and the start/stop button.
import { computed } from "vue";
import { usePanel } from "./store.js";

const { version, status, busy, toggle } = usePanel();
const running = computed(() => status.value?.running === true);
const statusText = computed(() => {
  if (!status.value) return "正在连接控制脚本…";
  if (running.value) return "运行中";
  return status.value.stoppedBecause ? `已停止（${status.value.stoppedBecause}）` : "已停止";
});
</script>

<template>
  <header class="header">
    <div>
      <h1>iCondo Reservation <small v-if="version" class="muted">v{{ version }}</small></h1>
      <p class="status-text" :data-running="running">{{ statusText }}</p>
    </div>
    <button type="button" class="toggle" :data-running="running" :disabled="!status || busy" @click="toggle">
      {{ running ? "停止" : "开始" }}
    </button>
  </header>
</template>
