<script setup>
// The one task the panel sets: this or next week, a weekday that has not
// passed, and one slot or two adjacent ones (core/task.js). 「预订」 books it
// — now if the date is open, otherwise at 00:00 the day it opens;
// 「测试」 books an open date and cancels the booking again.
import { computed } from "vue";
import { opensAt, targetDate, weekChoices, windowOf } from "../../core/calendar.js";
import { SLOTS, slotLabel, slotSelectable, slotsLabel, toggleSlot } from "../../core/task.js";
import { isActive } from "../../shared/protocol.js";
import { usePanel } from "./store.js";

const { draft, today, job, busy, book, test } = usePanel();

const choices = computed(() => weekChoices(today.value)[draft.week]);
const date = computed(() => targetDate(today.value, draft.week, draft.weekday));
const dayOk = computed(() => !choices.value[draft.weekday].disabled);
const openness = computed(() => (dayOk.value ? windowOf(date.value, Date.now()) : "past"));
const running = computed(() => isActive(job.value));
const ready = computed(() => dayOk.value && draft.slots.length > 0 && !running.value && !busy.value);

const when = computed(() => {
  if (!dayOk.value) return "这一天已经过去";
  if (openness.value === "open") return "现在可以预订";
  const t = new Date(opensAt(date.value));
  return `${t.getMonth() + 1} 月 ${t.getDate()} 日 00:00 开放，届时自动抢订`;
});

const pick = (hour) => {
  draft.slots = toggleSlot(draft.slots, hour);
};
const task = () => ({ date: date.value, slots: [...draft.slots] });
</script>

<template>
  <section class="task">
    <div class="task-row">
      <label>
        <span>周</span>
        <select v-model="draft.week">
          <option value="this">本周</option>
          <option value="next">下周</option>
        </select>
      </label>
      <label>
        <span>星期</span>
        <select v-model.number="draft.weekday">
          <option v-for="day in choices" :key="day.weekday" :value="day.weekday" :disabled="day.disabled">{{ day.label }}</option>
        </select>
      </label>
      <span class="task-date">{{ date }}</span>
    </div>
    <div class="slots" role="group" aria-label="时段">
      <button
        v-for="hour in SLOTS"
        :key="hour"
        type="button"
        class="slot"
        :aria-pressed="draft.slots.includes(hour)"
        :disabled="!slotSelectable(draft.slots, hour)"
        @click="pick(hour)"
      >
        {{ slotLabel(hour) }}
      </button>
    </div>
    <p class="task-summary" :data-ok="dayOk">{{ slotsLabel(draft.slots) }} · {{ when }}</p>
    <div class="task-actions">
      <button type="button" class="primary" :disabled="!ready" @click="book(task())">预订</button>
      <button type="button" :disabled="!ready || openness !== 'open'" title="预订一个现在就开放的时段，成功后自动取消" @click="test(task())">测试</button>
    </div>
  </section>
</template>
