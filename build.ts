// bun run build.ts  →  dist/ (static site)
import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
rmSync("dist", { recursive: true, force: true }); mkdirSync("dist");
const r = await Bun.build({
  entrypoints: ["src/main.ts", "src/worker.ts"],
  outdir: "dist", target: "browser", format: "esm", minify: true, sourcemap: "linked",
  naming: "[name].[ext]",
});
if (!r.success) { for (const l of r.logs) console.error(l); process.exit(1); }
cpSync("node_modules/manifold-3d/manifold.wasm", "dist/manifold.wasm");
cpSync("index.html", "dist/index.html"); cpSync("styles.css", "dist/styles.css");
if (existsSync("public")) cpSync("public", "dist", { recursive: true });
console.log("built:", r.outputs.map((o) => `${o.path.split("/").pop()} ${(o.size / 1024).toFixed(0)} KB`).join(", "));
