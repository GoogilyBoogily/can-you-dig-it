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
