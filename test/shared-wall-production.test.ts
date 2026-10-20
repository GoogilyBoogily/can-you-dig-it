import { expect,test } from 'bun:test';
import { DEFAULTS,K, type MixedBuildRequest } from '../src/model';
import { sharedCrestPinJoint } from '../prototypes/shared-wall-crest';
import { sharedWallPinJoint,sharedWallEarJoint,sharedWallCollarExtension,sharedCoverFingerHalfWidth,sharedWallCoverThickness } from '../src/features/shared-wall';
import { geo,overhangArea } from './geo';

for(const fit of [-.2,0,.3])test(`production shared joint fit ${fit} exactly preserves the qualified v2 pair`,()=>geo.arena(()=>{
  const options={...DEFAULTS,fit};
  const qualified=sharedCrestPinJoint(geo,options,.6),promoted=sharedWallPinJoint(geo,options);
  for(const feature of ['pin','notch','relief','coverSocket'] as const) {
    expect(geo.diff(qualified[feature],[promoted[feature]]).volume(),`${feature} removed`).toBeLessThan(1e-8);
    expect(geo.diff(promoted[feature],[qualified[feature]]).volume(),`${feature} added`).toBeLessThan(1e-8);
  }
  expect(promoted.coverThickness).toBe(qualified.coverThickness);
  expect(promoted.freeRootDepth).toBe(qualified.freeRootDepth);
  const follower=sharedWallEarJoint(geo,options,'follower',20);
  expect(follower.ear.boundingBox().min[1]).toBeCloseTo(-options.wall/2-sharedWallCollarExtension(options),8);
  expect(sharedCoverFingerHalfWidth(options)).toBeCloseTo(K.tabW/2+K.snapT+2*(K.cl+fit)+K.snapCatch+K.ligMin,8);
}));

import { resolveMixedBuild,type MixedLayout } from '../src/solver';
import { mixedAssemblyPlacements,mixedAssemblyCans,mixedPartManifest } from '../src/assembly';
import { buildMixedGeometry } from '../src/mixed-geometry';
import { meshDataOf,packPlan } from '../src/export';
import { stand } from '../src/features/pose';
import { laneOf,buildCover } from '../src/geometry';
import type { Manifold } from 'manifold-3d';

function requestFor(configuration:{fit?:number;design?:'standard'|'minimal';pattern?:typeof DEFAULTS.pattern;depth?:number;tiers?:number;cascade?:boolean;count?:number;cover?:boolean;rearLoad?:boolean;stackable?:boolean;wall?:number;slope?:number;lipGap?:number;canDiameter?:number;widths?:number[]}): MixedBuildRequest {
  return {shared:{...DEFAULTS,base:'flat',wall:configuration.wall??6,slope:configuration.slope??3,lipGap:configuration.lipGap??5,fit:configuration.fit??0,design:configuration.design??'standard',pattern:configuration.pattern??'hex',
    cascade:configuration.cascade??false,cover:configuration.cover??true,rearLoad:configuration.rearLoad??false,stackable:configuration.stackable??false},shareCompatibleWalls:true,
    stacks:Array.from({length:configuration.count??3},(_,index)=>({canDiameter:configuration.canDiameter??66,canHeight:(configuration.widths??[122.5,134,115])[index%(configuration.widths?.length??3)],depth:configuration.depth??240,tiers:configuration.tiers??2}))};
}
function overlap(first:Manifold,second:Manifold) {
  const firstBounds=first.boundingBox(),secondBounds=second.boundingBox();
  return [0,1,2].every(axis=>Math.min(firstBounds.max[axis],secondBounds.max[axis])-Math.max(firstBounds.min[axis],secondBounds.min[axis])>1e-6)
    ? geo.isect(first,second).volume():0;
}
function sceneOf(request:MixedBuildRequest) {
  const layout=resolveMixedBuild({w:2000,d:1200,h:1600,front:0},request);
  const printables=buildMixedGeometry(geo,layout),catalogue=new Map(printables.map(part=>[part.name,part.mesh]));
  const parts=[...mixedAssemblyPlacements(layout)].map(placement=>({name:placement.name,mesh:stand(catalogue.get(placement.name)!,placement.pose)}));
  return {layout,printables,parts};
}
function verifyScene(scene:ReturnType<typeof sceneOf>,minimumShared:number) {
  const {layout,printables,parts}=scene;
  expect(layout.boundaries?.filter(boundary=>boundary.kind==='shared').length).toBeGreaterThanOrEqual(minimumShared);
  const manifest=mixedPartManifest(layout);
  expect(printables.length).toBe(manifest.length);
  for(const part of printables) {
    expect(part.mesh.status(),part.name).toBe('NoError');
    expect(part.mesh.decompose().length,part.name).toBe(1);
    expect(overhangArea(part.mesh),part.name).toBeLessThan(1e-6);
    const bounds=part.mesh.boundingBox();
    expect(bounds.min[2],part.name).toBeCloseTo(0,6);
    expect([...bounds.min,...bounds.max].every(Number.isFinite),part.name).toBe(true);
  }
  for(let first=0;first<parts.length;first++)for(let second=first+1;second<parts.length;second++)
    expect(overlap(parts[first].mesh,parts[second].mesh),`${parts[first].name}/${parts[second].name}`).toBeLessThan(1e-5);
  const cylinders=layout.stacks.map(stack=>geo.cyl(stack.options.canD/2,stack.options.canL,0,0,-stack.options.canL/2).rotate([90,0,0]));
  let count=0;
  for(const placement of mixedAssemblyCans(layout)) {
    count++;
    const stack=layout.stacks[placement.stackIndex];
    for(const axial of [-stack.options.clearance/2,0,stack.options.clearance/2]) {
      const can=stand(cylinders[placement.stackIndex],placement.pose).translate([0,axial,0]);
      for(const part of parts)expect(overlap(can,part.mesh),`stored can${placement.stackIndex}/${part.name}/${axial}`).toBeLessThan(1e-5);
    }
  }
  expect(count).toBe(layout.cans);
  const printer=layout.stacks[0].options;
  const packed=packPlan(printables.map(part=>({mesh:meshDataOf(part.name,part.mesh.getMesh()),qty:part.qty})),printer.bed,printer.bedMargin,6,printer.bedKeepOut);
  expect(packed.placements.length).toBe(parts.length);
  const minimum=Math.min(...parts.map(part=>part.mesh.boundingBox().min[1]));
  const maximum=Math.max(...parts.map(part=>part.mesh.boundingBox().max[1]));
  expect(maximum-minimum).toBeCloseTo(layout.footprint[0],6);
}

for(const fit of [-.2,0,.3])for(const design of ['standard','minimal'] as const)for(const pattern of ['hex','circle','kumiko','slat','breeze'] as const)
  test(`production shared fit ${fit} ${design}/${pattern}: actual unequal-width triple manifest preserves solid and can contracts`,()=>geo.arena(()=>{
    verifyScene(sceneOf(requestFor({fit,design,pattern})),2);
  }));

for(const [depth,tiers,cascade,count] of [[640,6,true,3],[900,6,true,2],[260,2,false,8],[240,1,false,2]] as const)
  test(`production shared depth${depth} tiers${tiers} stacks${count}: actual repeated hands and all printable sections`,()=>geo.arena(()=>{
    const scene=sceneOf(requestFor({depth,tiers,cascade,count}));
    verifyScene(scene,count-1);
    if(depth>=640)expect(scene.layout.stacks[0].derived.seams.length).toBeGreaterThanOrEqual(2);
    // Quantities reuse physically identical source schedules rather than one WASM
    // mesh per repeated flat/mid tier; sharing remains manifest driven.
    if(tiers>=2)expect(scene.printables.length).toBeLessThan(scene.parts.length);
  }));

for(const cover of [false,true])for(const rearLoad of [false,true])for(const stackable of [false,true])
  test(`production shared closure cover${cover} rear${rearLoad} future${stackable}`,()=>geo.arena(()=>{
    verifyScene(sceneOf(requestFor({cover,rearLoad,stackable})),2);
  }));

for(const configuration of [
  {wall:5.75,slope:0,canDiameter:53,widths:[40,134]},
  {wall:8,slope:10,canDiameter:66,widths:[122.5,134]},
  {wall:10,slope:3,canDiameter:200,widths:[40,200]},
  {wall:6,slope:0,lipGap:0,canDiameter:20,widths:[40,200],design:'minimal' as const},
])test(`production shared numeric boundaries ${JSON.stringify(configuration)}`,()=>geo.arena(()=>{
  verifyScene(sceneOf(requestFor({...configuration,count:2})),1);
}));

function tierElevation(layout:MixedLayout,stackIndex:number,tier:number) {
  const stack=layout.stacks[stackIndex];
  return stack.options.cascade ? tier===0 ? 0:stack.derived.Hb+(tier-1)*stack.derived.H:tier*stack.derived.H;
}
for(const fit of [-.2,0,.3])test(`production shared fit ${fit}: actual neutral interfaces bear, retain and keep closed collar roots across cascade hands`,()=>geo.arena(()=>{
  const scene=sceneOf(requestFor({fit,depth:640,tiers:6,cascade:true})),{layout,parts}=scene;
  const descriptors=new Map(mixedPartManifest(layout).map(part=>[part.name,part.source]));
  for(const [boundaryIndex,boundary] of layout.boundaries!.entries())if(boundary.kind==='shared') {
    const primary=layout.stacks[boundary.firstStackIndex],wallY=primary.origin[1]+primary.derived.py;
    for(let tier=1;tier<primary.options.tiers;tier++) {
      const elevation=tierElevation(layout,primary.index,tier);
      const walls=(atTier:number)=>geo.union(parts.filter(part=>{
        const source=descriptors.get(part.name)!;
        return source.kind==='shared-divider'&&source.boundaryIndex===boundaryIndex&&Math.abs(part.mesh.boundingBox().min[2]-tierElevation(layout,primary.index,atTier))<1e-6;
      }).map(part=>part.mesh));
      const below=walls(tier-1),above=walls(tier);
      for(const [stackIndex,sites] of [[boundary.firstStackIndex,boundary.tiers[tier].primaryEars],[boundary.secondStackIndex,boundary.tiers[tier].followerEars]] as const) {
        const deck=geo.union(parts.filter(part=>{
          const source=descriptors.get(part.name)!;
          return source.kind==='stack'&&source.stackIndex===stackIndex&&source.source.kind==='lane'&&source.source.plate==='deck'&&Math.abs(part.mesh.boundingBox().min[2]-elevation)<1e-6;
        }).map(part=>part.mesh));
        for(const position of sites) {
          const patch=geo.rect(primary.origin[0]+position-12,wallY-3,primary.origin[0]+position+12,wallY+3);
          expect(deck.slice(elevation+.01).intersect(below.slice(elevation-.01)).intersect(patch).area(),`direct bearing ${boundaryIndex}/${tier}/${stackIndex}/${position}`).toBeGreaterThan(30);
        }
        expect(overlap(deck.translate([0,0,1]),above),`shared upward retention ${boundaryIndex}/${tier}/${stackIndex}`).toBeGreaterThan(.01);
        if(stackIndex===boundary.secondStackIndex)for(const position of sites) {
          const collar=geo.box(K.tabW,K.ligMin-.002,K.deckLo-.002,primary.origin[0]+position,
            wallY-primary.options.wall/2-(K.cl+fit)-K.ligMin/2,elevation+K.deckLo/2);
          expect(geo.diff(collar,[deck]).volume(),`actual closed collar ${boundaryIndex}/${tier}/${position}`).toBeLessThan(1e-5);
        }
      }
    }
  }
}));

for(const depth of [640,900])test(`production shared depth${depth}: vertical loading clears the actual common fingers and preserves inherited corner clearance`,()=>geo.arena(()=>{
  const scene=sceneOf(requestFor({depth,tiers:6,cascade:true})),{layout,parts}=scene;
  expect(layout.boundaries!.some(boundary=>boundary.kind==='shared')).toBe(true);
  const descriptors=new Map(mixedPartManifest(layout).map(part=>[part.name,part.source]));
  for(const stack of layout.stacks) {
    const lane=laneOf(stack.options,stack.derived,'top'),sign=-1,localX=lane.xe-(stack.options.canD+8)/2;
    const worldX=stack.origin[0]+sign*localX;
    const restingZ=tierElevation(layout,stack.index,stack.options.tiers-1)+K.deckLo+(localX-lane.xd)*stack.derived.tan+stack.options.canD/2*Math.hypot(1,stack.derived.tan);
    const cylinder=geo.cyl(stack.options.canD/2,stack.options.canL,0,0,-stack.options.canL/2).rotate([90,0,0]);
    for(const axial of [-stack.options.clearance/2,-stack.options.clearance/4,0,stack.options.clearance/4,stack.options.clearance/2]) {
      const bottom=cylinder.translate([worldX,stack.origin[1]+axial,restingZ]);
      const swept=geo.hull([bottom,bottom.translate([0,0,3*stack.options.canD])]);
      for(const part of parts) {
        const source=descriptors.get(part.name)!;
        if(source.kind==='stack'&&source.stackIndex===stack.index&&source.source.kind==='cover') {
          // Full-cylinder cans at maximum axial play already touch the legacy
          // rounded window corners. New sharing material must add zero contact.
          if(Math.abs(axial)===stack.options.clearance/2) {
            const baseline=geo.union(buildCover(geo,stack.options,stack.derived,sharedWallCoverThickness(stack.options)));
            const baselinePlaced=baseline.rotate([0,0,180]).translate([stack.origin[0],stack.origin[1],tierElevation(layout,stack.index,stack.options.tiers)]);
            expect(overlap(swept,geo.diff(part.mesh,[baselinePlaced])),`no new corner obstruction ${part.name}/${axial}`).toBeLessThan(1e-5);
            continue;
          }
        }
        expect(overlap(swept,part.mesh),`load window ${stack.index}/${part.name}/${axial}`).toBeLessThan(1e-5);
      }
    }
  }
}));

for(const bed of [[300,180,256],[180,300,256]] as [number,number,number][])
  test(`production shared rectangular printer ${bed} preserves real packing around keepouts`,()=>geo.arena(()=>{
    const request=requestFor({depth:640,tiers:6,cascade:true,count:2});
    request.shared.bed=bed;
    request.shared.bedKeepOut=[[0,0,30,30]];
    verifyScene(sceneOf(request),1);
  }));
