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
const PLATES = 18;

/** A box the size of a real part's bounds. The packer reads bounds, so a box is the part. */
const boxOf = (name: string): MeshData => {
  const { min: lo, max: hi } = (ref as any)[name] as { min: number[]; max: number[] };
  const [x, y, z] = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const pos = new Float32Array([0, 0, 0, x, 0, 0, x, y, 0, 0, y, 0, 0, 0, z, x, 0, z, x, y, z, 0, y, z]);
  return { name, pos, idx: new Uint32Array([0, 1, 2]), bbox: bboxOf(pos) };
};

/** What the worker builds at DEFAULTS: two lanes wide, two tiers, cascade, no feet.
 *  Every plate of both lane roles, the long ones as split halves. */
const defaultParts = () => {
  const parts = [{ mesh: boxOf("end-lip"), qty: 2 }, { mesh: boxOf("cover-front"), qty: 2 }, { mesh: boxOf("cover-rear"), qty: 2 }];
  for (const role of ["top", "bottom"]) {
    for (const plate of ["deck", "wall-left", "wall-right"])
      for (const half of ["front", "rear"]) parts.push({ mesh: boxOf(`lane-${role}-${plate}-${half}`), qty: 2 });
    parts.push({ mesh: boxOf(`lane-${role}-end-wall`), qty: 2 });
  }
  return parts;
};

const byPlate = (placed: Placement[]) => {
  const plates = new Map<number, Placement[]>();
  for (const p of placed) plates.set(p.plate, [...(plates.get(p.plate) ?? []), p]);
  return [...plates.entries()].sort((a, b) => a[0] - b[0]).map(([, parts]) => parts);
};

/** Parts on one shelf share its centreline, whatever their own depth. Clustered with a
 *  tolerance, not keyed on a rounded string: the default gang's first shelf centres on
 *  87.2565, and toFixed(3) put the deck and its shelf-mates in different buckets. */
const shelvesOf = (parts: Placement[]) => {
  const rows: { centre: number; parts: Placement[] }[] = [];
  for (const p of parts) {
    const centre = (p.bbox[1] + p.bbox[4]) / 2;
    const row = rows.find((r) => Math.abs(r.centre - centre) < 1e-3);
    if (row) row.parts.push(p); else rows.push({ centre, parts: [p] });
  }
  return rows.map((r) => r.parts);
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

// A ganged deck is 155 deep with its tongues and leaves a 250 × 89 mm strip behind it;
// an end wall or an end-lip fits there flat, a wall (100) does not. Beside a 162 mm front
// half an end wall fits turned. PLATES for the default gang; the count is what the packer
// is judged on. It was 16 when decks were 138 deep and a wall went behind each one, 19
// while the rear wall halves carried an 8 mm splice tongue.
test("small parts fill the space behind a deck instead of taking their own plate", () => {
  expect(byPlate(packed).length).toBe(PLATES);
  for (const parts of byPlate(packed))
    expect(parts.every((p) => p.name.startsWith("end-lip") || p.name.endsWith("end-wall"))).toBe(false);
});

// The worker leaves gap off, so the default is the only spacing a print ever gets.
test("the default gap is the 6 mm the plate counts were measured at", () => {
  const byDefault = pack(defaultParts(), BED, MARGIN);
  expect(byDefault.map((p) => [p.name, p.plate, ...p.bbox])).toEqual(packed.map((p) => [p.name, p.plate, ...p.bbox]));
});

test("a part is turned 90° only when that is what makes it fit", () => {
  const long = packed.filter((p) => p.name.includes("-deck-") || p.name.includes("-wall-left-") || p.name.includes("-wall-right-"));
  // Decks are 248 × 155 and walls 248 × 100 on a 250 × 250 usable bed: they fit flat, so they stay flat.
  for (const part of long) expect(part.bbox[3] - part.bbox[0], part.name).toBeGreaterThan(part.bbox[4] - part.bbox[1]);
});

// The X1 and P1 series wipe the nozzle in an 18 × 28 mm front-left corner, and Bambu
// Studio refuses a plate with a part in it or within reach of it ("too close to
// exclusion area") - the default job did exactly that on plate 1. Every part keeps the
// margin clear of it, as of the bed's edge, and nothing else about the packing gives.
// A 240 mm part cannot pass beside the corner on a 256 bed, so the default job needs
// KEEPOUT_PLATES: measured when this landed.
const CORNER: [number, number, number, number] = [0, 0, 18, 28];
const KEEPOUT_PLATES = 20;
const withCorner = pack(defaultParts(), BED, MARGIN, GAP, [CORNER]);

test("the packer keeps the printer's keep-out corner clear", () => {
  for (const p of withCorner) {
    const clear = p.bbox[0] >= CORNER[2] + MARGIN - 1e-6 || p.bbox[1] >= CORNER[3] + MARGIN - 1e-6;
    expect(clear, `${p.name} on plate ${p.plate + 1} is in the keep-out`).toBe(true);
    expect(p.bbox[0], p.name).toBeGreaterThanOrEqual(MARGIN - 1e-3);
    expect(p.bbox[1], p.name).toBeGreaterThanOrEqual(MARGIN - 1e-3);
    expect(p.bbox[3], p.name).toBeLessThanOrEqual(BED[0] - MARGIN + 1e-3);
    expect(p.bbox[4], p.name).toBeLessThanOrEqual(BED[1] - MARGIN + 1e-3);
  }
  for (const parts of byPlate(withCorner))
    for (let i = 0; i < parts.length; i++)
      for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i].bbox, b = parts[j].bbox;
        expect(a[3] <= b[0] + 1e-6 || b[3] <= a[0] + 1e-6 || a[4] <= b[1] + 1e-6 || b[4] <= a[1] + 1e-6, `${parts[i].name} overlaps ${parts[j].name}`).toBe(true);
      }
  expect(byPlate(withCorner).length).toBe(KEEPOUT_PLATES);
  expect(withCorner.length).toBe(packed.length);
});

// Packing into the frame where the corner falls last saves plates across the solver's
// layouts (44 over 95 when measured); on the default job every corner costs the same,
// and the one it picks must still be clear however it lands.
test.each([[0, 0, 18, 28], [238, 0, 256, 28], [0, 228, 18, 256], [238, 228, 256, 256]].map((corner) => [corner.join(",")]))("a keep-out at %s is clear too", (at) => {
  const corner = at.split(",").map(Number) as [number, number, number, number];
  for (const p of pack(defaultParts(), BED, MARGIN, GAP, [corner])) {
    const [x0, y0, x1, y1] = corner;
    const clear = p.bbox[0] >= x1 + MARGIN - 1e-6 || p.bbox[3] <= x0 - MARGIN + 1e-6 || p.bbox[1] >= y1 + MARGIN - 1e-6 || p.bbox[4] <= y0 - MARGIN + 1e-6;
    expect(clear, p.name).toBe(true);
  }
});
