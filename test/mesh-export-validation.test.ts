import { expect, test } from "bun:test";
import { strFromU8, unzipSync } from "fflate";
import { buildAll, DEFAULTS, partList, solve } from "../src/geometry";
import { bboxOf, inspectMesh, meshDataOf, pack, stlBinary, stlZip, threeMf, type MeshData } from "../src/export";
import { solidFixture } from "./solid-fixture";
import { geo } from "./geo";

const triangle = (): MeshData => {
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  return { name: "test-part", pos, idx: new Uint32Array([0, 1, 2]), bbox: bboxOf(pos) };
};

test("export rejects non-finite coordinates and invalid triangle indices with part context", () => {
  for (const invalid of [
    { ...triangle(), pos: new Float32Array([NaN, 0, 0, 1, 0, 0, 0, 1, 0]) },
    { ...triangle(), idx: new Uint32Array([0, 1, 3]) },
    { ...triangle(), idx: new Uint32Array([0, 1]) },
  ]) {
    expect(() => stlBinary(invalid)).toThrow("test-part");
    expect(() => stlZip([invalid])).toThrow("test-part");
    expect(() => threeMf([{ ...invalid, plate: 0, part: invalid.name }], [256, 256, 256])).toThrow("test-part");
  }
});

test("kernel conversion requires closed outward-oriented positive-volume geometry", () => geo.arena(() => {
  const box = geo.box(10, 10, 10).getMesh();
  expect(meshDataOf("box", box).idx.length).toBeGreaterThan(0);
  expect(() => meshDataOf("missing-face", { ...box, triVerts: box.triVerts.slice(3) })).toThrow("oppositely paired");
  const reversed = new Uint32Array(box.triVerts);
  for (let index = 0; index < reversed.length; index += 3)
    [reversed[index], reversed[index + 1]] = [reversed[index + 1], reversed[index]];
  expect(() => meshDataOf("inside-out", { ...box, triVerts: reversed })).toThrow("positive finite volume");
}));

test("manufacturing exports reject open and inward-oriented geometry", () => {
  const inward = solidFixture("inside-out");
  for (let index = 0; index < inward.idx.length; index += 3)
    [inward.idx[index], inward.idx[index + 1]] = [inward.idx[index + 1], inward.idx[index]];
  for (const invalid of [triangle(), inward]) {
    expect(() => stlZip([invalid])).toThrow(invalid.name);
    expect(() => threeMf([{ ...invalid, plate: 0, part: invalid.name }], [256, 256, 256])).toThrow(invalid.name);
  }
});

const serializedObjects = (model: string) => [...model.matchAll(/<object [\s\S]*?<\/object>/g)].map((object) => ({
  pos: new Float64Array([...object[0].matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)]
    .flatMap((match) => match.slice(1).map(Number))),
  idx: new Uint32Array([...object[0].matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g)]
    .flatMap((match) => match.slice(1).map(Number))),
}));

// Independent arithmetic keeps the serializer and its production validator from
// agreeing on the same topology, winding, or precision bug.
const meshMeasurements = (mesh: { pos: ArrayLike<number>; idx: Uint32Array }) => {
  const directedEdges = new Map<string, number>();
  const zeroAreaFaces: number[] = [];
  let signedVolume = 0;
  for (let face = 0; face < mesh.idx.length / 3; face++) {
    const vertices = Array.from(mesh.idx.slice(face * 3, face * 3 + 3));
    for (let edge = 0; edge < 3; edge++) {
      const key = `${vertices[edge]}:${vertices[(edge + 1) % 3]}`;
      directedEdges.set(key, (directedEdges.get(key) ?? 0) + 1);
    }
    // Shift the determinant origin to a mesh vertex to avoid cancellation when
    // the plate grid translates objects far from world zero.
    const [first, second, third] = vertices.map((vertex) =>
      [0, 1, 2].map((axis) => mesh.pos[vertex * 3 + axis] - mesh.pos[axis]));
    signedVolume += (
      first[0] * (second[1] * third[2] - second[2] * third[1]) +
      first[1] * (second[2] * third[0] - second[0] * third[2]) +
      first[2] * (second[0] * third[1] - second[1] * third[0])
    ) / 6;
    const firstEdge = second.map((value, axis) => value - first[axis]);
    const secondEdge = third.map((value, axis) => value - first[axis]);
    const doubledArea = [
      firstEdge[1] * secondEdge[2] - firstEdge[2] * secondEdge[1],
      firstEdge[2] * secondEdge[0] - firstEdge[0] * secondEdge[2],
      firstEdge[0] * secondEdge[1] - firstEdge[1] * secondEdge[0],
    ];
    // Exact zero is intentional: a tiny valid face must never count as collapsed.
    if (doubledArea.every((component) => component === 0)) zeroAreaFaces.push(face);
  }
  const unpairedEdges = [...directedEdges].filter(([key, count]) => {
    const [start, end] = key.split(":");
    return start === end || count !== 1 || directedEdges.get(`${end}:${start}`) !== 1;
  });
  return { unpairedEdges, zeroAreaFaces, signedVolume };
};

test("3MF retains a tiny solid feature at full precision with every face intact", () => {
  const mesh = solidFixture("tiny-solid");
  mesh.pos[3] = 0.00001;
  mesh.bbox = bboxOf(mesh.pos);
  const files = unzipSync(threeMf([{ ...mesh, plate: 0, part: mesh.name }], [256, 256, 256]));
  const objects = serializedObjects(strFromU8(files["3D/3dmodel.model"]));
  expect(objects).toHaveLength(1);
  const serialized = { ...objects[0], name: mesh.name };
  expect([...serialized.pos]).toEqual([...mesh.pos]);
  expect([...serialized.idx]).toEqual([...mesh.idx]);
  expect(serialized.idx.length / 3).toBe(4);
  expect(inspectMesh(serialized, true)).toBe(0);
  const measurements = meshMeasurements(serialized);
  expect(measurements.unpairedEdges).toEqual([]);
  expect(measurements.zeroAreaFaces).toEqual([]);
  expect(measurements.signedVolume).toBeGreaterThan(0);
  expect(measurements.signedVolume).toBe(mesh.pos[3] * 20 * 30 / 6);
  expect(measurements).toEqual(meshMeasurements(mesh));
  expect(strFromU8(files["Metadata/model_settings.config"])).not.toContain("mesh_stat");
});

test("default serialized objects retain raw face counts, degeneracy, and closed topology", () => geo.arena(() => {
  const parts = partList(buildAll(geo, DEFAULTS, solve(DEFAULTS)), DEFAULTS)
    .map((part) => ({ mesh: meshDataOf(part.name, part.mesh.getMesh()), qty: part.qty }));
  const placed = pack(parts, DEFAULTS.bed, DEFAULTS.bedMargin);
  const files = unzipSync(threeMf(placed, DEFAULTS.bed));
  expect(strFromU8(files["Metadata/model_settings.config"])).not.toContain("mesh_stat");
  const objects = serializedObjects(strFromU8(files["3D/3dmodel.model"]));
  expect(objects).toHaveLength(placed.length);
  for (const [objectIndex, object] of objects.entries()) {
    const raw = placed[objectIndex];
    expect([...object.idx]).toEqual([...raw.idx]);
    expect(object.pos.length).toBe(raw.pos.length);
    expect(inspectMesh({ ...object, name: raw.name }, true)).toBe(inspectMesh(raw, true));
    const serializedMeasurements = meshMeasurements(object);
    const rawMeasurements = meshMeasurements(raw);
    expect(serializedMeasurements.unpairedEdges).toEqual([]);
    expect(rawMeasurements.unpairedEdges).toEqual([]);
    expect(serializedMeasurements.zeroAreaFaces).toEqual(rawMeasurements.zeroAreaFaces);
    expect(Number.isFinite(serializedMeasurements.signedVolume)).toBe(true);
    expect(serializedMeasurements.signedVolume).toBeGreaterThan(0);
    expect(rawMeasurements.signedVolume).toBeGreaterThan(0);
    expect(serializedMeasurements.signedVolume / rawMeasurements.signedVolume).toBeCloseTo(1, 9);
  }
}));
