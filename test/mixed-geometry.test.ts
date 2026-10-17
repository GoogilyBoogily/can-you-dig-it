import { expect, test } from "bun:test";
import { strFromU8, unzipSync } from "fflate";
import { DEFAULTS, type MixedBuildRequest, type Options } from "../src/model";
import { resolveMixedBuild } from "../src/solver";
import { mixedAssemblyCans, mixedAssemblyPlacements, mixedPartManifest, partManifest } from "../src/assembly";
import { buildAll, partList, solve } from "../src/geometry";
import { queueGeometry } from "../src/queue";
import { buildMixedGeometry } from "../src/mixed-geometry";
import { stand } from "../src/features/pose";
import { meshDataOf, packPlan, threeMf, stlZip } from "../src/export";
import { geo, overhangArea } from "./geo";

const request: MixedBuildRequest = { shared: { ...DEFAULTS, base:"flat", cascade:false }, stacks: [
  { canDiameter:66,canHeight:122.5,depth:480,tiers:2 },
  { canDiameter:53,canHeight:134,depth:360,tiers:3 },
  { canDiameter:66,canHeight:122.5,depth:300,tiers:1 },
] };

for (const fit of [-0.2,0,0.3]) {
  test(`mixed full flat build fit ${fit}: exact manifest, physical sources, complete placements and export inventory`, () => geo.arena(() => {
    const layout = resolveMixedBuild({w:600,d:600,h:400,front:40},{...request,shared:{...request.shared,fit}});
    expect(layout.stacks.map((stack) => stack.cans)).toEqual([12,18,4]);
    expect(layout.cans).toBe(34);
    const manifest = mixedPartManifest(layout), parts = buildMixedGeometry(geo,layout);
    const placements = [...mixedAssemblyPlacements(layout)];
    expect(new Set(parts.map((part) => part.name)).size).toBe(parts.length);
    expect(parts.map(({name,qty}) => ({name,qty}))).toEqual(manifest.map(({name,qty}) => ({name,qty})));
    const counts = new Map<string,number>();
    for (const placement of placements) counts.set(placement.name,(counts.get(placement.name) ?? 0) + 1);
    expect(counts).toEqual(new Map(parts.map((part) => [part.name,part.qty])));
    for (const part of parts) {
      expect(part.mesh.status(),part.name).toBe("NoError");
      expect(part.mesh.decompose().length,part.name).toBe(1);
      expect(overhangArea(part.mesh),part.name).toBeLessThan(1e-6);
      expect(part.mesh.boundingBox().min[2],part.name).toBeCloseTo(0,6);
    }
    const printable = parts.map((part) => ({mesh:meshDataOf(part.name,part.mesh.getMesh()),qty:part.qty}));
    const plan = packPlan(printable,request.shared.bed,request.shared.bedMargin);
    expect(plan.placements.length).toBe(placements.length);
    expect(plan.placements.length).toBe(100);
    expect(parts.length).toBe(41);
    expect([1,2,3].map((index) => plan.placements.filter(({part}) => part.startsWith(`stack-${index}-`)).length)).toEqual([28,40,16]);
    expect([1,2].map((index) => plan.placements.filter(({part}) => part === `connection-${index}-spline`).length)).toEqual([9,7]);
    const project = unzipSync(threeMf(plan,request.shared.bed));
    expect(project["3D/3dmodel.model"]).toBeDefined();
    const model = strFromU8(project["3D/3dmodel.model"]), configuration = strFromU8(project["Metadata/model_settings.config"]);
    const objectNames = [...model.matchAll(/<object id="\d+" type="model" name="([^"]+)"/g)].map((match) => match[1]);
    expect(objectNames).toEqual(plan.placements.map(({name}) => name));
    const buildIds = [...model.matchAll(/<item objectid="(\d+)"/g)].map((match) => Number(match[1]));
    expect(buildIds).toEqual(Array.from({length:100},(_,index) => index + 1));
    const plateIds = [...configuration.matchAll(/<metadata key="object_id" value="(\d+)"/g)].map((match) => Number(match[1]));
    expect(plateIds.sort((first,second) => first - second)).toEqual(buildIds);
    const stls = unzipSync(stlZip(printable.map((part) => part.mesh)));
    expect(Object.keys(stls).length).toBe(parts.length);
    const catalogue = new Map(parts.map((part) => [part.name,part.mesh]));
    const standing = placements.map((placement) => ({name:placement.name,mesh:stand(catalogue.get(placement.name)!,placement.pose)}));
    for (let first = 0; first < standing.length; first++) for (let second = first + 1; second < standing.length; second++) {
      const firstBounds = standing[first].mesh.boundingBox(), secondBounds = standing[second].mesh.boundingBox();
      if (![0,1,2].every((axis) => Math.min(firstBounds.max[axis],secondBounds.max[axis]) - Math.max(firstBounds.min[axis],secondBounds.min[axis]) > 1e-6)) continue;
      expect(geo.isect(standing[first].mesh,standing[second].mesh).volume(),`${standing[first].name}/${standing[second].name}`).toBeLessThan(1e-5);
    }
    const cylinders = layout.stacks.map(({options}) => geo.cyl(options.canD / 2,options.canL,0,0,-options.canL / 2).rotate([90,0,0]));
    for (const placement of mixedAssemblyCans(layout)) {
      const options = layout.stacks[placement.stackIndex].options;
      for (const across of [-options.clearance / 2,0,options.clearance / 2]) {
        const can = stand(cylinders[placement.stackIndex],placement.pose).translate([0,across,0]);
        const canBounds = can.boundingBox();
        for (const part of standing) {
          const bounds = part.mesh.boundingBox();
          if (![0,1,2].every((axis) => Math.min(canBounds.max[axis],bounds.max[axis]) - Math.max(canBounds.min[axis],bounds.min[axis]) > 1e-6)) continue;
          expect(geo.isect(can,part.mesh).volume(),`can/${part.name} axial ${across}`).toBeLessThan(1e-5);
        }
      }
    }
    const connectionNames = new Set(manifest.filter(({source}) => source.kind === "spline" || source.connection).map(({name}) => name));
    const connectionParts = standing.filter(({name}) => connectionNames.has(name));
    for (const stack of layout.stacks) {
      const queue = queueGeometry(stack.options,stack.derived.L,false);
      for (let step = 0; step <= 20; step++) {
        const x = queue.first + (queue.last - queue.first) * step / 20;
        const height = 4 + (x - queue.deckStart) * stack.derived.tan + stack.options.canD / 2 * Math.hypot(1,stack.derived.tan);
        for (const across of [-stack.options.clearance / 2,stack.options.clearance / 2]) {
          const can = cylinders[stack.index].translate([x + stack.origin[0],stack.origin[1] + across,height]);
          for (const part of connectionParts) expect(geo.isect(can,part.mesh).volume(),`rolling can/${part.name}`).toBeLessThan(1e-5);
        }
      }
    }
  }));
}

for (const fit of [-0.2,0,0.3]) {
  test(`mixed cascade fit ${fit}: reversed tiers, repeated source roles and complete can paths assemble`, () => geo.arena(() => {
    const layout = resolveMixedBuild({w:600,d:600,h:400,front:40},{...request,
      shared:{...request.shared,cascade:true,fit},stacks:request.stacks.map((stack,index) => ({...stack,tiers:index === 1 ? 3 : 2}))});
    expect(layout.stacks.map(({cans}) => cans)).toEqual([11,16,7]);
    expect(layout.cans).toBe(34);
    const parts = buildMixedGeometry(geo,layout), manifest = mixedPartManifest(layout);
    const catalogue = new Map(parts.map((part) => [part.name,part.mesh]));
    const placed = [...mixedAssemblyPlacements(layout)].map((placement) => ({name:placement.name,mesh:stand(catalogue.get(placement.name)!,placement.pose)}));
    expect(placed.length).toBe(108);
    for (const part of parts) {
      expect(part.mesh.status(),part.name).toBe("NoError");
      expect(part.mesh.decompose().length,part.name).toBe(1);
      expect(overhangArea(part.mesh),part.name).toBeLessThan(1e-6);
    }
    for (let first = 0; first < placed.length; first++) for (let second = first + 1; second < placed.length; second++) {
      const firstBounds = placed[first].mesh.boundingBox(), secondBounds = placed[second].mesh.boundingBox();
      if (![0,1,2].every((axis) => Math.min(firstBounds.max[axis],secondBounds.max[axis]) - Math.max(firstBounds.min[axis],secondBounds.min[axis]) > 1e-6)) continue;
      expect(geo.isect(placed[first].mesh,placed[second].mesh).volume(),`${placed[first].name}/${placed[second].name}`).toBeLessThan(1e-5);
    }
    const connections = new Set(manifest.filter(({source}) => source.kind === "spline" || source.connection).map(({name}) => name));
    const connectionParts = placed.filter(({name}) => connections.has(name));
    const cylinders = layout.stacks.map(({options}) => geo.cyl(options.canD / 2,options.canL,0,0,-options.canL / 2).rotate([90,0,0]));
    for (const placement of mixedAssemblyCans(layout)) {
      const stack = layout.stacks[placement.stackIndex];
      for (const across of [-stack.options.clearance / 2,stack.options.clearance / 2]) {
        const can = stand(cylinders[placement.stackIndex],placement.pose).translate([0,across,0]);
        for (const part of connectionParts) expect(geo.isect(can,part.mesh).volume()).toBeLessThan(1e-5);
      }
    }
    // Every point of a constant-axis cylinder rolling between neighboring queue
    // positions is covered by this translational hull, including its slope offset.
    for (const stack of layout.stacks) {
      const queue = queueGeometry(stack.options,stack.derived.L,true);
      for (const across of [-stack.options.clearance / 2,stack.options.clearance / 2]) {
        const first = queue.position(0), last = queue.position(queue.count - 1);
        const from = cylinders[stack.index].translate([first[0] + stack.origin[0],stack.origin[1] + across,first[2]]);
        const to = cylinders[stack.index].translate([last[0] + stack.origin[0],stack.origin[1] + across,last[2]]);
        const swept = geo.hull([from,to]);
        for (const part of connectionParts) expect(geo.isect(swept,part.mesh).volume(),`swept can/${part.name}`).toBeLessThan(1e-5);
      }
    }
  }));
}

test("mixed complete bottom subassemblies meet a roll barrier before spline heads can pass their mouths", () => geo.arena(() => {
  for (const fit of [-0.2,0,0.3]) {
    const layout = resolveMixedBuild({w:600,d:600,h:400,front:40},{...request,shared:{...request.shared,cascade:true,fit},
      stacks:[{canDiameter:66,canHeight:122.5,depth:480,tiers:2},{canDiameter:53,canHeight:134,depth:381,tiers:3}]});
    const catalogue = new Map(buildMixedGeometry(geo,layout).map((part) => [part.name,part.mesh]));
    const sources = new Map(mixedPartManifest(layout).map((part) => [part.name,part.source]));
    const standing = [...mixedAssemblyPlacements(layout)].map((placement) => ({...placement,source:sources.get(placement.name)!,mesh:stand(catalogue.get(placement.name)!,placement.pose)}));
    const bottom = standing.filter((part) => part.source.kind === "spline" || part.source.kind === "stack" && (
      part.source.source.kind === "lane" && part.source.source.laneRole === "bottom" || part.source.source.kind === "lip"
      || part.source.source.kind === "key" && part.pose.translate[2] < layout.stacks[part.source.stackIndex].derived.Hb));
    const fixed = geo.union(bottom.filter(({source}) => source.kind === "spline" || source.stackIndex === 0).map(({mesh}) => mesh));
    const moving = geo.union(bottom.filter(({source}) => source.kind === "stack" && source.stackIndex === 1).map(({mesh}) => mesh));
    expect(geo.isect(fixed,moving).volume()).toBeLessThan(1e-5);
    const connection = layout.connections[0], first = layout.stacks[0];
    const pivot = [(connection.endFromFront + connection.startFromFront) / 2,first.origin[1] + first.derived.OW / 2,connection.secondHeight] as [number,number,number];
    // The head's rotated vertical half-width must fall below the female mouth before
    // it could leave laterally. Require actual assembly collision before that angle.
    const radius = 2.85 - Math.SQRT2 * (0.25 + fit), escapeAngle = Math.acos((2.85 - 1.2) / radius) * 180 / Math.PI;
    for (const direction of [-1,1]) {
      let obstruction: number | undefined;
      for (let angle = 0.25; angle < escapeAngle; angle += 0.25) {
        const rotated = moving.translate([-pivot[0],-pivot[1],-pivot[2]]).rotate([direction * angle,0,0]).translate(pivot);
        if (geo.isect(fixed,rotated).volume() > 1e-5) {obstruction = angle;break;}
      }
      expect(obstruction,`fit ${fit}, roll ${direction}`).toBeDefined();
      expect(obstruction!).toBeLessThan(escapeAngle);
    }
  }
}));

for (const fit of [-0.2,0,0.3]) {
  test(`per-stack settings fit ${fit}: unlike styles, slopes, loading and covers produce the requested complete assembly`, () => geo.arena(() => {
    const localSettings: MixedBuildRequest = {
      // Deliberately contrary defaults exercise explicit false and zero overrides.
      shared:{...DEFAULTS,base:"flat",cascade:false,slope:7,lipGap:2,cover:true,rearLoad:true,stackable:true,fit},
      stacks:[
        {canDiameter:66,canHeight:122.5,depth:240,tiers:1,cascade:false,slope:0,lipGap:5,cover:true,rearLoad:false,stackable:false},
        {canDiameter:53,canHeight:134,depth:300,tiers:3,cascade:true,slope:3,lipGap:8,cover:false,rearLoad:true,stackable:false},
      ],
    };
    const layout = resolveMixedBuild({w:500,d:500,h:400,front:40},localSettings);
    expect(layout.stacks.map(({options}) => [options.cascade,options.slope,options.lipGap,options.cover,options.rearLoad,options.stackable]))
      .toEqual([[false,0,5,true,false,false],[true,3,8,false,true,false]]);
    // Flat row: three cans and six whole pieces. Cascading row: 5+4+4 cans;
    // 18 split deck/wall pieces, 12 wall keys, two end walls and one lip.
    expect(layout.stacks.map(({cans}) => cans)).toEqual([3,13]);
    expect(layout.cans).toBe(16);
    expect(layout.stacks.map(({derived}) => [derived.H,derived.Hb,derived.split])).toEqual([[95,95,false],[72,86,true]]);
    expect(layout.footprint).toEqual([290.5,300,230]);
    expect(layout.connections[0].endFromFront).toBe(222);
    expect(layout.connections[0].segmentCount).toBe(6);
    expect(layout.connections[0].segmentLength * 6).toBeCloseTo(208 - 2 * (0.25 + fit),8);

    const manifest = mixedPartManifest(layout), parts = buildMixedGeometry(geo,layout);
    const placements = [...mixedAssemblyPlacements(layout)];
    const catalogue = new Map(parts.map((part) => [part.name,part.mesh]));
    const sourceByName = new Map(manifest.map((part) => [part.name,part.source]));
    const standing = placements.map((placement) => ({...placement,source:sourceByName.get(placement.name)!,mesh:stand(catalogue.get(placement.name)!,placement.pose)}));
    expect(parts.length).toBe(29);
    expect(placements.length).toBe(45);
    expect([0,1].map((index) => standing.filter(({source}) => source.kind === "stack" && source.stackIndex === index).length)).toEqual([6,33]);
    expect(standing.filter(({source}) => source.kind === "spline").length).toBe(6);
    const counts = new Map<string,number>();
    for (const placement of placements) counts.set(placement.name,(counts.get(placement.name) ?? 0) + 1);
    expect(counts).toEqual(new Map(parts.map(({name,qty}) => [name,qty])));
    expect(manifest.filter(({source}) => source.kind === "stack" && source.source.kind === "cover").map(({source}) => source.kind === "stack" && source.stackIndex)).toEqual([0]);
    expect(manifest.filter(({source}) => source.kind === "stack" && source.stackIndex === 1 && source.source.plate === "end-wall").map(({source}) => source.kind === "stack" && source.source.laneRole)).toEqual(["bottom","mid"]);

    const firstDeck = manifest.find(({source}) => source.kind === "stack" && source.stackIndex === 0 && source.source.plate === "deck")!;
    expect(catalogue.get(firstDeck.name)!.boundingBox().max[2]).toBeCloseTo(4,7);
    const slopingDeck = manifest.find(({source}) => source.kind === "stack" && source.stackIndex === 1 && source.source.laneRole === "bottom" && source.source.plate === "deck" && source.source.half === "rear")!;
    expect(catalogue.get(slopingDeck.name)!.boundingBox().max[2]).toBeCloseTo(4 + 291 * Math.tan(3 * Math.PI / 180),6);
    const middleDecks = standing.filter(({source}) => source.kind === "stack" && source.stackIndex === 1 && source.source.laneRole === "mid" && source.source.plate === "deck");
    expect(middleDecks.length).toBe(2);
    for (const placement of middleDecks) expect(placement.pose).toEqual({rotate:[0,0,180],translate:[150,146.75,86]});
    const upperDecks = standing.filter(({source}) => source.kind === "stack" && source.stackIndex === 1 && source.source.laneRole === "top" && source.source.plate === "deck");
    expect(upperDecks.length).toBe(2);
    for (const placement of upperDecks) expect(placement.pose).toEqual({rotate:[0,0,0],translate:[150,146.75,158]});
    const openUpperWalls = standing.filter(({source}) => source.kind === "stack" && source.stackIndex === 1 && source.source.laneRole === "top" && source.source.plate?.startsWith("wall-"));
    expect(openUpperWalls.length).toBe(4);
    for (const wall of openUpperWalls) expect(wall.mesh.boundingBox().max[2]).toBeCloseTo(230,6);

    // Independent standalone specifications verify each ordinary source remains the
    // exact legacy solid for that row, rather than borrowing the shared defaults.
    const referenceOptions: Options[] = [
      {...DEFAULTS,fit,base:"flat",lanesWide:1,left:"none",right:"none",canD:66,canL:122.5,length:240,tiers:1,cascade:false,slope:0,lipGap:5,cover:true,rearLoad:false,stackable:false},
      {...DEFAULTS,fit,base:"flat",lanesWide:1,left:"none",right:"none",canD:53,canL:134,length:300,tiers:3,cascade:true,slope:3,lipGap:8,cover:false,rearLoad:true,stackable:false},
    ];
    for (const [index,options] of referenceOptions.entries()) {
      const derived = solve(options), referenceManifest = partManifest(options,derived);
      const references = new Map(partList(buildAll(geo,options,derived),options).map((part) => [part.name,part.mesh]));
      for (const descriptor of manifest) {
        const source = descriptor.source;
        if (source.kind !== "stack" || source.stackIndex !== index || source.connection) continue;
        const reference = referenceManifest.find((part) => JSON.stringify(part.source) === JSON.stringify(source.source));
        expect(reference,descriptor.name).toBeDefined();
        const actual = catalogue.get(descriptor.name)!, expected = references.get(reference!.name)!;
        expect(geo.diff(actual,[expected]).volume(),descriptor.name).toBeLessThan(1e-5);
        expect(geo.diff(expected,[actual]).volume(),descriptor.name).toBeLessThan(1e-5);
      }
    }
    for (const part of parts) {
      expect(part.mesh.status(),part.name).toBe("NoError");
      expect(part.mesh.decompose().length,part.name).toBe(1);
      expect(overhangArea(part.mesh),part.name).toBeLessThan(1e-6);
      expect(part.mesh.boundingBox().min[2],part.name).toBeCloseTo(0,6);
    }
    for (let first = 0; first < standing.length; first++) for (let second = first + 1; second < standing.length; second++) {
      const firstBounds = standing[first].mesh.boundingBox(), secondBounds = standing[second].mesh.boundingBox();
      if (![0,1,2].every((axis) => Math.min(firstBounds.max[axis],secondBounds.max[axis]) - Math.max(firstBounds.min[axis],secondBounds.min[axis]) > 1e-6)) continue;
      expect(geo.isect(standing[first].mesh,standing[second].mesh).volume(),`${standing[first].name}/${standing[second].name}`).toBeLessThan(1e-5);
    }
    const cylinders = layout.stacks.map(({options}) => geo.cyl(options.canD / 2,options.canL,0,0,-options.canL / 2).rotate([90,0,0]));
    const cans = [...mixedAssemblyCans(layout)];
    expect(cans.length).toBe(16);
    for (const placement of cans) for (const across of [-1.75,0,1.75]) {
      const can = stand(cylinders[placement.stackIndex],placement.pose).translate([0,across,0]), canBounds = can.boundingBox();
      for (const part of standing) {
        const bounds = part.mesh.boundingBox();
        if (![0,1,2].every((axis) => Math.min(canBounds.max[axis],bounds.max[axis]) - Math.max(canBounds.min[axis],bounds.min[axis]) > 1e-6)) continue;
        expect(geo.isect(can,part.mesh).volume(),`stack ${placement.stackIndex + 1} can/${part.name} axial ${across}`).toBeLessThan(1e-5);
      }
    }
    const rearStack = layout.stacks[1], rearQueue = queueGeometry(rearStack.options,rearStack.derived.L,false);
    const lastCan = rearQueue.position(rearQueue.count - 1), outsideX = 150 + 26.5 + 10;
    const outsideHeight = 4 + (outsideX - rearQueue.deckStart) * Math.tan(3 * Math.PI / 180) + 26.5 * Math.hypot(1,Math.tan(3 * Math.PI / 180));
    for (const across of [-1.75,1.75]) {
      const from = cylinders[1].translate([lastCan[0] + 150,146.75 + across,158 + lastCan[2]]);
      const to = cylinders[1].translate([outsideX + 150,146.75 + across,158 + outsideHeight]);
      const rearLoadingSweep = geo.hull([from,to]);
      for (const part of standing) expect(geo.isect(rearLoadingSweep,part.mesh).volume(),`rear loading/${part.name}`).toBeLessThan(1e-5);
    }
    const plan = packPlan(parts.map(({name,mesh,qty}) => ({mesh:meshDataOf(name,mesh.getMesh()),qty})),localSettings.shared.bed,localSettings.shared.bedMargin);
    expect(plan.placements.length).toBe(45);
    const project = unzipSync(threeMf(plan,localSettings.shared.bed));
    const model = strFromU8(project["3D/3dmodel.model"]);
    expect([...model.matchAll(/<item objectid="\d+"/g)].length).toBe(45);
  }));
}

test("per-stack join-on-top preserves only that uncovered row's actual pins", () => geo.arena(() => {
  const base: MixedBuildRequest = {shared:{...DEFAULTS,base:"flat",cascade:false,cover:false,stackable:false},stacks:[
    {canDiameter:66,canHeight:122.5,depth:240,tiers:1,cascade:false,slope:0,lipGap:5,cover:false,rearLoad:false,stackable:true},
    {canDiameter:53,canHeight:134,depth:300,tiers:3,cascade:true,slope:3,lipGap:8,cover:false,rearLoad:true,stackable:false},
  ]};
  const joined = resolveMixedBuild({w:500,d:500,h:400,front:40},base);
  const closed = resolveMixedBuild({w:500,d:500,h:400,front:40},{...base,stacks:base.stacks.map((stack) => ({...stack,stackable:false}))});
  expect(joined.stacks.map(({options}) => options.stackable)).toEqual([true,false]);
  expect(joined.stacks[0].height).toBeGreaterThan(95);
  expect(closed.stacks[0].height).toBe(95);
  const joinedParts = new Map(buildMixedGeometry(geo,joined).map((part) => [part.name,part.mesh]));
  const closedParts = new Map(buildMixedGeometry(geo,closed).map((part) => [part.name,part.mesh]));
  const originalWalls = mixedPartManifest(closed).filter(({source}) => source.kind === "stack" && source.stackIndex === 0 && source.source.plate?.startsWith("wall-"));
  const raisedWalls = mixedPartManifest(joined).filter(({source}) => source.kind === "stack" && source.stackIndex === 0 && source.source.plate?.startsWith("wall-"));
  expect(originalWalls.length).toBe(2);
  expect(raisedWalls.length).toBe(2);
  for (const wall of originalWalls) expect(closedParts.get(wall.name)!.boundingBox().max[1]).toBeCloseTo(95,6);
  for (const wall of raisedWalls) expect(joinedParts.get(wall.name)!.boundingBox().max[1]).toBeCloseTo(joined.stacks[0].height,6);
  const joinedManifest = mixedPartManifest(joined), closedManifest = mixedPartManifest(closed);
  for (const descriptor of joinedManifest) {
    if (descriptor.source.kind !== "stack" || descriptor.source.stackIndex !== 1) continue;
    const unchanged = closedManifest.find(({name}) => name === descriptor.name)!;
    expect(unchanged).toBeDefined();
    expect(unchanged.source).toEqual(descriptor.source);
    expect(geo.diff(joinedParts.get(descriptor.name)!,[closedParts.get(unchanged.name)!]).volume()).toBeLessThan(1e-5);
    expect(geo.diff(closedParts.get(unchanged.name)!,[joinedParts.get(descriptor.name)!]).volume()).toBeLessThan(1e-5);
  }
}));
