import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DEFAULTS, solve } from "../src/geometry";

const options = { ...DEFAULTS, length: 520, slope: 0 };
const derived = solve(options);
const groups = [
  { part: "lane-deck-section-2", translation: [200, 200, 0], points: [[derived.seams[0] - 5, 0], [derived.seams[0] + 3, 0], [derived.seams[1] - 5, -24], [derived.seams[1] - 5, 24]] },
  { part: "lane-wall-left-closed-section-2", translation: [500, 500, 0], points: [[-7.2, derived.H - 0.4], [7.2, derived.H - 0.4], [-derived.seams[0] - 2, derived.H / 3], [-derived.seams[1] + 2, derived.H / 3]] },
  { part: "seam-key", translation: [900, 900, 0], points: [[3.5, -0.6], [3.5, 0.6], [-5.5, 0], [5.5, 0]] },
];
const target = [903.5, 899.4];

async function runProbe(commands: string[], rotation90 = false, extruderOffset = [0, 0]) {
  const directory = await mkdtemp(join(tmpdir(), "cyd-toolpath-check-"));
  const placements = groups.map(group => ({ name: group.part, part: group.part, translation: group.translation, rotation90, plate: 0 }));
  const strokes: string[] = [];
  for (const group of groups) for (const [index, point] of group.points.entries()) {
    if (group.part === "seam-key" && index === 0) continue;
    const [x, y] = (rotation90 ? [-point[1], point[0]] : point).map((value, axis) => value + group.translation[axis] - extruderOffset[axis]);
    strokes.push(`G0 X${x - 0.05} Y${y} Z0.2`, `G1 X${x + 0.05} E0.01`);
  }
  await Bun.write(join(directory, "evidence.json"), JSON.stringify({ options, placements }));
  await Bun.write(join(directory, "plate_1.gcode"), [
    ...["enable_support = 0", "layer_height = 0.2", "line_width = 0.5", "sparse_infill_density = 100%", "hot_plate_temp = 60"].map(setting => `; ${setting}`),
    `; extruder_offset = ${extruderOffset[0]}x${extruderOffset[1]}`, "G90", "M83", "; FEATURE: Outer wall", ...strokes, ...commands,
  ].join("\n"));
  const reportPath = join(directory, "report.json");
  const child = Bun.spawn([process.execPath, resolve("check-toolpaths.ts"), join(directory, "evidence.json"), directory, reportPath], { stdout: "pipe", stderr: "pipe" });
  const [exitCode, standardError] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  return { exitCode, standardError, reportPath };
}

for (const direction of ["G2", "G3"]) test(`first-layer probes follow ${direction} arcs rather than their chords`, async () => {
  const [x, y] = target;
  const result = await runProbe([
    `G0 X${x - 1} Y${y - 1} Z0.2`,
    `${direction} X${x + 1} Y${y - 1} I1 J0 E0.1`,
  ]);
  // Clockwise traverses the upper semicircle through the target. Counterclockwise
  // traverses the lower semicircle, two millimetres below the target.
  expect(result.exitCode).toBe(direction === "G2" ? 0 : 1);
  if (direction === "G2") {
    const report = await Bun.file(result.reportPath).json();
    expect(report.report[2].measurements[0].nearestCenterline).toBeLessThan(0.001);
  } else expect(result.standardError).toContain("nearest deposited line");
});

test("an arc updates the following line's start instead of creating false bridge coverage", async () => {
  const [x, y] = target;
  const result = await runProbe([
    `G0 X${x - 2} Y${y} Z0.2`,
    `G3 X${x - 2} Y${y + 2} I0 J1`,
    `G1 X${x + 2} Y${y} E0.1`,
  ]);
  expect(result.exitCode).toBe(1);
  expect(result.standardError).toContain("nearest deposited line");
});

test("a helical travel updates Z before subsequent extrusion", async () => {
  const [x, y] = target;
  const result = await runProbe([
    `G0 X${x - 1} Y${y} Z0.2`, "G3 Z0.6 I1 J0 P1", `G1 X${x + 1} E0.1`,
  ]);
  expect(result.exitCode).toBe(1);
  expect(result.standardError).toContain("nearest deposited line");
});

test("arc endpoints update absolute extrusion state", async () => {
  const [x, y] = target;
  const result = await runProbe([
    "M82", "G92 E0", `G0 X${x - 2} Y${y - 2} Z0.2`,
    `G2 X${x - 1} Y${y} I0 J1.25 E1`,
    `G1 X${x + 1} E1`,
  ]);
  expect(result.exitCode).toBe(1);
  expect(result.standardError).toContain("nearest deposited line");
});

test("relative XYZ and G91.1 preserve the correct coordinate mode", async () => {
  const [x, y] = target;
  const result = await runProbe([
    `G0 X${x - 2} Y${y} Z0.2`, "G91", "G0 X1", "G90", "G91.1", `G1 X${x + 1} E0.1`,
  ]);
  expect(result.exitCode).toBe(0);
});

test("functional probe positions follow the packed ninety-degree rotation", async () => {
  const result = await runProbe(["G0 X900.55 Y903.5 Z0.2", "G1 X900.65 E0.1"], true);
  expect(result.exitCode).toBe(0);
});

for (const arc of ["G2 X902.5 Y899.4 R1 E0.1", "G3 X902.5 Y899.4 I1 P2 E0.1", "G18"]) {
  test(`unsupported arc interpretation fails explicitly: ${arc}`, async () => {
    const result = await runProbe([`G0 X${target[0] - 1} Y${target[1]} Z0.2`, arc]);
    expect(result.exitCode).toBe(1);
    expect(result.standardError).toContain("unsupported");
  });
}


test("single-nozzle offsets restore deposition to packed model coordinates", async () => {
  const [x, y] = target;
  const result = await runProbe([`G0 X${x - 1} Y${y - 2} Z0.2`, `G1 X${x + 1} E0.1`], false, [0, 2]);
  expect(result.exitCode).toBe(0);
  const report = await Bun.file(result.reportPath).json();
  expect(report.report[2].measurements[0].nearestCenterline).toBeLessThan(1e-6);
});

test("counterclockwise extrusion follows the upper semicircle when its endpoints are reversed", async () => {
  const [x, y] = target;
  const result = await runProbe([`G0 X${x + 1} Y${y - 1} Z0.2`, `G3 X${x - 1} Y${y - 1} I-1 J0 E0.1`]);
  expect(result.exitCode).toBe(0);
  const report = await Bun.file(result.reportPath).json();
  expect(report.report[2].measurements[0].nearestCenterline).toBeLessThan(0.001);
});

test("G91.1 center-offset mode does not turn an absolute reverse stroke into a relative forward stroke", async () => {
  const [x, y] = target;
  const result = await runProbe([`G0 X${x + 1} Y${y} Z0.2`, "G90", "G91.1", `G1 X${x - 1} E0.1`]);
  expect(result.exitCode).toBe(0);
  const report = await Bun.file(result.reportPath).json();
  expect(report.report[2].measurements[0].nearestCenterline).toBeLessThan(1e-6);
});
