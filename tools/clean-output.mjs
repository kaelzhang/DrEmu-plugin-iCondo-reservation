// Remove the whole of `dist/` — the shipped package — so a build never leaves
// a file the current sources no longer produce, and so the two document builds
// that follow write into an empty tree.
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

rmSync(fileURLToPath(new URL("../dist/", import.meta.url)), { recursive: true, force: true });
