import { expect, test } from "bun:test";
import { estimateSettings } from "../src/estimate";

for (const lineWidth of ["105%", ["105%"]]) {
  test(`automatic wall widths inherit nozzle-relative generic line width ${JSON.stringify(lineWidth)}`, () => {
    const profile = new TextEncoder().encode(JSON.stringify({ nozzle_diameter: ["0.4"], line_width: lineWidth,
      outer_wall_line_width: "0", inner_wall_line_width: "0", wall_loops: "3" }));
    expect(estimateSettings(profile).shell).toBeCloseTo(1.26, 8);
  });
}

test("explicit wall widths retain precedence over the generic percentage fallback", () => {
  const profile = new TextEncoder().encode(JSON.stringify({ nozzle_diameter: ["0.6"], line_width: "110%",
    outer_wall_line_width: "0.5", inner_wall_line_width: "0", wall_loops: "3" }));
  expect(estimateSettings(profile).shell).toBeCloseTo(1.82, 8);
});
