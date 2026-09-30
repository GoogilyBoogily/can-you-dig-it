import { test, expect } from "bun:test";
import { DEFAULTS, solve, buildAll, partList, filamentGrams, type Options } from "../src/geometry";
import { meshDataOf } from "../src/export";
import { geo } from "./geo";

// the kernel's shapes have isDeleted at runtime (embind); its typings leave it out
const isDeleted = (shape: object) => (shape as { isDeleted(): boolean }).isDeleted();

// manifold-3d registers no finalizer on its shapes: every one not deleted stays on the WASM
// heap for good, and the worker rebuilds on every form change. A Gridfinity job with
// magnets leaked ~25 MB a build and aborted the kernel after about 125.

test("the arena frees every shape made inside it, factory- or method-made, and nothing made outside", () => {
  const kept = geo.box(10, 10, 10);
  let made = kept, moved = kept, cut = kept;
  const volume = geo.arena(() => {
    made = geo.box(5, 5, 5);
    moved = kept.translate([20, 0, 0]);
    cut = geo.diff(moved, [made]);
    return cut.volume();
  });
  expect(volume).toBeCloseTo(1000);
  for (const shape of [made, moved, cut]) expect(isDeleted(shape)).toBe(true);
  expect(isDeleted(kept)).toBe(false);
  kept.delete();
});

test("the arena frees on a throw and passes the error on", () => {
  let made = geo.box(1, 1, 1);
  made.delete();
  expect(() => geo.arena(() => { made = geo.box(1, 1, 1).translate([1, 0, 0]); throw new Error("kernel said no"); })).toThrow("kernel said no");
  expect(isDeleted(made)).toBe(true);
});

test("a shape already deleted inside the arena is skipped, not deleted twice", () => {
  expect(() => geo.arena(() => { geo.box(1, 1, 1).delete(); })).not.toThrow();
});

test("the heap levels off across rebuilds in an arena (the worker's build, Gridfinity with magnets)", () => {
  const o: Options = { ...DEFAULTS, base: "gridfinity", magnets: true };
  const build = () => {
    geo.arena(() => {
      for (const part of partList(buildAll(geo, o, solve(o)), o)) {
        meshDataOf(part.name, part.mesh.getMesh());
        filamentGrams(part.mesh);
      }
    });
    Bun.gc(true); // the typed arrays meshDataOf makes are garbage here; RSS keeps a JS peak
  };
  // the WASM heap grows to its working size and never gives it back: measure after that
  const residentMB = () => process.memoryUsage().rss / 1e6;
  for (let i = 0; i < 2; i++) build();
  const before = residentMB();
  for (let i = 0; i < 3; i++) build();
  const grownMB = residentMB() - before;
  expect(grownMB).toBeLessThan(20); // freeing nothing, three builds grow ~150 MB
}, 60_000);
