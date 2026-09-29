<script setup>
// The reservation settings: the facility and the wanted time slots in order
// of preference. Every edit is saved by the store a moment after the last one.
import { shallowRef } from "vue";
import { MAX_FACILITY_LENGTH, MAX_SLOTS } from "../../core/settings.js";
import { usePanel } from "./store.js";

const { settings } = usePanel();
const draft = shallowRef("");
const SLOT = /^([01]\d|2[0-3]):[0-5]\d$/;

function addSlot() {
  const slot = draft.value.trim();
  if (!SLOT.test(slot) || settings.slots.includes(slot) || settings.slots.length >= MAX_SLOTS) return;
  settings.slots.push(slot);
  draft.value = "";
}

const removeSlot = (index) => settings.slots.splice(index, 1);
</script>

<template>
  <section class="settings">
    <label class="field">
      <span>场地</span>
      <input v-model.trim="settings.facility" type="text" :maxlength="MAX_FACILITY_LENGTH" placeholder="例如 Tennis Court 1" />
    </label>
    <div class="field">
      <span>时段（按优先级）</span>
      <ol class="slots">
        <li v-for="(slot, index) in settings.slots" :key="slot">
          {{ slot }}
          <button type="button" class="link" :aria-label="`移除 ${slot}`" @click="removeSlot(index)">×</button>
        </li>
      </ol>
      <form class="slot-add" @submit.prevent="addSlot">
        <input v-model="draft" type="time" step="60" :disabled="settings.slots.length >= MAX_SLOTS" />
        <button type="submit" :disabled="!SLOT.test(draft) || settings.slots.length >= MAX_SLOTS">添加</button>
      </form>
    </div>
  </section>
</template>
