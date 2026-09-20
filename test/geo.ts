// One WASM boot and one snapshot build for every geometry test file. bun runs the whole
// suite in one process and caches modules, so this evaluates once however many files
// import it.
import Module from "manifold-3d";
import { Geo } from "../src/geometry";
import { refParts } from "../ref";

const wasm = await Module(); wasm.setup();
export const geo = new Geo(wasm);

let snapshot: ReturnType<typeof refParts> | undefined;
/** The snapshot parts, built once and shared by regress, islands and overhang. */
export const snapshotParts = () => (snapshot ??= refParts(geo));

// Every clearance in the file is K.cl + o.fit, and no built part has ever seen a
// non-zero fit: ref.json is all fit 0, so the six call sites are snapshotted at one
// value. A widened fit moves tab holes, wall notches, both lip pockets, both splice
// sockets and - through fieldBottom - the lattice start on four of five patterns. These
// are held to properties, not to stored numbers, so no snapshot key is added.
let fitted: ReturnType<typeof refParts> | undefined;
export const fitParts = () => (fitted ??= refParts(geo, { fit: 0.3 }));
