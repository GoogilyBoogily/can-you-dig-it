// A joint coupon: every joint the default lane uses, cut out of the real parts, on one
// plate. Print it before the ten hours of full plates; if these bind or rattle, so will
// the lane. Pieces are windows on the top lane's parts in the lane frame, laid flat the
// way their plates print, so each carries its plate's frame, recess and fit. It prints the
// way the lane will: translucent PETG (1 wall, solid, 60 °C bed) on the smooth PEI plate.
//
//   bun run coupon.ts                    # P2S 0.4, 0.20mm Standard, PETG Translucent, fit 0
//   bun run coupon.ts "Bambu Lab X1 Carbon 0.4 nozzle"
//
// What goes together:
//   deck-ear + wall-ear            the wall notches over the ear, its tab drops through the slot
//   splice-front + splice-rear     the deck halves drop together at the T
//   gang-tongue + gang-socket      the tongue drops into the socket; wall-tongue notches over the tongue
//   wall-pin-top + wall-pin-bottom the pin on one wall top goes into the notch in the wall above
//   wall-pin-top + cover-corner    the same pin goes through the cover's hole
//   end-wall-corner + wall-corner  the end wall's post drops into the side wall's corner slot
//   lip + lip-pocket               the lip's tabs drop into the deck's pockets
//   pitch-deck + pitch-wall        three ears over ~145 mm into three notches: printer scale,
//                                  not clearance. The -x pair prints along X, the -y pair
//                                  along Y. Same-axis pairs fit and crossed ones do not: the
//                                  printer's X and Y differ, and pack() must stop turning
//                                  decks and side walls.
import Module from "manifold-3d";
import type { Manifold as M } from "manifold-3d";
import { DEFAULTS, Geo, solve, laneOf, buildDeck, buildWall, buildEndWall, buildLip, splitDeck, buildCover } from "./src/geometry";
import { lay, platePose } from "./src/features/pose";
import { pack, threeMf, meshDataOf } from "./src/export";
import { composeProfile, defaultPicks, filamentsFor, keepOutFromConfig, type ProfileIndex } from "./src/profiles";

const machine = process.argv[2] ?? "Bambu Lab P2S 0.4 nozzle";
const out = "coupon.3mf";

const wasm = await Module(); wasm.setup();
const g = new Geo(wasm), o = DEFAULTS, d = solve(o), ln = laneOf(o, d, "top");
if (!d.split || ln.tongues.length === 0) throw new Error("the default lane no longer splits or gangs; pick new windows");

// A box window in the lane frame: x from x0 to x1, everything in y and z unless given.
const BIG = 1000;
const slab = (x0: number, x1: number, z0 = -BIG / 2, z1 = BIG / 2, y0 = -BIG / 2, y1 = BIG / 2): M =>
  g.box(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
const cut = (part: M, x0: number, x1: number, z0?: number, z1?: number, y0?: number, y1?: number) =>
  g.isect(part, slab(x0, x1, z0, z1, y0, y1));
const layLeft = (m: M) => lay(m, platePose("wall-left", d.IW, 0));
const turned = (m: M) => m.rotate([0, 0, 90]);

const deck = buildDeck(g, o, d, ln);
const wall = buildWall(g, o, d, ln, 1); // the +Y wall: the one the gang tongue runs out under
const [deckFront, deckRear] = splitDeck(g, o, d, ln, deck);
const [coverFront] = buildCover(g, o, d);
const endWall = buildEndWall(g, o, d, ln);

// Windows: an interior ear clear of the seam and the tongues, the rear-most tongue, the
// seam itself, and the -X pin, which has no ear or end wall near it (the chute end).
const ear = ln.tabs.filter((t) => t > 0 && t < ln.xe - 40).sort((a, b) => a - b)[0];
const tongue = ln.tongues[ln.tongues.length - 1];
const pin = -d.px;
const wallFoot = 30; // enough wall above the notches to handle and to see the tab root
// the rear half's ears, first to last: the pitch a deck half and its wall have to agree on
const pitchEars = ln.tabs.filter((t) => t > 0).sort((a, b) => a - b);
const [pitchFrom, pitchTo] = [pitchEars[0] - 12, pitchEars[pitchEars.length - 1] + 8];
const pitchDeck = cut(deck, pitchFrom, pitchTo, undefined, undefined, d.IW / 2 - 12, BIG);
const pitchWall = layLeft(cut(wall, pitchFrom, pitchTo, -1, wallFoot));

const pieces: { name: string; mesh: M; qty: number }[] = [
  { name: "coupon-deck-ear", mesh: cut(deck, ear - 20, ear + 20), qty: 1 },
  { name: "coupon-wall-ear", mesh: layLeft(cut(wall, ear - 20, ear + 20, -1, wallFoot)), qty: 1 },
  { name: "coupon-splice-front", mesh: cut(deckFront, -17, 1), qty: 1 },
  { name: "coupon-splice-rear", mesh: cut(deckRear, -12, 17), qty: 1 },
  // no tie in this stretch, so the window is two rails: the tongue's and the socket's
  { name: "coupon-gang-tongue", mesh: cut(deck, tongue - 22, tongue + 22, undefined, undefined, 0, BIG), qty: 1 },
  { name: "coupon-gang-socket", mesh: cut(deck, tongue - 22, tongue + 22, undefined, undefined, -BIG, 0), qty: 1 },
  { name: "coupon-wall-tongue", mesh: layLeft(cut(wall, tongue - 22, tongue + 22, -1, wallFoot)), qty: 1 },
  { name: "coupon-wall-pin-top", mesh: layLeft(cut(wall, pin - 20, pin + 20, ln.H - wallFoot, ln.H + 10)), qty: 1 },
  { name: "coupon-wall-pin-bottom", mesh: layLeft(cut(wall, pin - 20, pin + 20, -1, wallFoot)), qty: 1 },
  { name: "coupon-cover-corner", mesh: cut(coverFront, pin - 20, pin + 20, undefined, undefined, d.py - 22, d.OW / 2 + 1), qty: 1 },
  { name: "coupon-end-wall-corner", mesh: lay(cut(endWall, -BIG / 2, BIG / 2, undefined, undefined, d.py - 30, BIG), platePose("end-wall", 0, ln.xe)), qty: 1 },
  { name: "coupon-wall-corner", mesh: layLeft(cut(wall, ln.xe - 25, BIG, ln.lapZ - 15)), qty: 1 },
  { name: "coupon-lip", mesh: buildLip(g, o, d), qty: 1 },
  { name: "coupon-lip-pocket", mesh: cut(deck, ln.xd - 1, ln.lipx + 14), qty: 1 },
  { name: "coupon-pitch-deck-x", mesh: pitchDeck, qty: 1 },
  { name: "coupon-pitch-wall-x", mesh: pitchWall, qty: 1 },
  { name: "coupon-pitch-deck-y", mesh: turned(pitchDeck), qty: 1 },
  { name: "coupon-pitch-wall-y", mesh: turned(pitchWall), qty: 1 },
];
for (const piece of pieces) {
  if (piece.mesh.isEmpty()) throw new Error(`${piece.name} came out empty; its window misses the part`);
  const bodies = piece.mesh.decompose().length;
  if (bodies !== 1) throw new Error(`${piece.name} is ${bodies} bodies; its window cuts a piece loose`);
}

const index: ProfileIndex = await Bun.file("profiles/index.json").json();
const filament = filamentsFor(index, machine).find((f) => f.label === "Bambu PETG Translucent");
if (!filament) throw new Error(`${machine} has no Bambu PETG Translucent preset`);
const picks = { ...defaultPicks(index, machine), filament: filament.name, translucent: true };
// "High Temp Plate" is Bambu's config name for the smooth PEI plate; the app writes the
// printer's default, textured, and has no plate picker
const config = JSON.parse(new TextDecoder().decode(composeProfile(index, picks)));
const profile = new TextEncoder().encode(JSON.stringify({ ...config, curr_bed_type: "High Temp Plate" }, null, 2));
const parts = pieces.map((piece) => ({ mesh: meshDataOf(piece.name, piece.mesh.getMesh()), qty: piece.qty }));
const placed = pack(parts, o.bed, o.bedMargin, undefined, keepOutFromConfig(profile));
// the pitch pairs mean something only if each prints along its axis: pack() tries a part
// as given before turning it, so check rather than trust it
for (const copy of placed.filter((p) => p.part.startsWith("coupon-pitch-"))) {
  const alongX = copy.bbox[3] - copy.bbox[0] > copy.bbox[4] - copy.bbox[1];
  if (alongX !== copy.part.endsWith("-x")) throw new Error(`${copy.part} was packed along the wrong axis`);
}
await Bun.write(out, threeMf(placed, o.bed, { profile }));
const plates = new Set(placed.map((p) => p.plate)).size;
console.log(`${out}: ${parts.reduce((n, p) => n + p.qty, 0)} pieces on ${plates} plate${plates === 1 ? "" : "s"}, ${machine}, PETG Translucent on smooth PEI, fit ${o.fit}`);
for (const piece of pieces) {
  const b = piece.mesh.boundingBox();
  console.log(`  ${piece.name.padEnd(24)} ×${piece.qty}  ${(b.max[0] - b.min[0]).toFixed(0)} × ${(b.max[1] - b.min[1]).toFixed(0)} × ${(b.max[2] - b.min[2]).toFixed(1)} mm`);
}
