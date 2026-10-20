import { expect, test } from "bun:test";
import { DEFAULTS, K, type MixedBuildRequest, type MixedStackRequest } from "../src/model";
import { resolveMixedBuild } from "../src/solver";
import { mixedAssemblyPlacements, mixedPartManifest } from "../src/assembly";
import { SHARED_WALL_PIN_CREST } from "../src/features/shared-wall";
import { laneOf } from "../src/geometry";

const shelf = {w: 2000, d: 2000, h: 1000, front: 0};
const rows: MixedStackRequest[] = [122.5, 157].map(canHeight => ({canDiameter: 66, canHeight, depth: 240, tiers: 2}));
const requestOf = (stacks = rows, shared: Partial<MixedBuildRequest["shared"]> = {}): MixedBuildRequest => ({
  shared: {...DEFAULTS, base: "flat", cascade: false, slope: 0, ...shared}, stacks, shareCompatibleWalls: true,
});

test("sharing off preserves legacy origins, sources, capacities and optional metadata", () => {
  const request = requestOf();
  const {shareCompatibleWalls, ...legacy} = request;
  const before = JSON.stringify(legacy);
  const omitted = resolveMixedBuild(shelf, legacy);
  const disabled = resolveMixedBuild(shelf, {...request, shareCompatibleWalls: false});
  expect(omitted.boundaries).toBeUndefined();
  expect(disabled.boundaries).toBeUndefined();
  expect(omitted.stacks).toEqual(disabled.stacks);
  expect(mixedPartManifest(omitted)).toEqual(mixedPartManifest(disabled));
  expect(JSON.stringify(legacy)).toBe(before);
});

test("unequal lane widths share one whole boundary with exact shelf savings", () => {
  const request = requestOf();
  const original = JSON.stringify(request);
  const shared = resolveMixedBuild(shelf, request);
  const retained = resolveMixedBuild(shelf, {...request, shareCompatibleWalls: false});
  expect(shared.boundaries?.map(boundary => boundary.kind)).toEqual(["shared"]);
  expect(retained.footprint[0] - shared.footprint[0]).toBeCloseTo(K.gangGap + request.shared.wall, 10);
  expect(shared.stacks.map(stack => stack.cans)).toEqual(retained.stacks.map(stack => stack.cans));
  expect(shared.stacks.map(stack => stack.options.canL)).toEqual([122.5,157]);
  expect(shared.footprint[2] - retained.footprint[2]).toBeCloseTo(SHARED_WALL_PIN_CREST, 10);
  expect(JSON.stringify(request)).toBe(original);
  const exact = shared.footprint[0] + 8;
  expect(resolveMixedBuild({...shelf,w:exact},request).footprint[0]).toBe(shared.footprint[0]);
  expect(() => resolveMixedBuild({...shelf,w:exact-.001},request)).toThrow(/shelf width/);
});

test("different mechanics retain independent stacks with an explicit reason", () => {
  for (const change of [{depth: 241}, {tiers: 1}, {slope: 1}, {lipGap: 6}, {cover: false}, {rearLoad: true}, {stackable: true}]) {
    const request = requestOf([rows[0], {...rows[1],...change}]);
    const layout = resolveMixedBuild(shelf,request);
    expect(layout.boundaries?.[0].kind,JSON.stringify(change)).toBe("retained");
    expect(layout.connections).toHaveLength(1);
  }
  // An equal rounded wall height alone cannot establish a matching interface.
  const equalHeight = resolveMixedBuild(shelf,requestOf([{...rows[0],lipGap:5.1},{...rows[1],lipGap:5.2}]));
  expect(equalHeight.stacks[0].derived.H).toBe(equalHeight.stacks[1].derived.H);
  expect(equalHeight.boundaries?.[0].kind).toBe("retained");
});

test("equal rounded tier heights do not hide different cascade chute geometry", () => {
  const request = requestOf([{...rows[0],depth:480,canDiameter:66},{...rows[1],depth:480,canDiameter:66.1}],{cascade:true,slope:3});
  const layout = resolveMixedBuild(shelf,request);
  expect(layout.stacks[0].derived.H).toBe(layout.stacks[1].derived.H);
  expect(layout.stacks[0].derived.Hb).toBe(layout.stacks[1].derived.Hb);
  expect(layout.boundaries?.[0].kind).toBe("retained");
});

test("shared crest headroom preserves requested and automatically resolved tiers", () => {
  const request = requestOf(rows.map(row=>({...row,tiers:"auto"})));
  const baseline = resolveMixedBuild({...shelf,h:200},{...request,shareCompatibleWalls:false});
  const height = baseline.footprint[2];
  const layout = resolveMixedBuild({...shelf,h:height},request);
  expect(layout.boundaries?.[0].kind).toBe("retained");
  expect(layout.stacks.map(stack=>stack.options.tiers)).toEqual(baseline.stacks.map(stack=>stack.options.tiers));
  const boundary = layout.boundaries?.[0];
  if (boundary?.kind !== "retained") throw new Error("Expected retained headroom boundary");
  expect(boundary.reason).toContain("headroom");
});

test("printer envelopes include collar extension, crest, margins and exclusions", () => {
  for (const bed of [[246,145,256],[145,246,256]] as [number,number,number][]) {
    const request = requestOf([rows[0],rows[0]],{bed});
    const layout = resolveMixedBuild(shelf,request);
    expect(layout.boundaries?.[0].kind).toBe("retained");
    expect(layout.footprint[0]).toBe(279);
  }
  const excluded = requestOf([rows[0],rows[0]],{bedKeepOut:[[0,0,256,111]]});
  expect(resolveMixedBuild(shelf,excluded).boundaries?.[0].kind).toBe("retained");
});

test("retained spline identities stay attached to original neighbors in a hybrid row", () => {
  const request = requestOf([rows[0],rows[1],{...rows[0],canDiameter:53,depth:200}]);
  const layout = resolveMixedBuild(shelf,request);
  expect(layout.boundaries?.map(boundary=>boundary.kind)).toEqual(["shared","retained"]);
  expect(layout.connections.map(connection=>connection.firstStackIndex)).toEqual([1]);
  const sources = mixedPartManifest(layout).filter(part=>part.source.kind === "spline");
  expect(sources).toHaveLength(1);
  expect(sources[0].name).toBe("connection-2-spline");
  expect(sources[0].source).toEqual({kind:"spline",boundaryIndex:1,length:layout.connections[0].segmentLength});
  const placements = [...mixedAssemblyPlacements(layout)];
  for (const part of mixedPartManifest(layout)) expect(placements.filter(placement=>placement.name === part.name)).toHaveLength(part.qty);
});

test("repeated cascade roles canonicalize actual shared variants and omit all facing keys", () => {
  const request = requestOf(rows.map(row=>({...row,depth:640,tiers:6})),{cascade:true,slope:3});
  const layout = resolveMixedBuild(shelf,request);
  expect(layout.boundaries?.[0].kind).toBe("shared");
  const manifest = mixedPartManifest(layout);
  const decks = manifest.filter(part=>part.source.kind === "stack" && part.source.stackIndex === 0 && part.source.source.plate === "deck");
  // bottom, both mid hands, top: repeated identical mid tiers share their meshes.
  expect(new Set(decks.map(part=>part.source.kind === "stack" ? part.source.sharedTierIndex : undefined)).size).toBe(4);
  const wallKeys = manifest.filter(part=>part.source.kind === "stack" && part.source.source.kind === "key");
  expect(wallKeys.reduce((count,part)=>count+part.qty,0)).toBe(2*6*2*2 + 2*2*2);
  const sharedKeys = manifest.filter(part=>part.source.kind === "shared-key");
  expect(sharedKeys.reduce((count,part)=>count+part.qty,0)).toBe(6*2*2);
  const placements = [...mixedAssemblyPlacements(layout)];
  expect(placements.length).toBe(manifest.reduce((count,part)=>count+part.qty,0));
});

test("planned support intervals preserve the measured end and span bounds in every tier", () => {
  for (const depth of [240,260,480,640,900]) {
    const request = requestOf(rows.map(row=>({...row,depth,tiers:depth>260?6:2})),{cascade:depth>260,slope:3});
    const layout = resolveMixedBuild(shelf,request), boundary = layout.boundaries?.[0];
    expect(boundary?.kind,`depth ${depth}`).toBe("shared");
    if (boundary?.kind !== "shared") throw new Error("Expected supported shared boundary");
    for (const [tier,schedule] of boundary.tiers.entries()) {
      const stack = layout.stacks[0], lane = laneOf(stack.options,stack.derived,schedule.laneRole);
      const original = lane.tabs.slice().sort((first,second)=>first-second);
      const maximumInterval = Math.max(126,...original.slice(1).map((position,index)=>position-original[index]));
      const sign = schedule.reversed ? -1 : 1;
      const minimum = sign>0 ? lane.xd : -depth/2, maximum = sign>0 ? depth/2 : -lane.xd;
      for (const positions of [schedule.primaryEars,schedule.followerEars]) {
        expect(positions.length).toBeGreaterThanOrEqual(2);
        expect(positions[0]-minimum,`front ${depth}/${tier}`).toBeLessThanOrEqual(92+1e-8);
        expect(maximum-positions.at(-1)!,`rear ${depth}/${tier}`).toBeLessThanOrEqual(92+1e-8);
        for (let index=1;index<positions.length;index++) expect(positions[index]-positions[index-1]).toBeLessThanOrEqual(maximumInterval+1e-8);
      }
    }
  }
});

test("maximum eight-stack planning stays bounded without changing automatic capacity", () => {
  const request = requestOf(Array.from({length:8},()=>({canDiameter:20,canHeight:40,depth:2000,tiers:"auto" as const})),{bed:[1000,1000,1000]});
  const started = performance.now();
  const layout = resolveMixedBuild({...shelf,h:2000},request);
  expect(performance.now()-started).toBeLessThan(3000);
  expect(layout.boundaries).toHaveLength(7);
  expect(layout.stacks).toHaveLength(8);
  const original = resolveMixedBuild({...shelf,h:2000},{...request,shareCompatibleWalls:false});
  expect(layout.cans).toBe(original.cans);
});
