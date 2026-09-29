// `node --import ./tests/register-vue.mjs`: lets `node --test` import the
// package's `.vue` single-file components directly, compiled the way the
// production build compiles them (templates ahead of time, `<script setup>`
// inlined), so a case mounts the real component and not a stand-in.
import { register } from "node:module";

register("./vue-hooks.mjs", import.meta.url);
