import { bboxOf, type MeshData } from "../src/export";

/** Closed tetrahedron with its first face in z=0 and all faces wound outward. */
export const solidFixture = (name = "test-part"): MeshData => {
  const pos = new Float32Array([0, 0, 0, 10, 0, 0, 0, 20, 0, 0, 0, 30]);
  return { name, pos, idx: new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]), bbox: bboxOf(pos) };
};
