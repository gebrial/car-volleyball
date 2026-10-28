import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";

// The bot the game ships with. Its model parts and release.json are served
// and bundled from releases/; the parity fixtures stay out of the site.
export const BOT_RELEASE = "volleyball1-gravity-ramp-post";

function botRelease(): Plugin {
  const dir = join("releases", BOT_RELEASE);
  const release = JSON.parse(readFileSync(join(dir, "release.json"), "utf-8")) as { policy_onnx_parts: string[] };
  const files = ["release.json", ...release.policy_onnx_parts];
  return {
    name: "bot-release",
    configureServer(server) {
      server.middlewares.use(`/releases/${BOT_RELEASE}/`, (req, res, next) => {
        const name = (req.url ?? "").replace(/^\//, "").split("?")[0]!;
        if (!files.includes(name)) return next();
        res.setHeader("Content-Type", name.endsWith(".json") ? "application/json" : "application/octet-stream");
        res.end(readFileSync(join(dir, name)));
      });
    },
    generateBundle() {
      for (const name of files) this.emitFile({ type: "asset", fileName: `releases/${BOT_RELEASE}/${name}`, source: readFileSync(join(dir, name)) });
    },
  };
}

export default defineConfig({
  plugins: [botRelease()],
  define: { __BOT_RELEASE__: JSON.stringify(BOT_RELEASE) },
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  // The site needs only ONNX Runtime's plain WASM build (15 MB, not the 30 MB
  // WebGPU one). Tests run in Node, where only the main entry loads its WASM.
  resolve: process.env.VITEST ? {} : { alias: [{ find: /^onnxruntime-web$/, replacement: "onnxruntime-web/wasm" }] },
});
