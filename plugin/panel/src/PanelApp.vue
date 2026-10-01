<script setup>
// The panel: the header, the task form, the job's state and the log. Each
// child reads its own slices of the store, so none re-renders for another's change.
import { onMounted } from "vue";
import JobCard from "./JobCard.vue";
import LogView from "./LogView.vue";
import NoticeBar from "./NoticeBar.vue";
import PanelHeader from "./PanelHeader.vue";
import TaskForm from "./TaskForm.vue";
import { usePanel } from "./store.js";

const { refresh } = usePanel();

onMounted(() => {
  refresh();
  // DrEmu closes a panel that has not said it rendered within 5 seconds
  // (`panel_ready_timed_out`); the first DOM is in place by now.
  window.dispatchEvent(new window.CustomEvent("dremu-panel-ready"));
});
</script>

<template>
  <PanelHeader />
  <TaskForm />
  <NoticeBar />
  <JobCard />
  <LogView />
</template>
