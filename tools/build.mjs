// `npm run build`: the package DrEmu loads, built atomically. Everything is
// written into `.dist-staging/` first; only when every step has succeeded is
// it swapped in as `dist/` (the directory the plugin symlink points at). A
// failed build leaves the previous `dist/` untouched, never half a package.
import { execFileSync } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = `${ROOT}dist`;
const STAGING = `${ROOT}.dist-staging`;
const RETIRED = `${ROOT}.dist-retired`;
// Each document the manifest names, built by vite.config.js in its own mode.
const DOCUMENTS = ["panel"];

rmSync(STAGING, { recursive: true, force: true });
rmSync(RETIRED, { recursive: true, force: true });

process.env.DREMU_PACKAGE_DIR = ".dist-staging";
for (const mode of DOCUMENTS) await build({ configFile: `${ROOT}vite.config.js`, mode, logLevel: "warn" });
for (const step of ["build-dist.mjs", "build-assets.mjs"]) {
  execFileSync(process.execPath, [fileURLToPath(new URL(step, import.meta.url)), STAGING], { stdio: "inherit" });
}

if (existsSync(DIST)) renameSync(DIST, RETIRED);
renameSync(STAGING, DIST);
rmSync(RETIRED, { recursive: true, force: true });
console.log(`built ${DIST}`);
