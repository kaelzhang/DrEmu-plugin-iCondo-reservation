import { createApp } from "vue";
import { createRequestBridge } from "./bridge.js";
import { TOPICS } from "../../shared/protocol.js";
import PanelApp from "./PanelApp.vue";
import { PANEL, createPanelStore } from "./store.js";
import "./panel.css";

// One store for the whole panel, provided to every component (usePanel()).
const bridge = createRequestBridge(globalThis.dremuPanel, "panel", Object.values(TOPICS));
createApp(PanelApp).provide(PANEL, createPanelStore(bridge)).mount("#app");
