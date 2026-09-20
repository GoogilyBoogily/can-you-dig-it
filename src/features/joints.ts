// Joints as pieces: every function here builds both halves of one joint from one spec at
// a local origin - x along the lane, y the wall's centreline (+y toward the wall's outer
// face), z = 0 at the deck underside and the wall bottom - and geometry.ts places them.
// The female is the male grown by `clearance` in-plane and run OVER past the faces it
// cuts through; the male is the exact shape. That is the whole guarantee: a slot cannot
// drift from its tab because there is no second copy of the numbers.
import type { Manifold as M } from "manifold-3d";
import { K, type Geo, type Options } from "../geometry";

/** Every joint's clearance a side: the design's, plus the user's fit. */
export const clearanceOf = (o: Options) => K.cl + o.fit;

/** How far a cut runs past the face it opens on, and a fuse past the face it grows from.
 *  A union with extra inside the host, or a difference with extra outside it, is the same
 *  solid - so the number is free, and 1 mm keeps every boolean off a coplanar face. */
export const OVER = 1;

/** The one tab cross-section, tabW along x by tabT, flush with the inner face of a
 *  `wall`-thick wall centred on y = 0, from z0 up `len`. Pins, bosses and the tab a
 *  notch leaves standing are all this box. */
export const tabBox = (g: Geo, len: number, wall: number, z0: number): M =>
  g.box(K.tabW, K.tabT, len, 0, (K.tabT - wall) / 2, z0 + len / 2);
