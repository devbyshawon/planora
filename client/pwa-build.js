import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

export default function pwaBuild() {
  return {
    name: "planora-pwa",
    apply: "build",
    generateBundle(_options, bundle) {
      const source = readFileSync(new URL("./src/service-worker.js", import.meta.url), "utf8");
      const hash = createHash("sha256").update(source);
      for (const name of Object.keys(bundle).sort()) {
        const file = bundle[name];
        hash.update(name).update(file.type === "chunk" ? file.code : file.source);
      }
      const directory = new URL("./public/", import.meta.url);
      for (const name of readdirSync(directory, { recursive: true }).sort()) {
        if (!name.includes(".")) continue;
        hash.update(name).update(readFileSync(new URL(name, directory)));
      }
      this.emitFile({ type: "asset", fileName: "sw.js", source:
        source.replace("__PLANORA_BUILD__", hash.digest("hex").slice(0, 16)) });
    },
  };
}
