// stlBinary and the plate grid had no coverage at all. The grid especially: it is
// reverse-engineered from BambuStudio's PartPlate.cpp, so nothing in this repo would
// notice if it drifted - the 3MF would simply open with parts stacked on one plate.
import { test, expect } from "bun:test";
import { strFromU8, unzipSync } from "fflate";
import { stlBinary, stlZip, threeMf, plateCols, plateOrigin, bboxOf, type MeshData, type Placement } from "../src/export";

const BED: [number, number, number] = [256, 256, 256];

/** One triangle in the z=0 plane, wound counter-clockwise, so its normal is exactly +Z. */
const triangle: MeshData = (() => {
  const pos = new Float32Array([0, 0, 0, 10, 0, 0, 0, 20, 0]);
  return { name: "triangle", pos, idx: new Uint32Array([0, 1, 2]), bbox: bboxOf(pos) };
})();

const readStl = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  const facets = [];
  for (let t = 0; t < count; t++) {
    const at = 84 + t * 50;
    const floats = [];
    for (let f = 0; f < 12; f++) floats.push(view.getFloat32(at + f * 4, true));
    facets.push({ normal: floats.slice(0, 3), vertices: [floats.slice(3, 6), floats.slice(6, 9), floats.slice(9, 12)] });
  }
  return { count, facets };
};

test("a binary STL is exactly 84 bytes of header plus 50 per triangle", () => {
  expect(stlBinary(triangle).length).toBe(84 + 1 * 50);
});

test("the STL header carries the triangle count", () => {
  expect(readStl(stlBinary(triangle)).count).toBe(1);
});

test("vertices are written in order, unchanged", () => {
  const { facets } = readStl(stlBinary(triangle));
  expect(facets[0].vertices).toEqual([[0, 0, 0], [10, 0, 0], [0, 20, 0]]);
});

// A slicer reads the winding, but a wrong-signed normal is how an inside-out mesh
// gets printed as a hole. This pins the cross-product order.
test("the facet normal is the unit normal of the winding", () => {
  const { facets } = readStl(stlBinary(triangle));
  expect(facets[0].normal).toEqual([0, 0, 1]);
});

test("stlZip names one entry per part", () => {
  const entries = unzipSync(stlZip([triangle, { ...triangle, name: "end-lip" }]));
  expect(Object.keys(entries).sort()).toEqual(["end-lip.stl", "triangle.stl"]);
});

// ---------------------------------------------------------------- Bambu plate grid

// PartPlate.hpp: compute_colum_count(n) = ceil(sqrt(n)). The implementation rounds
// instead, which is the same function - this is what says so.
test("the column count is ceil(sqrt(n)) for every plate count we can produce", () => {
  for (let n = 1; n <= 64; n++) expect(plateCols(n), `n=${n}`).toBe(Math.ceil(Math.sqrt(n)));
});

test("plate columns match BambuStudio at the boundaries", () => {
  expect([1, 2, 4, 5, 9, 10, 16, 17].map(plateCols)).toEqual([1, 2, 2, 3, 3, 4, 4, 5]);
});

// compute_origin: columns run +X, rows run -Y, stride is bed × 1.2.
test("plate origins step +X across a row and -Y down a column", () => {
  const stride = 256 * 1.2;
  expect(plateOrigin(0, 4, BED)).toEqual([0, -0]);
  expect(plateOrigin(1, 4, BED)).toEqual([stride, -0]);
  expect(plateOrigin(2, 4, BED)).toEqual([0, -stride]);
  expect(plateOrigin(3, 4, BED)).toEqual([stride, -stride]);
});

test("a 5th plate wraps onto a 3-wide grid", () => {
  const stride = 256 * 1.2;
  expect(plateCols(5)).toBe(3);
  expect(plateOrigin(3, 5, BED)).toEqual([0, -stride]);
  expect(plateOrigin(4, 5, BED)).toEqual([stride, -stride]);
});

// The grid is only useful if it reaches the geometry: objects are baked into place,
// and model_settings.config is belt-and-braces on top.
const onPlate = (plate: number): Placement => ({ ...triangle, name: `part-${plate}`, plate });

test("a 3MF bakes each object onto its plate origin", () => {
  const model = strFromU8(unzipSync(threeMf([onPlate(0), onPlate(1)], BED))["3D/3dmodel.model"]);
  const xs = [...model.matchAll(/<vertex x="([-\d.]+)"/g)].map((m) => Number(m[1]));
  const firstObject = xs.slice(0, 3);
  const secondObject = xs.slice(3, 6);
  expect(firstObject).toEqual([0, 10, 0]);
  expect(secondObject).toEqual(firstObject.map((x) => x + 256 * 1.2));
});

test("a 3MF declares one plate block per plate, with its objects", () => {
  const config = strFromU8(unzipSync(threeMf([onPlate(0), onPlate(1)], BED))["Metadata/model_settings.config"]);
  expect([...config.matchAll(/<plate>/g)]).toHaveLength(2);
  expect(config).toContain(`<metadata key="plater_id" value="1"/>`);
  expect(config).toContain(`<metadata key="plater_id" value="2"/>`);
});

// bbs_3mf.cpp sets m_is_bbl_3mf only when the Application metadata starts with
// "BambuStudio-", and parses the rest as the generator version. Anything else is a
// third-party file: project_settings.config is never read and Bambu Studio says
// "load geometry data only". The version must sit at or below the user's app version
// (a newer major is geometry-only again) and at or above 2.0.0 (older files get
// legacy plate-size and prime-tower rewrites).
test("a 3MF announces itself as a Bambu Studio project", () => {
  const model = strFromU8(unzipSync(threeMf([onPlate(0)], BED))["3D/3dmodel.model"]);
  expect(model).toContain(`<metadata name="Application">BambuStudio-02.00.00.00</metadata>`);
  expect(model).toContain(`<metadata name="BambuStudio:3mfVersion">1</metadata>`);
});
