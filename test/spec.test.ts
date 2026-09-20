// docs/gridfinity-spec.md is the authority for every Gridfinity dimension, and CLAUDE.md
// makes it a rule: "if it and K disagree, one of them is wrong and both get fixed in the
// same commit". Nothing enforced that - the doc and the constants could drift apart
// silently, and a wrong pitch or foot chamfer would ship. The same cross-check already
// exists for index.html against LIMITS; this is that, for the spec.
import { test, expect } from "bun:test";
import { K } from "../src/geometry";

// Rows that map one constant to one number: a cell that is exactly `K.name` (prose in
// brackets after it is fine), and an earlier cell whose leading number is its value.
// Rows where the reference sits inside a formula are left out on purpose - `gridSpan(n)`
// = `n · 42 − 2 · K.gridGap` states a relationship, not gridGap's value.
const MAPPING = /^\|(.+?)\|\s*`K\.(\w+)`(?:\s*\([^)]*\))?\s*\|/;
const leadingNumber = (cell: string) => Number(/^[^\d-]*(-?[\d.]+)/.exec(cell.replace(/\*/g, ""))?.[1]);

test("every constant docs/gridfinity-spec.md names matches K", async () => {
  const doc = await Bun.file(new URL("../docs/gridfinity-spec.md", import.meta.url)).text();
  const checked: string[] = [];
  for (const line of doc.split("\n")) {
    const row = MAPPING.exec(line);
    if (!row) continue;
    const [, before, name] = row;
    const cells = before!.split("|").map((c) => c.trim()).filter(Boolean);
    const value = cells.map(leadingNumber).find(Number.isFinite);
    if (value === undefined) continue;
    expect(K[name as keyof typeof K], `${name} in docs/gridfinity-spec.md`).toBe(value);
    checked.push(name!);
  }
  // Or a doc edit that broke the table shape would leave this test asserting nothing.
  expect(checked.length, `constants cross-checked: ${checked.join(", ")}`).toBeGreaterThanOrEqual(8);
  expect(checked).toContain("gridPitch");
  expect(checked).toContain("magnetPitch");
});

// Rows the table parser cannot reach: the magnet pocket states a diameter and a depth in
// one cell, and footFlat is named in prose rather than in a mapping row. Both are pinned
// here by hand so no K constant in the doc is verified by nothing. It is the number gridfinity.test.ts cannot see at any tolerance:
// that test measures total pocket volume, so the pattern could move anywhere.
test("the magnet pocket is the 6.5 x 2.4 on a 26 mm square the spec draws", () => {
  expect(2 * K.magnetR).toBe(6.5);
  expect(K.magnetDepth).toBe(2.4);
  expect(K.magnetPitch).toBe(26);
  expect(K.magnetPitch).toBe(K.gridPitch - 2 * 8); // the spec's own derivation
  expect(K.footFlat).toBe(35.6); // the foot's flat width, docs/gridfinity-spec.md
  // and the profile the doc draws, bottom up, summing to one unit's foot
  expect(K.footChamferLo + K.footWall + K.footChamferHi).toBeCloseTo(4.75, 10);
  expect(K.footR - K.footChamferHi - K.footChamferLo).toBeCloseTo(0.8, 10); // derived bottom corner
});
