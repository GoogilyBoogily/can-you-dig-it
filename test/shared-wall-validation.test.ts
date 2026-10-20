import { expect, test } from "bun:test";
import { mixedOptionsFrom, optionsFrom } from "../src/validate";

const fields: Record<string, string> = {
  w: "600", d: "520", h: "400", front: "0", canD: "66", canL: "122.5", bedX: "256", bedY: "256", bedZ: "256",
  hexR: "13", slope: "0", lipGap: "5", fit: "0", design: "standard", pattern: "hex", base: "flat", across: "centre", along: "centre",
  cover: "on", hexAuto: "on", left: "none", right: "none",
};
const stacks = [{ canDiameter: 66, canHeight: 122.5, depth: 240, tiers: 1 }, { canDiameter: 66, canHeight: 157, depth: 240, tiers: 1 }];
const fieldOf = (shareWalls: string | null) => (name: string) => name === "shareWalls" ? shareWalls : fields[name] ?? null;

test("mixed form opts in to sharing explicitly and keeps the legacy request absent otherwise", () => {
  for (const value of [null, "off"]) expect(Object.hasOwn(mixedOptionsFrom(fieldOf(value), stacks).request, "shareCompatibleWalls")).toBe(false);
  const request = mixedOptionsFrom(fieldOf("on"), stacks).request;
  expect(request.shareCompatibleWalls).toBe(true);
  expect(request.stacks).toEqual(stacks);
  expect(optionsFrom(fieldOf("on"))).toEqual(optionsFrom(fieldOf(null)));
});

test("mixed form rejects an unrecognized wall sharing value", () => {
  for (const value of ["true", "false", "1", "", "ON"]) expect(() => mixedOptionsFrom(fieldOf(value), stacks)).toThrow("Wall sharing must be on or off");
});
