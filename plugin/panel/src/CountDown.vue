<script setup>
// A live countdown to `at`. Its own once-a-second timer re-renders this text
// alone, never the card around it.
import { onBeforeUnmount, shallowRef } from "vue";

const props = defineProps({ at: { type: Number, required: true } });
const left = shallowRef(props.at - Date.now());
const timer = setInterval(() => {
  left.value = props.at - Date.now();
}, 1000);
onBeforeUnmount(() => clearInterval(timer));

const two = (n) => String(n).padStart(2, "0");
function text(ms) {
  if (ms <= 0) return "0 秒";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86_400);
  const clock = `${two(Math.floor((s % 86_400) / 3600))}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
  return d ? `${d} 天 ${clock}` : clock;
}
</script>

<template>
  <span class="countdown">{{ text(left) }}</span>
</template>
