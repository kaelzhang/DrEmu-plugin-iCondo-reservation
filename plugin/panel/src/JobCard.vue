<script setup>
// The current (or last) job: what it is for, where it stands, and how it ended.
import { computed } from "vue";
import { slotsLabel } from "../../core/task.js";
import { isActive } from "../../shared/protocol.js";
import CountDown from "./CountDown.vue";
import { usePanel } from "./store.js";

const { job, busy, stop } = usePanel();

const PHASES = {
  starting: "准备中",
  waiting: "等待开放（保活中）",
  arming: "开放前校准",
  grabbing: "抢订中",
  booking: "预订中",
  cancelling: "取消预订中（测试）",
  succeeded: "成功",
  failed: "失败",
  stopped: "已停止",
};
const active = computed(() => isActive(job.value));
const time = (at) => (at ? new Date(at).toLocaleString("zh-CN", { hour12: false }) : "—");
</script>

<template>
  <section v-if="job" class="job" :data-phase="job.phase">
    <div class="job-head">
      <strong>{{ job.kind === "test" ? "测试" : "预订" }} {{ job.date }} {{ slotsLabel(job.slots) }}</strong>
      <span class="job-phase">{{ PHASES[job.phase] ?? job.phase }}</span>
    </div>
    <p v-if="job.phase === 'waiting' && job.openAt" class="job-line">距开放 <CountDown :at="job.openAt" />（{{ time(job.openAt) }}）</p>
    <p v-if="job.latencyMs" class="job-line muted">进入预订页约 {{ job.latencyMs }} ms</p>
    <p v-if="job.message" class="job-line" :data-reason="job.reason">{{ job.message }}<template v-if="job.reason && job.phase === 'failed'">（{{ job.reason }}）</template></p>
    <p v-if="job.finishedAt" class="job-line muted">结束于 {{ time(job.finishedAt) }}</p>
    <button v-if="active" type="button" class="danger" :disabled="busy" @click="stop">停止任务</button>
  </section>
</template>
