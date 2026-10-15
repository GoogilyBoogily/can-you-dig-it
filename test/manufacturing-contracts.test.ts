import { expect, test } from "bun:test";
import { geo } from "./geo";
import { bboxOf, meshDataOf, pack, stlZip, threeMf, type MeshData } from "../src/export";
import { estimateSettings, estimateVolume } from "../src/estimate";
import { strFromU8, unzipSync } from "fflate";

const bed: [number, number, number] = [256, 256, 256];
const open: MeshData = { name: "open-part", pos: new Float32Array([0,0,0, 1,0,0, 0,1,0]), idx: new Uint32Array([0,1,2]), bbox: [0,0,0,1,1,0] };

test("manufacturing exports reject open model geometry", () => {
  expect(() => stlZip([open])).toThrow("open-part");
  expect(() => threeMf([{ ...open, part: open.name, plate: 0 }], bed)).toThrow("open-part");
});

test("property vertex normals preserve kernel topology during conversion", () => geo.arena(() => {
  const mesh = geo.box(10,10,10).calculateNormals(0,30).getMesh();
  expect(mesh.numProp).toBe(6);
  expect(mesh.mergeFromVert.length).toBeGreaterThan(0);
  const plain = meshDataOf("normal-box", mesh);
  expect(plain.pos.length).toBe(24);
  expect(() => stlZip([plain])).not.toThrow();
}));

test("packing validates quantities, dimensions, and vertical build limits", () => geo.arena(() => {
  const mesh = meshDataOf("tall-part", geo.box(10,10,300).getMesh());
  expect(() => pack([{ mesh, qty: 1 }], bed, 3)).toThrow("height");
  for (const qty of [0,-1,1.5,NaN,Infinity]) expect(() => pack([{ mesh, qty }], bed, 3)).toThrow("quantity");
  expect(() => pack([], [NaN,256,256], 3)).toThrow("bed dimensions");
  expect(() => pack([], bed, 128)).toThrow("positive printable area");
}));

test("3MF preserves small valid geometry without rounding and invents no repair history", () => geo.arena(() => {
  const mesh = meshDataOf("tiny-box", geo.box(0.00001,1,1).getMesh());
  const files = unzipSync(threeMf(pack([{mesh,qty:1}], bed, 3), bed));
  const model = strFromU8(files["3D/3dmodel.model"]);
  const coordinates = [...model.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)].flatMap((match) => match.slice(1).map(Number));
  expect(new Set(coordinates.filter((_, index) => index % 3 === 0)).size).toBe(2);
  expect(strFromU8(files["Metadata/model_settings.config"])).not.toContain("mesh_stat");
}));

test("estimates resolve preset values, project overrides, asymmetric skins, and density", () => geo.arena(() => {
  const config = new TextEncoder().encode(JSON.stringify({wall_loops:"2",line_width:"0.5",nozzle_diameter:["0.4"], sparse_infill_density:"20%",layer_height:"0.2",top_shell_layers:"2",bottom_shell_layers:"4",filament_density:["1.04"]}));
  const settings = estimateSettings(config);
  expect(settings.shell).toBe(1);
  expect(settings.infill).toBe(0.2);
  expect(settings.topSkin).toBe(0.4);
  expect(settings.bottomSkin).toBe(0.8);
  expect(settings.density).toBe(1.04);
  const box = geo.box(20,20,20);
  const volume = estimateVolume(box, settings);
  expect(volume).toBeGreaterThan(box.volume()*0.2);
  expect(volume).toBeLessThan(box.volume());
  expect(estimateVolume(box, {...settings,infill:1})).toBeCloseTo(box.volume(),6);
  expect(estimateSettings().assumptions.length).toBeGreaterThan(0);
}));


test("malformed stored estimate settings fall back explicitly", () => {
  for (const value of ["not-json", "null", "[]"]) {
    const settings = estimateSettings(new TextEncoder().encode(value));
    expect(settings.assumptions).toContain("unreadable profile; reference print settings");
    expect(settings.density).toBe(1.27);
  }
});
