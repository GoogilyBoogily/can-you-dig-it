import { expect,test } from 'bun:test';
import { solve,laneOf,buildWall } from '../src/geometry';
import { DEFAULTS,K } from '../src/model';
import { pinJoint,pinSnap,coverThicknessOf } from '../src/features/joints';
import { sharedCrestPinJoint,buildSharedCrestPinCoupon } from '../prototypes/shared-wall-crest';
import { geo,overhangArea } from './geo';

for(const fit of [-.2,0,.3])for(const crestHeight of [.4,.6,.8])test(`shared crest ${crestHeight} fit ${fit}: paired receivers preserve the old return and free root`,()=>geo.arena(()=>{
  const options={...DEFAULTS,fit};
  const original=pinJoint(geo,{wall:options.wall,clearance:K.cl+fit});
  const oldSnap=pinSnap(K.cl+fit);
  const joint=sharedCrestPinJoint(geo,options,crestHeight);
  expect(geo.diff(original.pin,[joint.pin]).volume()).toBeLessThan(1e-7);
  const added=geo.diff(joint.pin,[original.pin]);
  expect(geo.isect(added,geo.box(100,100,100,0,0,oldSnap.peak-50)).volume()).toBeLessThan(1e-7);
  expect(geo.diff(joint.relief,[original.relief]).volume()).toBeLessThan(1e-7);
  expect(geo.diff(original.relief,[joint.relief]).volume()).toBeLessThan(1e-7);
  expect(joint.freeRootDepth).toBe(K.snapLen-oldSnap.peak);
  expect(joint.pin.boundingBox().max[0]).toBeCloseTo(original.pin.boundingBox().max[0],8);
  expect(joint.tip-oldSnap.tip).toBeCloseTo(crestHeight,8);
  expect(joint.coverThickness-coverThicknessOf(options)).toBeCloseTo(crestHeight,8);
  expect(geo.diff(joint.pin,[joint.notch]).volume()).toBeLessThan(1e-7);
  expect(geo.diff(joint.pin,[joint.coverSocket]).volume()).toBeLessThan(1e-7);
  const coupon=buildSharedCrestPinCoupon(geo,options,crestHeight);
  expect(coupon.status()).toBe('NoError');
  expect(coupon.decompose().length).toBe(1);
  expect(overhangArea(coupon)).toBeLessThan(1e-7);
  expect(coupon.boundingBox().min[2]).toBeCloseTo(0,8);
  const cover=geo.diff(geo.box(30,12,joint.coverThickness,0,0,joint.coverThickness/2),[joint.coverSocket]);
  expect(cover.status()).toBe('NoError');
  expect(cover.decompose().length).toBe(1);
  expect(overhangArea(cover)).toBeLessThan(1e-7);
  const skin=geo.box(2,2,.798,0,(K.tabT-options.wall)/2,joint.coverThickness-.4);
  expect(geo.diff(skin,[cover]).volume()).toBeLessThan(1e-7);
}));

for(const fit of [-.2,0,.3])test(`shared crest fit ${fit}: raised receiving chamber retains a full ligament below the production lattice`,()=>geo.arena(()=>{
  const options={...DEFAULTS,fit,length:240,cascade:false,lanesWide:1,left:'none' as const,right:'none' as const};
  const derived={...solve(options),pinPositions:[-65,65]};
  const lane=laneOf(options,derived,'top');
  const joint=sharedCrestPinJoint(geo,options,.6);
  const wall=buildWall(geo,options,derived,{...lane,tabs:[-98,-28,28,96]},1,{
    joint,receivingTip:joint.tip,hook:joint.original.hook,rootDepth:joint.freeRootDepth,
  });
  for(const position of derived.pinPositions) {
    const ligament=geo.box(4,options.wall-.002,K.ligMin-.002,position,derived.py,joint.tip+K.cl+fit+K.ligMin/2);
    expect(geo.diff(ligament,[wall]).volume()).toBeLessThan(1e-7);
  }
}));
