import * as THREE from "three";
import type { MeshData, PackedPlan } from "./export";
import type { Derived, Options } from "./model";
import type { Pose } from "./features/pose";
import { assemblyPlacements, assemblyCans, partManifest, previewCounts, mixedPartManifest, mixedAssemblyPlacements, mixedAssemblyCans, mixedPreviewCounts, independentRowsPartManifest, independentRowsAssemblyPlacements, independentRowsAssemblyCans, independentRowsPreviewCounts, type AssemblyPlacement } from "./assembly";
import type { MixedLayout } from "./solver";
import type { IndependentRowsLayout } from "./rows";
import type { PartOut } from "./worker";

const COL = { lane: 0x4a6f92, lip: 0x2b2f36, riser: 0x9b7a3c, cover: 0x7f9dbd, can: 0xc8372d, bed: 0x2a2e35 };

export class Viewer {
  private scene = new THREE.Scene();
  private cam: THREE.PerspectiveCamera;
  private ren: THREE.WebGLRenderer;
  private group = new THREE.Group();
  private cans = new THREE.Group();
  /** Floor furniture under the model: the grid, and the printer bed for scale. Rebuilt
   *  with every view (the group is replaced), so the on/off state lives here. */
  private grid: THREE.Object3D = new THREE.Group();
  private bed: THREE.Object3D = new THREE.Group();
  private gridOn = true;
  private bedOn = false;
  private explodeT = 0;
  private instanceBatches: { mesh: THREE.InstancedMesh; entries: { rest: THREE.Matrix4; push: THREE.Vector3 }[] }[] = [];
  private theta = 2.45; private phi = 1.05; private dist = 600;
  private target = new THREE.Vector3();
  private geoms = new Map<string, THREE.BufferGeometry>();

  constructor(private el: HTMLElement) {
    this.cam = new THREE.PerspectiveCamera(38, 1, 1, 8000);
    this.ren = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.ren.setPixelRatio(Math.min(devicePixelRatio, 2));
    const canvas = this.ren.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "3D organizer preview");
    const help = document.createElement("p");
    help.className = "camera-help";
    help.id = `${el.id}-camera-help`;
    help.textContent = "Drag to orbit; Shift-drag or right-drag to pan; scroll to zoom. With the preview focused, use arrow keys to orbit, Shift + arrows to pan, + / − to zoom, and Home to reset.";
    canvas.setAttribute("aria-describedby", help.id);
    const controls = document.createElement("div");
    controls.className = "camera-controls";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Camera controls");
    for (const [view, label] of [["reset", "Reset view"], ["front", "Front view"], ["side", "Side view"]] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.cameraView = view;
      button.textContent = label;
      button.addEventListener("click", () => this.setCameraView(view));
      controls.appendChild(button);
    }
    for (const [direction, label, factor] of [["in", "Zoom in", 0.85], ["out", "Zoom out", 1 / 0.85]] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.cameraZoom = direction;
      button.textContent = label;
      button.addEventListener("click", () => { this.dist *= factor; this.place(); });
      controls.appendChild(button);
    }
    el.append(canvas, controls, help);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x5a6470, 0.95));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(-1, 1.2, 2); this.scene.add(dl);
    const dl2 = new THREE.DirectionalLight(0xffffff, 0.25); dl2.position.set(1, -1, 0.5); this.scene.add(dl2);
    this.scene.add(this.group);
    this.bindInput();
    new ResizeObserver(() => this.resize()).observe(el);
    this.resize();
    const loop = () => { requestAnimationFrame(loop); this.ren.render(this.scene, this.cam); };
    loop();
  }

  private resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); this.ren.setSize(w, h, false);
    this.ren.domElement.style.width = "100%"; this.ren.domElement.style.height = "100%";
  }

  private place() {
    const { theta, phi, dist, target } = this;
    this.cam.position.set(target.x + dist * Math.sin(phi) * Math.cos(theta), target.y + dist * Math.sin(phi) * Math.sin(theta), target.z + dist * Math.cos(phi));
    this.cam.up.set(0, 0, 1); this.cam.lookAt(target);
  }

  private setCameraView(view: "reset" | "front" | "side") {
    // The dispensing front faces -X, and Z stays up in every standard view.
    this.theta = view === "front" ? Math.PI : view === "side" ? Math.PI / 2 : 2.45;
    this.phi = view === "reset" ? 1.05 : Math.PI / 2;
    this.frame();
  }

  private pan(horizontal: number, vertical: number) {
    const direction = new THREE.Vector3().subVectors(this.cam.position, this.target).normalize();
    const right = new THREE.Vector3().crossVectors(this.cam.up, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right);
    this.target.addScaledVector(right, horizontal * this.dist * 0.0012).addScaledVector(up, vertical * this.dist * 0.0012);
  }

  private bindInput() {
    const c = this.ren.domElement;
    let drag = false, lx = 0, ly = 0, btn = 0;
    c.addEventListener("pointerdown", (e) => { drag = true; lx = e.clientX; ly = e.clientY; btn = e.button; c.setPointerCapture(e.pointerId); });
    // pointercancel too: a touch the browser reinterprets as a scroll or a back gesture
    // fires no pointerup, and the drag stayed live afterwards - the model then rotated
    // under a pointer with no button held.
    for (const end of ["pointerup", "pointercancel"]) c.addEventListener(end, () => (drag = false));
    c.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
      if (btn === 0 && !e.shiftKey) { this.theta -= dx * 0.008; this.phi = Math.min(Math.PI - 0.05, Math.max(0.05, this.phi - dy * 0.008)); }
      else this.pan(dx, dy);
      this.place();
    });
    c.addEventListener("wheel", (e) => { this.dist *= Math.exp(e.deltaY * 0.001); this.place(); e.preventDefault(); }, { passive: false });
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("keydown", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const horizontal = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
      const vertical = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
      if (horizontal || vertical) {
        if (event.shiftKey) this.pan(horizontal * 20, vertical * 20);
        else {
          this.theta -= horizontal * 0.12;
          this.phi = Math.min(Math.PI - 0.05, Math.max(0.05, this.phi - vertical * 0.12));
        }
      } else if (event.key === "+" || event.key === "=") this.dist *= 0.85;
      else if (event.key === "-" || event.key === "_") this.dist /= 0.85;
      else if (event.key === "Home") this.setCameraView("reset");
      else return;
      this.place();
      event.preventDefault();
    });
  }

  private geom(m: MeshData): THREE.BufferGeometry {
    let g = this.geoms.get(m.name);
    if (!g) {
      g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(m.pos, 3));
      g.setIndex(new THREE.BufferAttribute(m.idx, 1));
      g.computeVertexNormals();
      this.geoms.set(m.name, g);
    }
    return g;
  }

  private mesh(m: MeshData, color: number): THREE.Mesh {
    return new THREE.Mesh(this.geom(m), new THREE.MeshStandardMaterial({ color, metalness: 0.05, roughness: 0.62, flatShading: true }));
  }

  private clear() {
    this.scene.remove(this.group);
    this.instanceBatches = [];
    // three.js holds GPU buffers until they are disposed; dropping the JS reference frees
    // nothing. Every view change built a new group and left the old one's buffers behind,
    // so clicking between two plate tabs leaked both plates' geometry every time. Cached
    // geometries outlive the group on purpose - reset() owns those.
    const cached = new Set(this.geoms.values());
    this.group.traverse((object) => {
      const mesh = object as Partial<THREE.Mesh>;
      if (!mesh.geometry) return;
      if (object instanceof THREE.InstancedMesh) object.dispose();
      if (!cached.has(mesh.geometry)) mesh.geometry.dispose();
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material!]) material?.dispose();
    });
    this.group = new THREE.Group(); this.scene.add(this.group);
  }

  private frame(pad = 1.15) {
    // Frame what is on screen. Box3.setFromObject counts invisible objects, and both the
    // bed and the grid are added hidden by default: a 400 mm bed framed the camera for a
    // 400 mm object while a 45 mm part was showing, so the part rendered tiny. Turning
    // the bed on still frames it, which is the point of turning it on.
    const b = new THREE.Box3();
    for (const child of this.group.children) if (child.visible) b.expandByObject(child);
    if (b.isEmpty()) return;
    b.getCenter(this.target);
    this.dist = (b.getSize(new THREE.Vector3()).length() * pad) / (2 * Math.tan((this.cam.fov * Math.PI) / 360));
    this.place();
  }

  /** What the WebGL context still holds. The only way to see a leak from outside; the UI
   *  test reads it through a window hook, since nothing else can observe the renderer. */
  info(): { geometries: number; textures: number; instances: number; objects: number } {
    let instances = 0, objects = 0;
    this.group.traverse((object) => { objects++; if (object instanceof THREE.InstancedMesh) instances += object.count; });
    return { geometries: this.ren.info.memory.geometries, textures: this.ren.info.memory.textures, instances, objects };
  }

  reset() {
    this.clear(); // before the cache empties, or clear() disposes what it is about to lose
    for (const geometry of this.geoms.values()) geometry.dispose();
    this.geoms.clear();
  }

  /** Cans in the assembly view. They sit inside the lanes, so framing on the visible
   *  objects alone still covers them and the camera does not jump when they come on. */
  showCans(on: boolean) { this.cans.visible = on; }

  showGrid(on: boolean) { this.gridOn = on; this.grid.visible = on; }

  /** The printer bed, centred under the model, so the footprint reads against the plate. */
  showBed(on: boolean) { this.bedOn = on; this.bed.visible = on; }

  /** Pull the assembly apart along each joint: 0 is assembled, 1 is fully open. */
  explode(t: number) {
    this.explodeT = t;
    const matrix = new THREE.Matrix4();
    for (const { mesh, entries } of this.instanceBatches) {
      entries.forEach(({ rest, push }, index) => {
        matrix.copy(rest);
        matrix.elements[12] += push.x * t;
        matrix.elements[13] += push.y * t;
        matrix.elements[14] += push.z * t;
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    }
  }

  showPart(p: PartOut, bed: [number, number, number]) {
    this.clear();
    this.group.add(this.mesh(p.mesh, COL[p.role]));
    this.addFloor(bed);
    this.phi = 1.05; this.frame(0.9);
  }

  /** The assembled stack with cans, from the same part meshes. Every plate is modelled
   *  flat, the way it prints; here each one is stood back up inside a group per lane that
   *  carries the tier's position and the cascade's 180° turn. */
  showAssembly(parts: PartOut[], o: Options, d: Derived) {
    const preview = previewCounts(o, d);
    function* cans() { for (const placement of assemblyCans(o, d)) yield { ...placement, stackIndex: 0 }; }
    return this.showAssemblyInstances(parts, partManifest(o, d), assemblyPlacements(o, d),
      [{ diameter: o.canD, height: o.canL, count: preview.cans }], cans(), preview, o.bed);
  }

  showMixedAssembly(parts: PartOut[], layout: MixedLayout) {
    return this.showAssemblyInstances(parts, mixedPartManifest(layout), mixedAssemblyPlacements(layout),
      layout.stacks.map((stack) => ({ diameter: stack.options.canD, height: stack.options.canL, count: stack.cans })),
      mixedAssemblyCans(layout), mixedPreviewCounts(layout), layout.request.shared.bed);
  }

  showIndependentRowsAssembly(parts: PartOut[], layout: IndependentRowsLayout) {
    return this.showAssemblyInstances(parts, independentRowsPartManifest(layout), independentRowsAssemblyPlacements(layout),
      layout.rows.flatMap(row => row.lanes.map(lane => ({ diameter: lane.options.canD, height: lane.options.canL, count: lane.cans }))),
      independentRowsAssemblyCans(layout), independentRowsPreviewCounts(layout), layout.request.shared.bed);
  }

  private showAssemblyInstances(parts: PartOut[], descriptors: { name: string; qty: number }[],
    placements: Iterable<AssemblyPlacement>, canSpecifications: { diameter: number; height: number; count: number }[],
    canPlacements: Iterable<{ stackIndex: number; pose: Pose; push: [number, number, number] }>,
    preview: { stride: number; sampled: boolean; cans: number }, bed: [number, number, number]) {
    this.clear();
    const byName = new Map(parts.map((part) => [part.name, part]));
    const { stride, sampled, cans: canCount } = preview;
    const batches = new Map<string, typeof this.instanceBatches[number]>();
    for (const descriptor of descriptors) {
      const part = byName.get(descriptor.name);
      if (!part) throw new Error(`Assembly is missing ${descriptor.name}`);
      const material = new THREE.MeshStandardMaterial({ color: COL[part.role], metalness: 0.05, roughness: 0.62, flatShading: true });
      const mesh = new THREE.InstancedMesh(this.geom(part.mesh), material, Math.ceil(descriptor.qty / stride));
      const batch = { mesh, entries: [] as { rest: THREE.Matrix4; push: THREE.Vector3 }[] };
      batches.set(descriptor.name, batch);
      this.instanceBatches.push(batch); this.group.add(mesh);
    }
    const matrixOf = (pose: Pose) => {
      const rotation = new THREE.Euler(...pose.rotate.map((angle) => angle * Math.PI / 180) as [number, number, number], "ZYX");
      return new THREE.Matrix4().compose(new THREE.Vector3(...pose.translate), new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(1, 1, 1));
    };
    const seen = new Map<string, number>();
    for (const placement of placements) {
      const index = seen.get(placement.name) ?? 0; seen.set(placement.name, index + 1);
      if (index % stride !== 0) continue;
      batches.get(placement.name)!.entries.push({ rest: matrixOf(placement.pose), push: new THREE.Vector3(...placement.push) });
    }
    const cans = new THREE.Group(); cans.visible = this.cans.visible; this.cans = cans; this.group.add(cans);
    const canBatches = canSpecifications.map((specification) => {
      const cylinder = new THREE.CylinderGeometry(specification.diameter / 2, specification.diameter / 2, specification.height, sampled ? 16 : 36);
      const mesh = new THREE.InstancedMesh(cylinder, new THREE.MeshStandardMaterial({ color: COL.can, roughness: 0.45 }), Math.ceil(specification.count / stride));
      const batch = { mesh, entries: [] as { rest: THREE.Matrix4; push: THREE.Vector3 }[] };
      this.instanceBatches.push(batch); cans.add(mesh);
      return batch;
    });
    const seenCans = canSpecifications.map(() => 0);
    for (const placement of canPlacements) {
      if (seenCans[placement.stackIndex]++ % stride !== 0) continue;
      canBatches[placement.stackIndex].entries.push({ rest: matrixOf(placement.pose), push: new THREE.Vector3(...placement.push) });
    }
    this.explode(this.explodeT);
    this.addFloor(bed);
    this.theta = 2.45; this.phi = 1.0; this.frame(0.8);
    return { sampled, shownCans: canBatches.reduce((count, batch) => count + batch.entries.length, 0), totalCans: canCount };
  }

  /** A print plate as the slicer will see it. */
  showPlate(plan: PackedPlan, bed: [number, number, number]) {
    this.clear();
    const bedMesh = new THREE.Mesh(new THREE.BoxGeometry(bed[0], bed[1], 2), new THREE.MeshStandardMaterial({ color: COL.bed, roughness: 0.9 }));
    bedMesh.position.set(bed[0] / 2, bed[1] / 2, -1); this.group.add(bedMesh);
    const placementsByGeometry = new Map<number, PackedPlan["placements"]>();
    for (const placement of plan.placements) {
      const placements = placementsByGeometry.get(placement.geometry) ?? [];
      placements.push(placement); placementsByGeometry.set(placement.geometry, placements);
    }
    const matrix = new THREE.Matrix4();
    for (const [geometry, placements] of placementsByGeometry) {
      const mesh = new THREE.InstancedMesh(this.geom(plan.geometries[geometry]), new THREE.MeshStandardMaterial({ color: COL.lane, roughness: 0.62, flatShading: true }), placements.length);
      placements.forEach((placement, index) => {
        matrix.makeRotationZ(placement.rotation90 ? Math.PI / 2 : 0);
        matrix.setPosition(...placement.translation); mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox(); mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
    this.phi = 0.8; this.frame(1.1);
  }

  private addFloor(bed: [number, number, number]) {
    const b = new THREE.Box3().setFromObject(this.group);
    const s = Math.max(300, b.getSize(new THREE.Vector3()).length());
    const c = b.getCenter(new THREE.Vector3());
    const gh = new THREE.GridHelper(s, 20, 0xb8c0cc, 0xd6dbe3); gh.rotation.x = Math.PI / 2;
    gh.position.set(c.x, c.y, b.min.z - 0.5); gh.visible = this.gridOn;
    this.grid = gh; this.group.add(gh);
    // the bed's top face sits just under the grid so the lines draw over it
    const bedMesh = new THREE.Mesh(new THREE.BoxGeometry(bed[0], bed[1], 2), new THREE.MeshStandardMaterial({ color: COL.bed, roughness: 0.9 }));
    bedMesh.position.set(c.x, c.y, b.min.z - 1.6); bedMesh.visible = this.bedOn;
    this.bed = bedMesh; this.group.add(bedMesh);
  }
}
