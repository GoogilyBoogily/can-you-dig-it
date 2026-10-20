// Product dimensions, configuration and layout contracts. No kernel or builders.
export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

// ---------------------------------------------------------------- spec
/** standard: the lattice as designed. minimal: same joints and dimensions; wall web, deck
 *  rails, ties and end wall thinned to what the loads need, the cover a perforated sheet. */
export type Design = "standard" | "minimal";
export const DESIGNS: readonly Design[] = ["standard", "minimal"];

/** The perforation of the walls, end wall and cover; orthogonal to the design. Every one
 *  is an in-plane through-cut. Spec in docs/superpowers/specs/2026-09-18-pattern-axis-design.md. */
export type Pattern = "hex" | "circle" | "kumiko" | "slat" | "breeze";
export const PATTERNS: readonly Pattern[] = ["hex", "circle", "kumiko", "slat", "breeze"];

/** flat: the lane sits on the shelf. feet: 24 mm risers under the bottom tier (wire
 *  shelves, a lip to clear). gridfinity: the bottom deck grows a 7 mm unit of Gridfinity
 *  feet and drops into the baseplate you have. Spec in
 *  docs/superpowers/specs/2026-09-19-gridfinity-base-design.md. */
export type Base = "flat" | "feet" | "gridfinity";
export const BASES: readonly Base[] = ["flat", "feet", "gridfinity"];
/** Where the lane sits on its floor of whole cells: the spare goes to the other side.
 *  Across the lane, left is +Y (seen from the front); along it, front is the lip end. */
export type Across = "left" | "centre" | "right";
export type Along = "front" | "centre" | "back";
export const ACROSS: readonly Across[] = ["left", "centre", "right"];
export const ALONG: readonly Along[] = ["front", "centre", "back"];
/** What one side of a unit joins its neighbour by: the gang tongue, the T socket that
 *  takes one, or nothing. Units mate only when printed from the same settings. */
export type Side = "tongue" | "socket" | "none";
export const SIDES: readonly Side[] = ["tongue", "socket", "none"];

export interface Options {
  canD: number;
  canL: number;
  length: number; // assembled lane length; printable sections fit the selected bed
  tiers: number;
  lanesWide: number;
  cascade: boolean; // true: drop chute at the low end, tiers alternate 180°. false: flat decks
  slope: number; // degrees
  lipGap: number; // headroom over the lip crest for the can leaving over it; the tier grows to give it
  wall: number;
  clearance: number;
  fit: number;
  hexR: number; // cell radius when hexAuto is off
  hexAuto: boolean; // size cells so three whole rows fill the wall
  solid: boolean; // no lattice at all; overrides design and pattern
  design: Design;
  pattern: Pattern;
  cover: boolean;
  rearLoad: boolean; // the tier cans slide into from the shelf's back prints without its end wall
  stackable: boolean; // a cascade's top tier gets the full end wall, so another tier can go on it later
  left: Side; right: Side; // what the row's outer sides join a neighbouring unit by; left is +Y
  base: Base; // what the bottom tier stands on
  magnets: boolean; // pockets for 6 × 2 mm magnets (cut 6.5 × 2.4) in every Gridfinity foot
  across: Across; along: Along; // the lane on its Gridfinity floor
  shelfCells: [number, number]; // Gridfinity cells the shelf has room for, along and across the lane
  bed: [number, number, number];
  bedMargin: number;
  bedKeepOut?: [number, number, number, number][]; // profile exclusion rectangles in bed coordinates
}

export const DEFAULTS: Options = {
  canD: 66, canL: 122.5, length: 480, tiers: 2, lanesWide: 2,
  cascade: true, slope: 3, lipGap: 5, wall: 6, clearance: 3.5, fit: 0, hexR: 13, hexAuto: true,
  solid: false, design: "standard", pattern: "hex", cover: true, rearLoad: false, stackable: false, left: "tongue", right: "socket", base: "flat", magnets: false, across: "centre", along: "centre", shelfCells: [10, 7], bed: [256, 256, 256], bedMargin: 3,
};

// fixed design constants
export const K = {
  deckLo: 4, topgap: 2, slack: 8, lipH: 20, edgeR: 3,
  lipInset: 8, // the lip pockets, and the first can, this far in from the deck start
  minimalT: 2.5, // the minimal design's fins, ties and end ties
  padRise: 4, // the recess frame, and every field but hex, starts this far above the ear notch
  hexMin: 8, hexMax: 16, ligMin: 1.7, ligRatio: 0.17,
  border: 5, web: 3.5,
  cl: 0.25, // every joint's clearance a side, before `fit`
  // one tab for every joint: 16 wide, 3 thick, flush with the plate's inner face. A pin
  // is a tab as tall as the cover is thick, so it sits flush through the cover's hole.
  // The ear a wall notches over is earW long; the wall's front ear starts 1 mm inside
  // the deck end (laneOf's tabIn), and the two rules that keep an ear clear of a pin
  // (laneOf's clear, check) derive from these, so they move together
  tabW: 16, tabT: 3, pinH: 2.4, coverT: 2.4, earW: 24,
  earRoot: 1, // an ear runs this far into the deck past the wall's inner face, so it is rooted and not a coplanar butt
  // the lip's tab is its own shape, 5 thick by 12 wide, and its pocket is turned 90° from
  // it: the lip lies on its back to print and stands on the deck
  lipTabT: 5, lipTabW: 12,
  // the cover's grille: the field stops coverInset in from every edge (the pin holes at
  // IW/2 + 1.5 are 6.5 mm outside it), its bars are coverBar of the cell radius, and a
  // split cover keeps a coverSeam-wide solid band each side of every seam
  coverInset: 14, coverBar: 0.5, coverSeam: 6,
  riserL: 20, // a riser foot along the lane; the boss and the wall notch it goes in set nothing wider
  // the corner is a cross-lap: the end wall stands `post` in from the lane end so the
  // side wall keeps a post behind it that closes its slot, and each plate is slotted -
  // the end wall from its bottom edge up `lap`, the side wall from its top edge down to
  // that line. The 3 mm post keeps the slot closed while preserving the can run;
  // queueGeometry accounts for this space together with the stops and can clearance
  post: 3, lap: 12,
  // ganged lanes sit gangGap apart, keyed by the deck: every +Y ear runs on under both
  // walls as a tongue that ends in a T (an ear-wide neck, a gangHead-wide head, the
  // splice's depths) in a socket in the neighbour's rail. The neck is the ear's width
  // because the neighbour wall's tab hole crosses it: a tab-wide neck was all hole
  gangGap: 3, gangHead: 30,
  // the T at every splice and gang joint: a neck spliceNeck deep, a head the rest of
  // spliceDepth; each deck splice is spliceBase / spliceTip wide
  spliceBase: 30, spliceTip: 40, spliceNeck: 3, spliceDepth: 8,
  // Gridfinity: 42 mm cells, a 7 mm unit; a bin is n·42 − 0.5 across. A foot, bottom
  // up: a 35.6 flat, 0.8 chamfer, 1.8 wall, 2.15 chamfer, 41.5 at the top, corners
  // concentric with r 3.75 at the top. Magnets 6 × 2 on a 26 mm square in every cell
  gridPitch: 42, gridGap: 0.25, unitH: 7, footFlat: 35.6, footChamferLo: 0.8, footWall: 1.8,
  footChamferHi: 2.15, footR: 3.75, magnetR: 3.25, magnetDepth: 2.4, magnetPitch: 26,
  // the snap: every tab is two snapT prongs at its edges with a hook snapCatch past the
  // mouth it springs through, freed by relief slots so the hook sits snapLen from the
  // prong's root - 2.5 % strain in PETG at that catch. A tab's catch is a snapFlare-deep
  // 45° flare at the far side of the slot it drops through
  snapT: 1.6, snapCatch: 0.5, snapLen: 7, snapFlare: 2,
};

/** PETG, g/cm³: the filament estimates and the solid-print weight. */
export const DENSITY = 1.27;

/** Height the base adds under the bottom tier: what the solver charges the shelf for. On
 *  a grid the feet sit inside the baseplate, so the unit is the whole of it. */
export const baseHeight = (o: Options) => (o.base === "feet" ? 24 : o.base === "gridfinity" ? K.unitH : 0);
/** Whole Gridfinity cells that cover `span` mm. */
export const gridCells = (span: number) => Math.ceil((span + 2 * K.gridGap) / K.gridPitch);
/** The width of `cells` whole cells, gap included: the bin's edge. */
export const gridSpan = (cells: number) => cells * K.gridPitch - 2 * K.gridGap;

export interface Derived {
  n: number; nBottom: number; split: boolean;
  seams: number[]; // ordered X coordinates, symmetric for reversed cascade tiers
  pinPositions: number[]; // shared wall pins, receiving catches and base supports
  sectionError?: string; // a protected feature cannot fit in a printable section
  L: number; IW: number; OW: number; H: number; Hb: number;
  dhi: number; dhiB: number; tan: number; inset: number;
  hexR: number; lig: number;
  xd: number; px: number; py: number; lipy: number; railHy: number;
  gangPitch: number; plateX: number; plateY: number; plateZ: number; usableX: number; usableY: number; usableZ: number;
  floorCells: [number, number]; // the lane's cells along and across: what covers it, or what the shelf has
  floor: [number, number, number, number]; // the floor of feet, x0 y0 x1 y1 in the lane frame
  foot: [number, number, number, number]; // lane and floor together: what stands on the shelf and fits the bed
}

export type LaneRole = "top" | "mid" | "bottom";
export type WallPlateName = `${"wall-left" | "wall-right"}${"" | "-closed"}${"" | "-terminal"}${"" | "-open"}`;
export type PlateName = WallPlateName | "deck" | "deck-left-end" | "deck-right-end" | "deck-mirrored" | "deck-left-end-mirrored" | "deck-right-end-mirrored" | "wall-left" | "wall-right" | "end-wall";

/** One mandatory stack in a connected organizer, ordered from right to left. */
export interface MixedStackRequest {
  canDiameter: number;
  canHeight: number;
  depth: number;
  tiers: number | "auto";
  // Missing controls inherit the shared settings carried by older mixed links.
  cascade?: boolean;
  slope?: number;
  lipGap?: number;
  cover?: boolean;
  rearLoad?: boolean;
  stackable?: boolean;
}

export type MixedSharedOptions = Omit<Options,
  "canD" | "canL" | "length" | "tiers" | "lanesWide" | "left" | "right" | "base"
  | "magnets" | "across" | "along" | "shelfCells"> & { base: "flat" };

export interface MixedBuildRequest {
  shared: MixedSharedOptions;
  stacks: MixedStackRequest[];
  shareCompatibleWalls?: boolean;
}

export interface ResolvedMixedStack {
  index: number;
  options: Options;
  derived: Derived;
  origin: Vec3;
  cans: number;
  height: number;
}

/** One shared channel and its contiguous, equal-length printed spline segments. */
export interface MixedBoundaryConnection {
  firstStackIndex: number;
  secondStackIndex: number;
  firstHeight: number;
  secondHeight: number;
  endFromFront: number;
  startFromFront: number;
  segmentLength: number;
  segmentCount: number;
}

/** Joint sites use the common centred world-X frame, including reversed tiers. */
export interface SharedWallTierSchedule {
  laneRole: LaneRole;
  reversed: boolean;
  terminal: boolean;
  open: boolean;
  primaryEars: number[];
  followerEars: number[];
  pinPositions: number[];
  primaryCoverPins: number[];
  followerCoverPins: number[];
}

/** Every adjacency keeps its original first-stack identity after sharing decisions. */
export type MixedBoundaryPlan =
  | { kind: "retained"; firstStackIndex: number; secondStackIndex: number; reason: string }
  | { kind: "shared"; firstStackIndex: number; secondStackIndex: number; tiers: SharedWallTierSchedule[] };

/** Independent physical rows serialize bottom to top; lanes serialize right to left. */
export interface IndependentLaneRequest {
  canDiameter: number;
  canHeight: number;
  depth: number;
  slope: number;
  lipGap: number;
}

export interface IndependentRowRequest {
  lanes: IndependentLaneRequest[];
  repeat: number;
  rowHeight: number | "auto";
  rowSpan: number | "auto";
  alignment: "left" | "centre" | "right";
  rearLoad: boolean;
}

export type IndependentRowsSharedOptions = Pick<Options,
  "wall" | "clearance" | "fit" | "hexR" | "hexAuto" | "solid" |
  "design" | "pattern" | "bed" | "bedMargin" | "bedKeepOut"
> & { base: "flat" };

export interface IndependentRowsBuildRequest {
  shared: IndependentRowsSharedOptions;
  rows: IndependentRowRequest[];
  shareCompatibleWalls: boolean;
  topCover: boolean;
}

export const INDEPENDENT_ROWS_LIMITS = {
  requestedRows: 8, lanesPerRow: 8, repetitions: 16, expandedRows: 32, expandedLanes: 128,
} as const;
