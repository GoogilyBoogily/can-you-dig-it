import { test, expect } from "bun:test";
import { resolve } from "node:path";
import { resolveStaticPath } from "../dev";

const DIST = resolve("dist");

test("bare / serves the index", () => {
  expect(resolveStaticPath("/")).toBe(`${DIST}/index.html`);
});

test("a normal asset resolves inside dist", () => {
  expect(resolveStaticPath("/worker.js")).toBe(`${DIST}/worker.js`);
  expect(resolveStaticPath("/manifold.wasm")).toBe(`${DIST}/manifold.wasm`);
});

test("climbing out of dist is refused", () => {
  expect(resolveStaticPath("/../package.json")).toBeNull();
  expect(resolveStaticPath("/../../etc/passwd")).toBeNull();
});

test("percent-encoded climbing is refused too", () => {
  expect(resolveStaticPath("/%2e%2e/package.json")).toBeNull();
});

test("a sibling directory sharing the dist prefix is refused", () => {
  expect(resolveStaticPath("/../dist-evil/x.js")).toBeNull();
});
