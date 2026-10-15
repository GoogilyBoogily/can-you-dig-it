// Owned Manifold kernel operations. This layer has no product configuration.
import type { CrossSection as CS, Manifold as M, ManifoldToplevel } from "manifold-3d";
import type { Vec2, Vec3 } from "./model";

// ---------------------------------------------------------------- kernel helpers
// manifold-3d registers no finalizer on its shapes: one nobody deletes stays on the WASM
// heap for good, and a build makes thousands - a third of them from methods on other
// shapes (translate, subtract, offset), not from Geo. So every function that can return a
// shape is wrapped, once per module, to hand what it makes to the open arena, and
// Geo.arena frees the lot when its build is done. Outside an arena nothing is tracked:
// tests and scripts keep the shapes they cache.
// isDeleted exists at runtime (embind) but not in manifold-3d's typings
type Shape = { delete(): void; isDeleted(): boolean };
let arenaShapes: Set<Shape> | null = null;
const trackedModules = new WeakSet<object>();

function trackShapes(wasm: ManifoldToplevel) {
  if (trackedModules.has(wasm)) return;
  trackedModules.add(wasm);
  // the instance prototypes are not the constructors' .prototype; take them off a shape
  const probeManifold = wasm.Manifold.cube([1, 1, 1]), probeSection = wasm.CrossSection.square([1, 1]);
  const prototypes = [Object.getPrototypeOf(probeManifold), Object.getPrototypeOf(probeSection)];
  probeManifold.delete(); probeSection.delete();
  const isShape = (value: unknown): value is Shape => value != null && prototypes.includes(Object.getPrototypeOf(value));
  const record = (result: unknown) => {
    if (!arenaShapes) return;
    if (isShape(result)) arenaShapes.add(result);
    else if (Array.isArray(result)) for (const item of result) if (isShape(item)) arenaShapes.add(item);
  };
  const wrapFunctions = (owner: Record<string, unknown>, skip: string[]) => {
    for (const name of Object.getOwnPropertyNames(owner)) {
      const original = owner[name];
      if (skip.includes(name) || typeof original !== "function") continue;
      owner[name] = function (this: unknown, ...args: unknown[]) {
        const result = original.apply(this, args);
        record(result);
        return result;
      };
    }
  };
  for (const prototype of prototypes) wrapFunctions(prototype, ["constructor"]);
  for (const kernelClass of [wasm.Manifold, wasm.CrossSection]) wrapFunctions(kernelClass as unknown as Record<string, unknown>, ["prototype", "length", "name"]);
}

export class Geo {
  private Manifold: typeof M;
  private CrossSection: typeof CS;
  constructor(wasm: ManifoldToplevel) {
    trackShapes(wasm);
    this.Manifold = wasm.Manifold;
    this.CrossSection = wasm.CrossSection;
  }

  /** Run `build` and free every shape made while it runs. Whatever has to outlive it
   *  leaves as plain data (meshDataOf, a volume). A shape already deleted is skipped:
   *  filamentGrams frees its slices as it goes, and union([x]) hands back x itself. */
  arena<T>(build: () => T): T {
    if (arenaShapes) throw new Error("arenas do not nest: the inner one would free the outer one's shapes");
    const shapes = new Set<Shape>();
    arenaShapes = shapes;
    try {
      return build();
    } finally {
      arenaShapes = null;
      let undeletable = 0;
      for (const shape of shapes) {
        try { if (!shape.isDeleted()) shape.delete(); } catch { undeletable++; }
      }
      // after a kernel abort the heap is gone and delete throws; the abort is the error
      // worth reporting, and it is already on its way up
      if (undeletable) console.warn(`arena: ${undeletable} of ${shapes.size} shapes could not be freed (kernel aborted?)`);
    }
  }

  box(sx: number, sy: number, sz: number, cx = 0, cy = 0, cz = 0): M {
    return this.Manifold.cube([sx, sy, sz], true).translate([cx, cy, cz]);
  }
  cyl(r: number, h: number, cx = 0, cy = 0, z0 = 0, seg = 48): M {
    return this.Manifold.cylinder(h, r, r, seg, false).translate([cx, cy, z0]);
  }
  poly(pts: Vec2[]): CS {
    const section = new this.CrossSection([pts], "EvenOdd"); // a constructor, so no wrapper sees it
    arenaShapes?.add(section as unknown as Shape);
    return section;
  }
  rect(x0: number, y0: number, x1: number, y1: number): CS {
    return this.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  }
  prismZ(cs: CS, h: number, z0 = 0): M {
    return cs.extrude(h).translate([0, 0, z0]);
  }
  /** Extrude an (x,z) profile along +Y from y0 to y0+depth. */
  prismY(cs: CS, depth: number, y0: number): M {
    return cs.extrude(depth).rotate([90, 0, 0]).translate([0, y0 + depth, 0]);
  }
  /** Extrude a (y,z) profile along +X from x0 to x0+depth. */
  prismX(cs: CS, depth: number, x0: number): M {
    // (u,v,w) -> (w,u,v): columns are images of e_u, e_v, e_w
    return cs.extrude(depth).transform([0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, x0, 0, 0, 1]);
  }
  roundedRect(L: number, W: number, r: number): CS {
    return this.rect(-L / 2 + r, -W / 2 + r, L / 2 - r, W / 2 - r).offset(r, "Round", 2, 24);
  }
  union(parts: M[]): M {
    return parts.length === 1 ? parts[0] : this.Manifold.union(parts);
  }
  diff(a: M, cuts: M[]): M {
    return cuts.length ? this.Manifold.difference([a, ...cuts]) : a;
  }
  /** A part the way every builder makes one: everything that grows, then everything cut
   *  away, each in one batch boolean. */
  assemble(adds: M[], cuts: M[]): M {
    return this.diff(this.union(adds), cuts);
  }
  isect(a: M, b: M): M {
    return this.Manifold.intersection([a, b]);
  }
  hull(points: (M | Vec3)[]): M {
    return this.Manifold.hull(points);
  }
  cs2d(...cs: CS[]): CS {
    return this.CrossSection.union(cs);
  }
  circle(r: number, seg = 48): CS {
    return this.CrossSection.circle(r, seg);
  }
}

