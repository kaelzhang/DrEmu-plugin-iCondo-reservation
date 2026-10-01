// Copy the run-time files of the package into `dist/`, beside the documents
// Vite has just built there.
//
// `dist/` is the package DrEmu loads: the manifest, the control script and the
// modules it imports — and nothing else. Every path the manifest names stays
// at the same relative position it occupies under `plugin/`. `version.js`
// (`export default "<manifest version>+<commit>"`, `-dirty` when the tree has
// uncommitted changes) is written beside the control script, so the panel and
// the run records show exactly which build the device runs.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";

const PLUGIN = new URL("../plugin/", import.meta.url);
const DIST = pathToFileURL(`${process.argv[2] ?? fileURLToPath(new URL("../dist", import.meta.url))}/`);

// A file copied as itself.
const FILES = ["manifest.json", "control.js"];
// A directory whose `*.js` modules are copied, excluding any `*.test.js`.
const MODULE_DIRECTORIES = ["core", "shared"];

const at = (base, name) => fileURLToPath(new URL(name, base));

mkdirSync(fileURLToPath(DIST), { recursive: true });

for (const name of FILES) {
  cpSync(at(PLUGIN, name), at(DIST, name));
}

function commit() {
  const git = (...args) => execFileSync("git", args, { cwd: fileURLToPath(PLUGIN), encoding: "utf8" }).trim();
  try {
    return `+${git("rev-parse", "--short", "HEAD")}${git("status", "--porcelain") ? "-dirty" : ""}`;
  } catch {
    return ""; // not a git checkout, or no commit yet
  }
}

const { version } = JSON.parse(readFileSync(at(PLUGIN, "manifest.json"), "utf8"));
writeFileSync(at(DIST, "version.js"), `export default ${JSON.stringify(version + commit())};\n`);

for (const name of MODULE_DIRECTORIES) {
  const from = new URL(`${name}/`, PLUGIN);
  const into = new URL(`${name}/`, DIST);
  mkdirSync(fileURLToPath(into), { recursive: true });
  for (const entry of readdirSync(fileURLToPath(from)).sort()) {
    if (!entry.endsWith(".js") || entry.includes(".test.")) continue;
    cpSync(at(from, entry), at(into, entry));
  }
}
