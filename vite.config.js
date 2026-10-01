// Builds the panel document — `vite build --mode panel` — from
// `plugin/panel/src/` into `dist/panel/`, the path the manifest names inside
// the shipped package. A later overlay document is one more entry in
// DOCUMENTS and one more `vite build --mode overlay` in the build script.
//
// The product loads the output from a file URL under `default-src 'none';
// script-src 'self'; style-src 'self'`, so: a relative base, no module-preload
// polyfill, no inlined assets, deterministic file names, and Vue's runtime
// build with templates compiled here rather than in the page.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const DOCUMENTS = new Set(["panel"]);

// Vite marks its module script and stylesheet `crossorigin`; the WKWebView
// loads the document from a file URL, so drop the attribute.
function sameOriginResources() {
  return {
    name: "dremu:same-origin-resources",
    transformIndexHtml: {
      order: "post",
      handler: (html) => html.replace(/ crossorigin(?=[ >])/g, ""),
    },
  };
}

export default defineConfig(({ mode }) => {
  if (!DOCUMENTS.has(mode)) {
    throw new Error(`vite build --mode must name a document (${[...DOCUMENTS].join(", ")}), not ${JSON.stringify(mode)}`);
  }
  const root = fileURLToPath(new URL(`plugin/${mode}/src/`, import.meta.url));
  return {
    root,
    base: "./",
    // The built page must never load the in-browser template compiler.
    resolve: { alias: { vue: "vue/dist/vue.runtime.esm-bundler.js" } },
    // Composition API only: dropping the Options API shrinks the runtime.
    define: { __VUE_OPTIONS_API__: "false", __VUE_PROD_DEVTOOLS__: "false", __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false" },
    plugins: [vue(), sameOriginResources()],
    build: {
      // tools/build.mjs builds into a staging directory and swaps it in as
      // `dist/` only when the whole package is complete.
      outDir: fileURLToPath(new URL(`${process.env.DREMU_PACKAGE_DIR ?? "dist"}/${mode}/`, import.meta.url)),
      // The staging directory starts empty, so no document build empties
      // what another wrote.
      emptyOutDir: false,
      assetsDir: "assets",
      assetsInlineLimit: 0,
      modulePreload: false,
      cssCodeSplit: false,
      sourcemap: false,
      reportCompressedSize: false,
      rollupOptions: {
        output: {
          entryFileNames: `assets/${mode}.js`,
          chunkFileNames: "assets/[name].js",
          assetFileNames: (asset) => ((asset.names ?? [asset.name]).some((name) => /\.css$/.test(name ?? "")) ? `assets/${mode}.css` : "assets/[name][extname]"),
        },
      },
    },
  };
});
