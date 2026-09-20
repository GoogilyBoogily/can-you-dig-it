// Where a plate stands in the lane frame. Every plate is modelled the way it prints;
// `lay` takes a lane-frame build flat for the bed and `stand` is its inverse, and the
// viewer builds its three.js pose from the same numbers - one place, not three.
import type { Manifold as M } from "manifold-3d";
import { K, type PlateName, type Vec3 } from "../geometry";

/** A standing transform: rotate about X, then Y, then Z (manifold's order), then move. */
export interface Pose { rotate: Vec3; translate: Vec3 }

export const stand = (m: M, p: Pose): M => m.rotate(p.rotate).translate(p.translate);

/** The inverse of `stand`: undo the move, then the rotations in reverse order. Each
 *  single-axis rotate is exact in manifold, so the round trip is clean. */
export const lay = (m: M, p: Pose): M => {
  const [rx, ry, rz] = p.rotate, [tx, ty, tz] = p.translate;
  return m.translate([-tx, -ty, -tz]).rotate([0, 0, -rz]).rotate([0, -ry, 0]).rotate([-rx, 0, 0]);
};

/** The deck is built flat. A side wall lies outer face up: the left one turns 180° so
 *  its outer face (+Y) comes up, both drop to y = 0 at their inner face. The end wall
 *  turns about Y and moves to the lane end. */
export function platePose(plate: PlateName, IW: number, xe: number): Pose {
  switch (plate) {
    case "deck": return { rotate: [0, 0, 0], translate: [0, 0, 0] };
    case "wall-left": return { rotate: [90, 0, 180], translate: [0, IW / 2, 0] };
    case "wall-right": return { rotate: [90, 0, 0], translate: [0, -IW / 2, 0] };
    case "end-wall": return { rotate: [0, 90, 0], translate: [xe, 0, 0] };
  }
}

/** The lip is built lying on its back with the blade at x ≤ 0; standing, the blade rises
 *  from the deck at the lip pocket, whose near edge is lipInset - half the lipTabT tab in
 *  from the deck start. */
export const lipPose = (xd: number, tan: number): Pose =>
  ({ rotate: [0, 90, 0], translate: [xd + K.lipInset - K.lipTabT / 2, 0, K.deckLo + K.lipInset * tan] });
