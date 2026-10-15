import { K, type Options, type Derived, type LaneRole, type PlateName, type Side, type WallPlateName } from "./model";

/** The role tier `t` (0 on the shelf) prints as. A flat stack's tiers are all one lane. */
export const tierRole = (o: Options, t: number): LaneRole =>
  !o.cascade ? "top" : t === 0 ? "bottom" : t === o.tiers - 1 ? "top" : "mid";

/** The tier cans slide into from the shelf's back, or -1: the only tier, or the top of a
 *  stack (a cascade's lower tiers fill through it; a flat stack's still load from the
 *  front). It has no end wall - a can fills the tier
 *  over the deck there, ~3 mm spare, so no stop or bar fits. A cascade's tiers alternate,
 *  and its top tier's high end faces the back on an odd count only; on an even one the
 *  back is the chute. The side walls keep their corner slot, empty: a flat stack's tiers
 *  share one set of walls. */
export const rearTier = (o: Options) =>
  o.rearLoad && !stacksOnTop(o) && (o.tiers === 1 || !o.cascade || o.tiers % 2 === 1) ? o.tiers - 1 : -1;

/** Whether the top tier is built for a tier on it: a cascade's next tier drops its chute
 *  over this one's high end, so the top gets a mid tier's full end wall, not the loading
 *  lip, and that wall stays even when the top would load from the back. A flat stack's
 *  tiers are one lane already. */
export const stacksOnTop = (o: Options) => o.cascade && o.stackable;

/** The end wall's inner face: it stands `post` in from the lane end, so the side wall
 *  keeps a post behind it and its slot is closed on both sides. The viewer stands the
 *  end wall here too. */
export const laneXe = (o: Options, d: Derived) => d.L / 2 - o.wall - K.post;

/** Whether the decks carry the gang joint: some lane edge has a tongue or a socket - a
 *  row's inner joints always do - and not on a grid, where the baseplate joins them. */
export const gangs = (o: Options) => o.base !== "gridfinity" && (o.lanesWide > 1 || o.left !== "none" || o.right !== "none");

/** The sides of lane `lane`'s deck, +Y then -Y; lane 0 is the row's -Y (right) end. Inside
 *  the row a lane's tongue runs into its left neighbour's socket; the row's two ends
 *  are what the options say. */
export function deckSides(o: Options, lane: number): [Side, Side] {
  if (!gangs(o)) return ["none", "none"];
  return [lane === o.lanesWide - 1 ? o.left : "tongue", lane === 0 ? o.right : "socket"];
}

/** The deck a lane prints as: the row's ends get their own when their sides differ from
 *  the inner lanes'. A lone lane's deck is just the deck, whatever its sides. */
export function deckVariant(o: Options, lane: number): PlateName {
  const [left, right] = deckSides(o, lane);
  if (o.lanesWide === 1 || (left === "tongue" && right === "socket") || !gangs(o)) return "deck";
  return lane === 0 ? "deck-right-end" : "deck-left-end";
}

/** The name a lane plate prints under. A flat stack's tiers are all the same lane, so
 *  the role is left out; the viewer and the snapshot look parts up by this name. */
export const laneName = (o: Options, role: LaneRole, plate: PlateName) =>
  o.cascade ? `lane-${role}-${plate}` : `lane-${plate}`;


/** A wall's identity records only features that differ physically. Reversed tiers
 * exchange their local sides before row-edge choices are applied. */
export function wallVariant(o: Options, lane: number, tier: number, side: number): WallPlateName {
  const reversed = o.cascade && tier % 2 === 1;
  const worldSide = reversed ? -side : side;
  const connected = deckSides(o, lane)[worldSide > 0 ? 0 : 1] !== "none";
  const terminal = tier === o.tiers - 1 && !o.cover && !o.stackable;
  return `${side > 0 ? "wall-left" : "wall-right"}${connected ? "" : "-closed"}${terminal ? "-terminal" : ""}${tier === rearTier(o) ? "-open" : ""}`;
}
