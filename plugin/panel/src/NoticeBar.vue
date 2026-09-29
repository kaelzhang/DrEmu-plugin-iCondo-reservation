<script setup>
// The last request's refusal or failure, until the next request succeeds.
import { usePanel } from "./store.js";

const { notice } = usePanel();
</script>

<template>
  <section v-if="notice" class="notice" :data-outcome="notice.outcome" role="alert">
    <strong>{{ notice.reason }}</strong> {{ notice.message }}
  </section>
</template>
