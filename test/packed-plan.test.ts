import { expect, test } from "bun:test";
import { strFromU8, unzipSync } from "fflate";
import { bboxOf, inspectMesh, meshDataOf, materializePlacement, pack, packPlan, plateOrigin, threeMf, type MeshData } from "../src/export";

import { buildAll, DEFAULTS, partList, solve } from "../src/geometry";
import { geo } from "./geo";

function box(name: string, width: number, depth: number, height: number): MeshData {
  const pos = new Float32Array([0, 0, 0, width, 0, 0, width, depth, 0, 0, depth, 0, 0, 0, height, width, 0, height, width, depth, height, 0, depth, height]);
  // Consistent outward winding, including the underside.
  const idx = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
  return { name, pos, idx, bbox: bboxOf(pos) };
}

test("compact plan materializes the compatibility pack with rigid winding-preserving rotations", () => {
  const mesh = box("long", 60, 20, 7);
  for (let index = 0; index < mesh.pos.length; index += 3) {
    mesh.pos[index] += 4; mesh.pos[index + 1] -= 9; mesh.pos[index + 2] += 3;
  }
  mesh.bbox = bboxOf(mesh.pos);
  const bed: [number, number, number] = [30, 70, 20];
  const parts = [{ mesh, qty: 4 }];
  const plan = packPlan(parts, bed, 3);
  const baked = pack(parts, bed, 3);
  expect(plan.geometries).toEqual([mesh]);
  expect(plan.placements).toHaveLength(4);
  for (const [index, placement] of plan.placements.entries()) {
    expect(placement.rotation90).toBe(true);
    expect(placement.geometry).toBe(0);
    expect("pos" in placement).toBe(false);
    const materialized = materializePlacement(mesh, placement);
    expect(materialized).toEqual(baked[index]);
    expect(materialized.idx).toBe(mesh.idx);
    expect(inspectMesh(materialized, true)).toBe(0);
    expect(placement.bbox).toEqual(materialized.bbox);
    expect(placement.bbox[2]).toBe(0);
    expect(placement.bbox[5]).toBe(7);
  }
});

test("plan keeps copy counts, margins, separation and keep-outs without reflecting geometry", () => {
  const bed: [number, number, number] = [90, 80, 30];
  const keepOut: [number, number, number, number][] = [[0, 0, 18, 28]];
  const plan = packPlan([{ mesh: box("wide", 40, 20, 4), qty: 9 }, { mesh: box("small", 10, 12, 3), qty: 7 }], bed, 3, 6, keepOut);
  expect(plan.placements.filter((placement) => placement.part === "wide")).toHaveLength(9);
  expect(plan.placements.filter((placement) => placement.part === "small")).toHaveLength(7);
  for (const placement of plan.placements) {
    const bounds = placement.bbox;
    expect(bounds[0]).toBeGreaterThanOrEqual(3);
    expect(bounds[1]).toBeGreaterThanOrEqual(3);
    expect(bounds[3]).toBeLessThanOrEqual(87);
    expect(bounds[4]).toBeLessThanOrEqual(77);
    expect(bounds[0] >= 21 || bounds[1] >= 31).toBe(true);
    expect(inspectMesh(materializePlacement(plan.geometries[placement.geometry], placement), true)).toBe(0);
    for (const other of plan.placements) if (placement !== other && placement.plate === other.plate) {
      const second = other.bbox;
      expect(bounds[3] + 6 <= second[0] || second[3] + 6 <= bounds[0] || bounds[4] + 6 <= second[1] || second[4] + 6 <= bounds[1]).toBe(true);
    }
  }
});

test("large copy quantities store and structured-clone each geometry buffer once", () => {
  const mesh = box("shared", 1, 1, 1);
  const plan = packPlan([{ mesh, qty: 1000 }], [256, 256, 256], 3);
  expect(plan.geometries).toHaveLength(1);
  expect(plan.geometries[0]).toBe(mesh);
  expect(plan.placements).toHaveLength(1000);
  expect(plan.placements.every((placement) => placement.geometry === 0 && !("pos" in placement) && !("idx" in placement))).toBe(true);
  const message = structuredClone({ parts: [{ mesh }], plan });
  expect(message.parts[0].mesh).toBe(message.plan.geometries[0]);
  expect(message.parts[0].mesh.pos.buffer).toBe(message.plan.geometries[0].pos.buffer);
});

test("compact plan 3MF bakes correct plate grid geometry and preserves imported profile bytes", () => {
  const bed: [number, number, number] = [30, 70, 20];
  const mesh = box('part & "quoted"', 60, 20, 7);
  const plan = packPlan([{ mesh, qty: 3 }], bed, 3);
  const profile = new Uint8Array([239, 187, 191, 123, 34, 120, 34, 58, 255, 125]);
  const files = unzipSync(threeMf(plan, bed, { profile }));
  expect(files["Metadata/project_settings.config"]).toEqual(profile);
  const model = strFromU8(files["3D/3dmodel.model"]);
  const config = strFromU8(files["Metadata/model_settings.config"]);
  expect(model).toContain("part &amp; &quot;quoted&quot;");
  expect(config).not.toContain("mesh_stat");
  const objects = [...model.matchAll(/<object [\s\S]*?<\/object>/g)];
  expect(objects).toHaveLength(3);
  for (const [index, object] of objects.entries()) {
    const placement = plan.placements[index];
    const [originX, originY] = plateOrigin(placement.plate, 3, bed);
    const positions = [...object[0].matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)].flatMap((match) => match.slice(1).map(Number));
    const expected = materializePlacement(mesh, placement).pos;
    for (let coordinate = 0; coordinate < positions.length; coordinate++) {
      const gridOffset = coordinate % 3 === 0 ? originX : coordinate % 3 === 1 ? originY : 0;
      expect(positions[coordinate]).toBeCloseTo(expected[coordinate] + gridOffset, 6);
    }
    expect(config).toContain(`<metadata key="plater_id" value="${placement.plate + 1}"/>`);
    expect(config).toContain(`<metadata key="object_id" value="${index + 1}"/>`);
  }
});

test("3MF verifies transformed coordinates rather than trusting compact plan bounds", () => {
  const plan = packPlan([{ mesh: box("valid", 10, 10, 10), qty: 1 }], [30, 30, 30], 3);
  plan.placements[0].translation[0] = 100;
  expect(() => threeMf(plan, [30, 30, 30])).toThrow("bounds do not match transformed geometry");
});


test("real default geometry exports from shared plan with closed topology and positive volume", () => geo.arena(() => {
  const parts = partList(buildAll(geo, DEFAULTS, solve(DEFAULTS)), DEFAULTS)
    .map((part) => ({ mesh: meshDataOf(part.name, part.mesh.getMesh()), qty: part.qty }));
  const plan = packPlan(parts, DEFAULTS.bed, DEFAULTS.bedMargin, 6, [[0, 0, 18, 28]]);
  expect(plan.geometries).toHaveLength(parts.length);
  expect(plan.placements).toHaveLength(parts.reduce((count, part) => count + part.qty, 0));
  const files = unzipSync(threeMf(plan, DEFAULTS.bed));
  const model = strFromU8(files["3D/3dmodel.model"]);
  const objects = [...model.matchAll(/<object [\s\S]*?<\/object>/g)];
  expect(objects).toHaveLength(plan.placements.length);
  for (const [index, object] of objects.entries()) {
    const positions = [...object[0].matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)].flatMap((match) => match.slice(1).map(Number));
    const indices = [...object[0].matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g)].flatMap((match) => match.slice(1).map(Number));
    expect(() => inspectMesh({ name: plan.placements[index].name, pos: positions, idx: new Uint32Array(indices) }, true)).not.toThrow();
  }
}));
