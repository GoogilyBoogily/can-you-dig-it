import { expect,test } from 'bun:test';
import { sharedWallPrototype,SHARED_MECHANICS } from '../prototypes/shared-wall-mechanics';
import { earNotchH,tabSnap,endWallTabPositions } from '../src/features/joints';
import { meshDataOf,packPlan } from '../src/export';
import { K } from '../src/model';
import { assemblyCans } from '../src/assembly';
import { stand } from '../src/features/pose';
import { geo,overhangArea } from './geo';

for(const fit of [-.2,0,.3]) for(const minimal of [false,true]) {
  test(`shared wall prototype fit ${fit} minimal ${minimal}: covered unequal-width middle stack seats and prints flat`,()=>geo.arena(()=>{
    const result=sharedWallPrototype(geo,{fit,minimal,widths:[122.5,134,115],slope:3});
    for(const part of result.parts) {
      expect(part.printable.status(),part.name).toBe('NoError');
      expect(part.printable.decompose().length,part.name).toBe(1);
      expect(overhangArea(part.printable),part.name).toBeLessThan(1e-6);
    }
    for(let first=0;first<result.parts.length;first++)for(let second=first+1;second<result.parts.length;second++)
      expect(geo.isect(result.parts[first].standing,result.parts[second].standing).volume(),
        `${result.parts[first].name}/${result.parts[second].name}`).toBeLessThan(1e-5);
    for(const [stack,lane] of result.lanes.entries()) {
      const cylinder=geo.cyl(lane.options.canD/2,lane.options.canL,0,0,-lane.options.canL/2).rotate([90,0,0]);
      for(const placement of assemblyCans(lane.options,lane.derived))for(const axial of [-lane.options.clearance/2,0,lane.options.clearance/2]) {
        const can=stand(cylinder,placement.pose).translate([0,lane.centre+axial,0]);
        for(const part of result.parts)expect(geo.isect(can,part.standing).volume(),`can${stack}/${part.name}/${axial}`).toBeLessThan(1e-5);
      }
    }
  }));
  test(`shared wall prototype fit ${fit} minimal ${minimal}: BOTH upper decks and covers bear on the common wall and resist peel`,()=>geo.arena(()=>{
    const result=sharedWallPrototype(geo,{fit,minimal,widths:[122.5,134,115],slope:3});
    const height=result.lanes[0].derived.H;
    for(let boundary=0;boundary<2;boundary++) {
      const divider=result.parts.find(part=>part.name===`boundary-${boundary}-tier-0`)!.standing;
      const upperDivider=result.parts.find(part=>part.name===`boundary-${boundary}-tier-1`)!.standing;
      const wallY=result.lanes[boundary].centre+result.lanes[boundary].derived.py;
      for(const [stack,sites] of [[boundary,SHARED_MECHANICS.primaryEars],[boundary+1,SHARED_MECHANICS.followerEars]] as const) {
        const deck=result.parts.find(part=>part.name===`stack-${stack}-tier-1-deck`)!.standing;
        for(const position of sites) {
          const patch=geo.rect(position-K.earW/2,wallY-3,position+K.earW/2,wallY+3);
          expect(deck.slice(height+.01).intersect(divider.slice(height-.01)).intersect(patch).area(),`bearing deck${stack} ear${position}`).toBeGreaterThan(30);
        }
        expect(geo.isect(deck.translate([0,0,-.1]),divider).volume(),`downward bearing ${stack}`).toBeGreaterThan(1);
        expect(geo.isect(deck.translate([0,0,1]),upperDivider).volume(),`upward catch ${stack}`).toBeGreaterThan(.01);
        const cover=result.parts.find(part=>part.name===`stack-${stack}-cover`)!.standing;
        const pin=stack===boundary ? -65:65;
        const patch=geo.rect(pin-result.fingerHalfWidth,wallY-3,pin+result.fingerHalfWidth,wallY+3);
        expect(cover.slice(2*height+.01).intersect(upperDivider.slice(2*height-.01)).intersect(patch).area(),`cover bearing ${stack}`).toBeGreaterThan(30);
        expect(geo.isect(cover.translate([0,0,-.1]),upperDivider).volume()).toBeGreaterThan(1);
        expect(geo.isect(cover.translate([0,0,1]),upperDivider).volume()).toBeGreaterThan(.01);
      }
    }
    // Whole follower assembly may move within clearance, but must encounter a
    // positive barrier before a 4 mm ear can lift clear of its 3 mm snap engagement.
    for(const stack of [1,2]) {
      const moving=geo.union(result.parts.filter(part=>part.stack===stack).map(part=>part.standing));
      const fixed=geo.union(result.parts.filter(part=>part.stack!==stack).map(part=>part.standing));
      const pivot=result.lanes[stack].centre+result.lanes[stack].derived.OW/2;
      for(const axial of [-K.cl-fit,K.cl+fit])for(const direction of [-1,1]) {
        const rotated=moving.translate([axial,-pivot,0]).rotate([direction*1.5,0,0]).translate([0,pivot,0]);
        expect(geo.isect(rotated,fixed).volume(),`roll stack${stack} axial${axial} sign${direction}`).toBeGreaterThan(.01);
      }
    }
    // Each end wall must retain independently of the neighboring end-wall post.
    for(const stack of [0,1,2])for(const tier of [0,1]) {
      const moving=result.parts.find(part=>part.name===`stack-${stack}-tier-${tier}-end`)!.standing;
      const fixed=geo.union(result.parts.filter(part=>part.tier===tier && !part.name.endsWith('-end') &&
        (part.stack===stack || part.name.startsWith('boundary-'))).map(part=>part.standing));
      for(const shift of [-1.2,1.2])expect(geo.isect(moving.translate([0,shift,0]),fixed).volume(),`independent endwall${stack}/${tier}/${shift}`).toBeGreaterThan(.01);
    }
  }));
}

for(const fit of [-.2,0,.3]) {
  test(`shared wall prototype fit ${fit}: closed follower collar and primary rail remain solid`,()=>geo.arena(()=>{
    const result=sharedWallPrototype(geo,{fit,widths:[122.5,134,115],slope:3,minimal:true});
    for(let boundary=0;boundary<2;boundary++) {
      const wallY=result.lanes[boundary].centre+result.lanes[boundary].derived.py;
      const follower=result.parts.find(part=>part.name===`stack-${boundary+1}-tier-0-deck`)!.standing;
      for(const position of SHARED_MECHANICS.followerEars) {
        // Full-depth far-face rail: exactly K.ligMin of material between slot and
        // free edge, including the flared slot's larger X extent at the bed face.
        const closedRail=geo.box(K.tabW,K.ligMin-.002,K.deckLo-.002,position,
          wallY-3-(K.cl+fit)-K.ligMin/2,K.deckLo/2);
        expect(geo.diff(closedRail,[follower]).volume(),`closed collar boundary${boundary} x${position}`).toBeLessThan(1e-5);
        const root=geo.box(K.earW,1,K.deckLo-.002,position,wallY+3+.5,K.deckLo/2);
        expect(geo.diff(root,[follower]).volume(),`follower full root ${boundary}/${position}`).toBeLessThan(1e-5);
      }
      const primary=result.parts.find(part=>part.name===`stack-${boundary}-tier-0-deck`)!.standing;
      for(const position of SHARED_MECHANICS.followerEars) {
        const rail=geo.box(K.earW+2*(K.cl+fit),K.ligMin,K.deckLo-.002,position,
          wallY-3-result.collar-2*(K.cl+fit)-1-K.ligMin/2,K.deckLo/2);
        expect(geo.diff(rail,[primary]).volume(),`primary remaining rail ${boundary}/${position}`).toBeLessThan(1e-5);
      }
    }
  }));

  test(`shared wall prototype fit ${fit}: complete assembly can lower in Z with contact confined to real snap prongs`,()=>geo.arena(()=>{
    const result=sharedWallPrototype(geo,{fit,widths:[122.5,134,115],slope:3,minimal:true});
    const height=result.lanes[0].derived.H;
    let maximumSnapInterference=0;
    for(let boundary=0;boundary<2;boundary++) {
      const wallY=result.lanes[boundary].centre+result.lanes[boundary].derived.py;
      const lower=result.parts.find(part=>part.name===`boundary-${boundary}-tier-0`)!.standing;
      const moving=result.parts.find(part=>part.name===`boundary-${boundary}-tier-1`)!.standing;
      const decks=geo.union(result.parts.filter(part=>part.name.endsWith('-deck')&&part.tier===1).map(part=>part.standing));
      // Flex envelopes contain only the actual printed prong material: removing
      // these from the hosts leaves the rigid host collision test independent of
      // the intended temporary snap interference during insertion.
      const freeRootTop=earNotchH(K.cl+fit)+K.snapLen-tabSnap(K.cl+fit,earNotchH(K.cl+fit),K.tabW).peak;
      const movingProngs=geo.union([...SHARED_MECHANICS.primaryEars,...SHARED_MECHANICS.followerEars].map(position=>
        geo.box(K.tabW+2*K.snapT,8,freeRootTop,position,wallY,height+freeRootTop/2)));
      const lowerProngs=geo.union(SHARED_MECHANICS.pins.map(position=>
        geo.box(K.tabW+2*K.snapT,8,10,position,wallY,height+5)));
      const rigidMoving=geo.diff(moving,[movingProngs]);
      const rigidFixed=geo.union([decks,geo.diff(lower,[lowerProngs])]);
      const fullFixed=geo.union([decks,lower]);
      for(let offset=20;offset>=0;offset-=.25) {
        expect(geo.isect(rigidMoving.translate([0,0,offset]),rigidFixed).volume(),`rigid wall insertion ${boundary}/${offset}`).toBeLessThan(1e-5);
        maximumSnapInterference=Math.max(maximumSnapInterference,geo.isect(moving.translate([0,0,offset]),fullFixed).volume());
      }
      const top=result.parts.find(part=>part.name===`boundary-${boundary}-tier-1`)!.standing;
      const topProngs=geo.union(SHARED_MECHANICS.pins.map(position=>geo.box(K.tabW+2*K.snapT,8,10,position,wallY,2*height+5)));
      const rigidTop=geo.diff(top,[topProngs]);
      for(const stack of [boundary,boundary+1]) {
        const cover=result.parts.find(part=>part.name===`stack-${stack}-cover`)!.standing;
        for(let offset=20;offset>=0;offset-=.25)
          expect(geo.isect(cover.translate([0,0,offset]),rigidTop).volume(),`rigid cover insertion ${boundary}/${stack}/${offset}`).toBeLessThan(1e-5);
      }
    }
    expect(maximumSnapInterference).toBeGreaterThan(.01);
  }));
}

for(const fit of [-.2,0,.3]) test(`shared wall prototype fit ${fit}: pair and triple manufacturing, feed, dispense and assembly paths`,()=>geo.arena(()=>{
  for(const widths of [[122.5,134],[122.5,134,115]]) for(const tiers of [1,2]) {
    const result=sharedWallPrototype(geo,{fit,widths,tiers,slope:3,minimal:true});
    const height=result.lanes[0].derived.H;
    const plan=packPlan(result.parts.map(part=>({mesh:meshDataOf(part.name,part.printable.getMesh()),qty:1})),[256,256,256],3);
    expect(plan.placements.length).toBe(result.parts.length);
    for(const part of result.parts) {
      const bounds=part.printable.boundingBox();
      expect(bounds.min[2],part.name).toBeCloseTo(0,7);
      expect([...bounds.min,...bounds.max].every(Number.isFinite),part.name).toBe(true);
    }
    for(const [stack,lane] of result.lanes.entries()) {
      const cylinder=geo.cyl(lane.options.canD/2,lane.options.canL,0,0,-lane.options.canL/2).rotate([90,0,0]);
      for(const tier of Array.from({length:tiers},(_,index)=>index)) {
        const placements=[...assemblyCans(lane.options,lane.derived)].filter(placement=>Math.floor(placement.pose.translate[2]/height)===tier);
        const first=placements[0].pose.translate,last=placements.at(-1)!.pose.translate;
        for(const axial of [-lane.options.clearance/2,lane.options.clearance/2]) {
          const firstCan=cylinder.translate([first[0],lane.centre+axial,first[2]]);
          const lastCan=cylinder.translate([last[0],lane.centre+axial,last[2]]);
          const lifted=firstCan.translate([0,0,K.lipH+2]);
          const withdrawn=lifted.translate([-lane.derived.L/2-lane.options.canD/2-8-first[0],0,0]);
          for(const [name,sweep] of [['feed',geo.hull([firstCan,lastCan])],['lift',geo.hull([firstCan,lifted])],['dispense',geo.hull([lifted,withdrawn])]] as const)
            for(const part of result.parts)expect(geo.isect(sweep,part.standing).volume(),`${name} stack${stack} tier${tier} axial${axial}/${part.name}`).toBeLessThan(1e-5);
        }
        const deck=result.parts.find(part=>part.name===`stack-${stack}-tier-${tier}-deck`)!.standing;
        const lowerWalls=result.parts.filter(part=>part.tier===tier-1&&!part.name.endsWith('-deck')&&!part.name.endsWith('-lip')&&!part.name.endsWith('-end'));
        for(const offset of [20,10,5,2,1,0])for(const wall of lowerWalls)
          expect(geo.isect(deck.translate([0,0,offset]),wall.standing).volume(),`upper deck insertion ${stack}/${tier}/${offset}`).toBeLessThan(1e-5);
        const end=result.parts.find(part=>part.name===`stack-${stack}-tier-${tier}-end`)!.standing;
        const pinProngs=geo.union(endWallTabPositions(lane.derived.IW).map(position=>
          geo.box(8,K.tabW+2*K.snapT,K.snapLen,laneOfEnd(lane),lane.centre+position,tier*height+K.snapLen/2)));
        const rigidEnd=geo.diff(end,[pinProngs]);
        const host=geo.union(result.parts.filter(part=>part.tier===tier&&!part.name.endsWith('-end')&&!part.name.endsWith('-lip')&&
          (part.stack===stack||part.name.startsWith('boundary-'))).map(part=>part.standing));
        for(let offset=20;offset>=0;offset-=.5)
          expect(geo.isect(rigidEnd.translate([0,0,offset]),host).volume(),`end insertion ${stack}/${tier}/${offset}`).toBeLessThan(1e-5);
        const pivot:[number,number,number]=[laneOfEnd(lane),lane.centre,tier*height];
        for(const rotation of [[2,0,0],[-2,0,0],[0,0,2],[0,0,-2]] as [number,number,number][])
          expect(geo.isect(end.translate(pivot.map(value=>-value) as [number,number,number]).rotate(rotation).translate(pivot),host).volume(),`end rotation ${rotation}`).toBeGreaterThan(.01);
      }
    }
  }
}));

function laneOfEnd(lane: {derived:{L:number};options:{wall:number}}) { return lane.derived.L/2-lane.options.wall-K.post; }

for(const fit of [-.2,0,.3]) test(`shared wall prototype fit ${fit}: sampled roll barriers precede ear escape and middle cover resists diagonal rocking`,()=>geo.arena(()=>{
  const result=sharedWallPrototype(geo,{fit,widths:[122.5,134,115],slope:3,minimal:true});
  for(const stack of [1,2]) {
    const lane=result.lanes[stack];
    const moving=geo.union(result.parts.filter(part=>part.stack===stack).map(part=>part.standing));
    const fixed=geo.union(result.parts.filter(part=>part.stack!==stack).map(part=>part.standing));
    const pivot=lane.centre+lane.derived.OW/2;
    const escapeAngle=Math.asin(K.deckLo/lane.derived.OW)*180/Math.PI;
    for(const axial of [-K.cl-fit,K.cl+fit])for(const sideways of [-K.cl-fit,K.cl+fit])for(const direction of [-1,1]) {
      let firstBarrier: number|undefined;
      for(let angle=.1;angle<escapeAngle;angle+=.1) {
        const rotated=moving.translate([axial,sideways-pivot,0]).rotate([direction*angle,0,0]).translate([0,pivot,0]);
        if(geo.isect(rotated,fixed).volume()>.01) {firstBarrier=angle;break;}
      }
      expect(firstBarrier,`sampled roll ${stack}/${axial}/${sideways}/${direction}`).toBeDefined();
      expect(firstBarrier!).toBeLessThan(escapeAngle);
    }
  }
  const middle=result.parts.find(part=>part.name==='stack-1-cover')!.standing;
  const height=result.lanes[1].derived.H;
  const leftBoundary=result.lanes[0].centre+result.lanes[0].derived.py;
  const rightBoundary=result.lanes[1].centre+result.lanes[1].derived.py;
  const fixed=geo.union(result.parts.filter(part=>part.name.startsWith('boundary-')&&part.tier===1).map(part=>part.standing));
  const pivot:[number,number,number]=[65,leftBoundary-1.5,2*height];
  const lineAngle=Math.atan2(rightBoundary-leftBoundary,-130)*180/Math.PI;
  for(const axial of [-K.cl-fit,K.cl+fit])for(const sideways of [-K.cl-fit,K.cl+fit])for(const direction of [-1,1]) {
    const rotated=middle.translate([axial-pivot[0],sideways-pivot[1],-pivot[2]])
      .rotate([0,0,-lineAngle]).rotate([direction*1,0,0]).rotate([0,0,lineAngle]).translate(pivot);
    expect(geo.isect(rotated,fixed).volume(),`middle diagonal ${axial}/${sideways}/${direction}`).toBeGreaterThan(.01);
  }
}));

for(const fit of [-.2,0,.3]) test(`shared wall prototype fit ${fit}: middle diagonal cover peel remains caught after removing downward bearing`,()=>geo.arena(()=>{
  const result=sharedWallPrototype(geo,{fit,widths:[122.5,134,115],slope:3,minimal:true});
  const middle=result.parts.find(part=>part.name==='stack-1-cover')!.standing;
  const height=result.lanes[1].derived.H;
  const left=result.lanes[0].centre+result.lanes[0].derived.py;
  const right=result.lanes[1].centre+result.lanes[1].derived.py;
  const fixed=geo.union(result.parts.filter(part=>part.name.startsWith('boundary-')&&part.tier===1).map(part=>part.standing));
  const pivot:[number,number,number]=[65,left-1.5,2*height];
  const lineAngle=Math.atan2(right-left,-130)*180/Math.PI;
  for(const axial of [-K.cl-fit,K.cl+fit])for(const sideways of [-K.cl-fit,K.cl+fit])for(const direction of [-1,1]) {
    const rotated=middle.translate([axial-pivot[0],sideways-pivot[1],-pivot[2]])
      .rotate([0,0,-lineAngle]).rotate([direction*1,0,0]).rotate([0,0,lineAngle]).translate(pivot);
    const lifted=rotated.translate([0,0,2*height-rotated.boundingBox().min[2]+.01]);
    expect(lifted.boundingBox().min[2]).toBeGreaterThan(2*height);
    expect(geo.isect(lifted,fixed).volume(),`diagonal lifted catch ${axial}/${sideways}/${direction}`).toBeGreaterThan(.01);
  }
}));
