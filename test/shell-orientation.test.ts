import { expect, test } from "bun:test";
import type { Manifold } from "manifold-3d";
import { inspectMesh, meshDataOf, type MeshData } from "../src/export";
import { geo } from "./geo";

function shellsOf(...shells: { shape: Manifold; inward?: boolean }[]): MeshData {
  const positions: number[] = [], indices: number[] = [];
  for (const { shape, inward } of shells) {
    const mesh = meshDataOf("source-shell", shape.getMesh());
    const offset = positions.length / 3;
    positions.push(...mesh.pos);
    for (let triangle = 0; triangle < mesh.idx.length; triangle += 3) {
      indices.push(offset + mesh.idx[triangle], offset + mesh.idx[triangle + (inward ? 2 : 1)], offset + mesh.idx[triangle + (inward ? 1 : 2)]);
    }
  }
  return { name: "shell-regression-part", pos: new Float32Array(positions), idx: new Uint32Array(indices), bbox: [0, 0, 0, 0, 0, 0] };
}

test("closed mesh rejects an inward disjoint shell even when total volume is positive", () => geo.arena(() => {
  const outside = geo.box(10, 10, 10), separated = geo.box(2, 2, 2, 20);
  expect(() => inspectMesh(shellsOf({ shape: outside }, { shape: separated, inward: true }), true)).toThrow("shell-regression-part: shell 1 orientation");
  expect(inspectMesh(shellsOf({ shape: outside }, { shape: separated }), true)).toBe(0);
}));

test("closed mesh accepts a cavity with an outward island and rejects wrong nesting signs", () => geo.arena(() => {
  const outside = geo.box(20, 20, 20), cavity = geo.box(10, 10, 10), island = geo.box(2, 2, 2);
  expect(inspectMesh(shellsOf({ shape: outside }, { shape: cavity, inward: true }), true)).toBe(0);
  expect(inspectMesh(shellsOf({ shape: outside }, { shape: cavity, inward: true }, { shape: island }), true)).toBe(0);
  expect(() => inspectMesh(shellsOf({ shape: outside }, { shape: cavity }), true)).toThrow("nesting depth 1");
  expect(() => inspectMesh(shellsOf({ shape: outside }, { shape: cavity, inward: true }, { shape: island, inward: true }), true)).toThrow("nesting depth 2");
}));

test("bounding-box containment does not mistake a through-hole for material", () => geo.arena(() => {
  const ring = geo.diff(geo.box(20, 20, 20), [geo.box(8, 8, 22)]);
  const inHole = geo.box(2, 2, 2);
  expect(inspectMesh(shellsOf({ shape: ring }, { shape: inHole }), true)).toBe(0);
  expect(() => inspectMesh(shellsOf({ shape: ring }, { shape: inHole, inward: true }), true)).toThrow("nesting depth 0");
}));
