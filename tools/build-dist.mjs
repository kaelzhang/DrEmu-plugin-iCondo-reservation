// Copy the run-time files of the package into `dist/`, beside the documents
// Vite has just built there.
//
// `dist/` is the package DrEmu loads: the manifest, the control script and the
// modules it imports — and nothing else. Every path the manifest names stays
// at the same relative position it occupies under `plugin/`. `version.js`
// (`export default "<manifest version>"`) is written beside the control
// script, so the run records carry the version without reading the package.
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PLUGIN = new URL("../plugin/", import.meta.url);
const DIST = new URL("../dist/", import.meta.url);

// A file copied as itself.
const FILES = ["manifest.json", "control.js"];
// A directory whose `*.js` modules are copied, excluding any `*.test.js`.
const MODULE_DIRECTORIES = ["core", "shared"];

const at = (base, name) => fileURLToPath(new URL(name, base));

mkdirSync(fileURLToPath(DIST), { recursive: true });

for (const name of FILES) {
  cpSync(at(PLUGIN, name), at(DIST, name));
}

const { version } = JSON.parse(readFileSync(at(PLUGIN, "manifest.json"), "utf8"));
writeFileSync(at(DIST, "version.js"), `export default ${JSON.stringify(version)};\n`);

for (const name of MODULE_DIRECTORIES) {
  const from = new URL(`${name}/`, PLUGIN);
  const into = new URL(`${name}/`, DIST);
  mkdirSync(fileURLToPath(into), { recursive: true });
  for (const entry of readdirSync(fileURLToPath(from)).sort()) {
    if (!entry.endsWith(".js") || entry.includes(".test.")) continue;
    cpSync(at(from, entry), at(into, entry));
  }
}
