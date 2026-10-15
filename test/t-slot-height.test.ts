import { expect, test } from "bun:test";
import { OVER, tSlotJoint } from "../src/features/joints";
import { geo } from "./geo";

for (const [bottom, top] of [[-4, 15], [3.5, 28.25], [-19, -2]]) {
  test(`T splice covers its requested height ${bottom} to ${top}`, () => geo.arena(() => {
    const joint = tSlotJoint(geo, { neck: 12, head: 24, clearance: 0.4, zb: bottom, H: top,
      dimensions: { neckDepth: 5, depth: 14, overlap: 1.5 } });
    expect(joint.male.boundingBox().min[2]).toBe(bottom - OVER);
    expect(joint.male.boundingBox().max[2]).toBe(top);
    expect(joint.female.boundingBox().min[2]).toBe(bottom - OVER);
    expect(joint.female.boundingBox().max[2]).toBe(top + OVER);
    const topSlice = geo.box(2, 2, 0.1, -10, 0, top - 0.05);
    expect(geo.isect(joint.male, topSlice).volume()).toBeCloseTo(topSlice.volume(), 6);
    expect(geo.diff(joint.male, [joint.female]).volume()).toBeCloseTo(0, 6);
  }));
}
