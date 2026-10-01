<script setup>
// The plugin's name and the build the device runs.
import { usePanel } from "./store.js";

const { version } = usePanel();
</script>

<template>
  <header class="header">
    <h1>iCondo 网球场预订</h1>
    <small v-if="version" class="muted">v{{ version }}</small>
  </header>
</template>
