// bun run dev  →  build once, serve dist/, rebuild whenever a source file is saved.
// Shells out to build.ts rather than reimplementing it, so the bytes you see in the
// browser are the bytes GitHub Pages gets.
import { watch } from "node:fs";
import { join, resolve } from "node:path";

const DIST = resolve("dist");
const PORT = 3000;
const WATCHED = ["src", "index.html", "styles.css", "profiles"]; // build.ts copies profiles/ too

/** URL path → a file inside `root`, or null when it climbs out. `root` must be absolute. */
export function resolveStaticPath(urlPath: string, root: string = DIST): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null; // malformed percent-encoding is not a path we can serve
  }
  const candidate = resolve(join(root, decoded === "/" ? "index.html" : decoded));
  return candidate === root || candidate.startsWith(root + "/") ? candidate : null;
}

async function rebuild(): Promise<boolean> {
  const exitCode = await Bun.spawn(["bun", "run", "build.ts"], { stdout: "inherit", stderr: "inherit" }).exited;
  if (exitCode !== 0) console.error("build failed - fix the error above and save again");
  return exitCode === 0;
}

/**
 * Serve `root` on `port`. The UI tests use this too, so they hit the same server you do,
 * and `test/dev.test.ts` points it at a throwaway directory to prove the path guard.
 * Pass port 0 to get any free port; the returned server reports which one.
 */
export function serveDist(port: number, root: string = DIST) {
  return Bun.serve({
    port,
    async fetch(request) {
      const path = resolveStaticPath(new URL(request.url).pathname, root);
      if (!path) return new Response("not found", { status: 404 });
      const file = Bun.file(path);
      return (await file.exists()) ? new Response(file) : new Response("not found", { status: 404 });
    },
  });
}

if (import.meta.main) {
  await rebuild();

  // Editors fire several events per save; coalesce them into one build. The debounce
  // coalesces events, not builds: build.ts opens with rmSync("dist"), so a second save
  // while the first build is still running deleted the files it had already written, and
  // a reload landing in that window 404s on the page itself. One at a time, then.
  let pending: ReturnType<typeof setTimeout> | undefined;
  let building = false, queued = false;
  const run = async () => {
    if (building) { queued = true; return; }
    building = true;
    try {
      do { queued = false; await rebuild(); } while (queued);
    } finally {
      building = false;
    }
  };
  for (const target of WATCHED) {
    watch(target, { recursive: true }, () => {
      clearTimeout(pending);
      pending = setTimeout(run, 80);
    });
  }

  serveDist(PORT);
  console.log(`serving dist/ on http://localhost:${PORT} - watching ${WATCHED.join(", ")}`);
}
