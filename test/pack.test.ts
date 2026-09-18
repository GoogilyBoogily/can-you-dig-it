// pack() is the only thing standing between the geometry and a slicer, and until now
// the only thing pinned about it was that it refuses an oversized part. These tests
// pin the two properties a print depends on - parts never overlap and never cross the
// margin - and the two the arrangement is judged on: every plate centred, and small
// parts filling the space behind a lane instead of claiming a plate of their own.
import { test, expect } from "bun:test";
import { pack, bboxOf, type MeshData, type Placement } from "../src/export";
import ref from "../ref.json";

const BED: [number, number, number] = [256, 256, 256];
const MARGIN = 3, GAP = 6;

/** A box the size of a real part's bounds. The packer reads bounds, so a box is the part. */
const boxOf = (name: string): MeshData => {
  const [lo, hi] = (ref as any)[name].bbox as [number[], number[]];
  const [x, y, z] = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const pos = new Float32Array([0, 0, 0, x, 0, 0, x, y, 0, 0, y, 0, 0, 0, z, x, 0, z, x, y, z, 0, y, z]);
  return { name, pos, idx: new Uint32Array([0, 1, 2]), bbox: bboxOf(pos) };
};

/** What the worker builds at DEFAULTS: two lanes wide, two tiers, cascade, no feet. */
const defaultParts = () => [
  { mesh: boxOf("lane-top-front"), qty: 2 },
  { mesh: boxOf("lane-top-rear"), qty: 2 },
  { mesh: boxOf("lane-bottom-front"), qty: 2 },
  { mesh: boxOf("lane-bottom-rear"), qty: 2 },
  { mesh: boxOf("end-lip"), qty: 2 },
  { mesh: boxOf("cover-front"), qty: 2 },
  { mesh: boxOf("cover-rear"), qty: 2 },
];

const byPlate = (placed: Placement[]) => {
  const plates = new Map<number, Placement[]>();
  for (const p of placed) plates.set(p.plate, [...(plates.get(p.plate) ?? []), p]);
  return [...plates.entries()].sort((a, b) => a[0] - b[0]).map(([, parts]) => parts);
};

/** Parts on one shelf share its centreline, whatever their own depth. */
const shelvesOf = (parts: Placement[]) => {
  const rows = new Map<string, Placement[]>();
  for (const p of parts) {
    const key = ((p.bbox[1] + p.bbox[4]) / 2).toFixed(3);
    rows.set(key, [...(rows.get(key) ?? []), p]);
  }
  return [...rows.values()];
};

const packed = pack(defaultParts(), BED, MARGIN, GAP);

test("no two parts on a plate overlap", () => {
  for (const parts of byPlate(packed))
    for (let i = 0; i < parts.length; i++)
      for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i].bbox, b = parts[j].bbox;
        const apart = a[3] <= b[0] + 1e-6 || b[3] <= a[0] + 1e-6 || a[4] <= b[1] + 1e-6 || b[4] <= a[1] + 1e-6;
        expect(apart, `${parts[i].name} overlaps ${parts[j].name}`).toBe(true);
      }
});

test("every part sits inside the margin and on the plate", () => {
  for (const p of packed) {
    expect(p.bbox[0], p.name).toBeGreaterThanOrEqual(MARGIN - 1e-3);
    expect(p.bbox[1], p.name).toBeGreaterThanOrEqual(MARGIN - 1e-3);
    expect(p.bbox[3], p.name).toBeLessThanOrEqual(BED[0] - MARGIN + 1e-3);
    expect(p.bbox[4], p.name).toBeLessThanOrEqual(BED[1] - MARGIN + 1e-3);
    expect(p.bbox[2], p.name).toBeCloseTo(0, 3);
  }
});

// A 250 mm lane pushed into the front-left corner is the worst place on a heated bed
// for it, and it reads as a broken arrangement when the 3MF opens in the Plater.
test("each shelf is centred across the bed", () => {
  for (const parts of byPlate(packed))
    for (const shelf of shelvesOf(parts)) {
      const left = Math.min(...shelf.map((p) => p.bbox[0]));
      const right = Math.max(...shelf.map((p) => p.bbox[3]));
      expect(left, shelf.map((p) => p.name).join("+")).toBeCloseTo(BED[0] - right, 3);
    }
});

test("a part shallower than its shelf sits on the shelf centreline, not its front edge", () => {
  for (const parts of byPlate(packed))
    for (const shelf of shelvesOf(parts)) {
      const middle = (Math.min(...shelf.map((p) => p.bbox[1])) + Math.max(...shelf.map((p) => p.bbox[4]))) / 2;
      for (const p of shelf) expect((p.bbox[1] + p.bbox[4]) / 2, p.name).toBeCloseTo(middle, 3);
    }
});

test("the shelves on a plate are centred front to back", () => {
  for (const parts of byPlate(packed)) {
    const front = Math.min(...parts.map((p) => p.bbox[1]));
    const back = Math.max(...parts.map((p) => p.bbox[4]));
    expect(front, parts.map((p) => p.name).join("+")).toBeCloseTo(BED[1] - back, 3);
  }
});

// A lane leaves a 250 × 109 mm strip behind it that nothing else in the set fits
// unturned. Turned 90°, an end-lip does - and the plate it used to need disappears.
test("small parts fill the space behind a lane instead of taking their own plate", () => {
  expect(byPlate(packed).length).toBe(12);
  for (const parts of byPlate(packed))
    expect(parts.every((p) => p.name.startsWith("end-lip"))).toBe(false);
});

test("a part is turned 90° only when that is what makes it fit", () => {
  const lanes = packed.filter((p) => p.name.startsWith("lane-"));
  // Lanes are 250 × 141 on a 250 × 250 usable bed: they fit flat, so they stay flat.
  for (const lane of lanes) expect(lane.bbox[3] - lane.bbox[0], lane.name).toBeGreaterThan(lane.bbox[4] - lane.bbox[1]);
});
