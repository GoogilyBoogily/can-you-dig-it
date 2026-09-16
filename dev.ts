// bun run dev  →  build once, serve dist/, rebuild whenever a source file is saved.
// Shells out to build.ts rather than reimplementing it, so the bytes you see in the
// browser are the bytes GitHub Pages gets.
import { watch } from "node:fs";
import { join, resolve } from "node:path";

const DIST = resolve("dist");
const PORT = 3000;
const WATCHED = ["src", "index.html", "styles.css"];

/** URL path → a file inside dist/, or null when it climbs out. */
export function resolveStaticPath(urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null; // malformed percent-encoding is not a path we can serve
  }
  const candidate = resolve(join(DIST, decoded === "/" ? "index.html" : decoded));
  return candidate === DIST || candidate.startsWith(DIST + "/") ? candidate : null;
}

async function rebuild(): Promise<boolean> {
  const exitCode = await Bun.spawn(["bun", "run", "build.ts"], { stdout: "inherit", stderr: "inherit" }).exited;
  if (exitCode !== 0) console.error("build failed - fix the error above and save again");
  return exitCode === 0;
}

/** Serve dist/ on `port`. The UI tests use this too, so they hit the same server you do. */
export function serveDist(port: number) {
  return Bun.serve({
    port,
    async fetch(request) {
      const path = resolveStaticPath(new URL(request.url).pathname);
      if (!path) return new Response("not found", { status: 404 });
      const file = Bun.file(path);
      return (await file.exists()) ? new Response(file) : new Response("not found", { status: 404 });
    },
  });
}

if (import.meta.main) {
  await rebuild();

  // Editors fire several events per save; coalesce them into one build.
  let pending: ReturnType<typeof setTimeout> | undefined;
  for (const target of WATCHED) {
    watch(target, { recursive: true }, () => {
      clearTimeout(pending);
      pending = setTimeout(rebuild, 80);
    });
  }

  serveDist(PORT);
  console.log(`serving dist/ on http://localhost:${PORT} - watching ${WATCHED.join(", ")}`);
}
