// A module loader hook: a `.vue` file becomes the ES module Vue's own SFC
// compiler produces for it. `vue/compiler-sfc` is the compiler the Vite
// plugin uses at build time, so what a case imports is what ships, minus the
// bundling. Styles are not part of a component here (the documents' CSS is a
// plain stylesheet imported by `main.js`), and a `<style>` block is refused
// rather than silently dropped.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { compileScript, parse } from "vue/compiler-sfc";

export async function load(url, context, nextLoad) {
  if (!url.endsWith(".vue")) return nextLoad(url, context);
  const filename = fileURLToPath(url);
  const source = await readFile(filename, "utf8");
  const { descriptor, errors } = parse(source, { filename });
  if (errors.length > 0) throw errors[0];
  if (descriptor.styles.length > 0) {
    throw new Error(`${filename}: a component carries a <style> block; the documents' CSS lives in the stylesheet main.js imports`);
  }
  const id = createHash("sha256").update(filename).digest("hex").slice(0, 8);
  const script = compileScript(descriptor, { id, inlineTemplate: true, genDefaultAs: "__sfc__" });
  const code = `${script.content}\n__sfc__.__file = ${JSON.stringify(filename)};\nexport default __sfc__;\n`;
  return { format: "module", source: code, shortCircuit: true };
}
