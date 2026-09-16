// These go through a live server, not through resolveStaticPath directly, because the
// helper is not what an attacker reaches. `new URL()` collapses "../" and "%2e%2e" while
// parsing, so a request for /../package.json arrives at the server already rewritten to
// /package.json - asserting on those strings tests inputs no request can produce. "%2f"
// is the one escape that survives parsing intact, so it is the shape that matters.
import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveDist } from "../dev";

// A throwaway tree, so the test needs no build and the bait file is unambiguous:
// secret.txt sits beside the served root, and reaching it is the whole failure mode.
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "cansys-dev-")));
const root = join(scratch, "dist");

let server: ReturnType<typeof serveDist>;
let origin: string;

beforeAll(() => {
  mkdirSync(root);
  writeFileSync(join(root, "index.html"), "<!doctype html>the served index");
  writeFileSync(join(root, "worker.js"), "// a served asset");
  writeFileSync(join(scratch, "secret.txt"), "must never leave the parent directory");
  server = serveDist(0, root);
  origin = `http://localhost:${server.port}`;
});

afterAll(() => {
  server?.stop(true);
  rmSync(scratch, { recursive: true, force: true });
});

test("bare / serves the index", async () => {
  const response = await fetch(`${origin}/`);
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("the served index");
});

test("a normal asset is served", async () => {
  const response = await fetch(`${origin}/worker.js`);
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("a served asset");
});

// The reachable bypass: %2f is not decoded during URL parsing, so the server receives
// "/..%2fsecret.txt" verbatim and is the first thing that decodes it.
test("an encoded slash cannot climb out of the served root", async () => {
  const response = await fetch(`${origin}/..%2fsecret.txt`);
  expect(response.status).toBe(404);
  expect(await response.text()).not.toContain("must never leave");
});

test("a plain ../ cannot climb out either", async () => {
  const response = await fetch(`${origin}/../secret.txt`);
  expect(response.status).toBe(404);
  expect(await response.text()).not.toContain("must never leave");
});

test("an encoded ../ cannot climb out either", async () => {
  const response = await fetch(`${origin}/%2e%2e%2fsecret.txt`);
  expect(response.status).toBe(404);
  expect(await response.text()).not.toContain("must never leave");
});

// A sibling whose name merely starts with the root's is outside it: dist-evil is not dist.
test("a sibling directory sharing the root's prefix is refused", async () => {
  const response = await fetch(`${origin}/..%2fdist-evil%2fx.js`);
  expect(response.status).toBe(404);
});

test("malformed percent-encoding is refused rather than thrown", async () => {
  const response = await fetch(`${origin}/%zz`);
  expect(response.status).toBe(404);
});

test("a missing file inside the root is a plain 404", async () => {
  const response = await fetch(`${origin}/nope.js`);
  expect(response.status).toBe(404);
});
