import * as THREE from "three";
import type { MeshData } from "./export";
import { K, laneName, laneXe, platePose, lipPose, type Derived, type Options, type LaneRole, type PlateName, type Pose } from "./geometry";
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
  /** Assembly meshes with where they sit and where the explode slider pushes them at 1. */
  private exploded: { mesh: THREE.Object3D; rest: THREE.Vector3; push: THREE.Vector3 }[] = [];
  private explodeT = 0;
  private theta = 2.45; private phi = 1.05; private dist = 600;
  private target = new THREE.Vector3();
  private geoms = new Map<string, THREE.BufferGeometry>();
  private cached = new Set<THREE.BufferGeometry>(); // the geoms values, for an identity test in clear()

  constructor(private el: HTMLElement) {
    this.cam = new THREE.PerspectiveCamera(38, 1, 1, 8000);
    this.ren = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.ren.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(this.ren.domElement);
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
      else {
        const r = new THREE.Vector3().subVectors(this.cam.position, this.target).normalize();
        const rt = new THREE.Vector3().crossVectors(this.cam.up, r).normalize();
        const up = new THREE.Vector3().crossVectors(r, rt);
        this.target.addScaledVector(rt, dx * this.dist * 0.0012).addScaledVector(up, dy * this.dist * 0.0012);
      }
      this.place();
    });
    c.addEventListener("wheel", (e) => { this.dist *= Math.exp(e.deltaY * 0.001); this.place(); e.preventDefault(); }, { passive: false });
    c.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private geom(m: MeshData): THREE.BufferGeometry {
    let g = this.geoms.get(m.name);
    if (!g) {
      g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(m.pos, 3));
      g.setIndex(new THREE.BufferAttribute(m.idx, 1));
      g.computeVertexNormals();
      this.geoms.set(m.name, g);
      this.cached.add(g);
    }
    return g;
  }

  private mesh(m: MeshData, color: number): THREE.Mesh {
    return new THREE.Mesh(this.geom(m), new THREE.MeshStandardMaterial({ color, metalness: 0.05, roughness: 0.62, flatShading: true }));
  }

  private clear() {
    this.scene.remove(this.group);
    // three.js holds GPU buffers until they are disposed; dropping the JS reference frees
    // nothing. Every view change built a new group and left the old one's buffers behind,
    // so clicking between two plate tabs leaked both plates' geometry every time. Cached
    // geometries outlive the group on purpose - reset() owns those.
    this.group.traverse((object) => {
      const mesh = object as Partial<THREE.Mesh>;
      if (!mesh.geometry) return;
      if (!this.cached.has(mesh.geometry)) mesh.geometry.dispose();
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
  info(): { geometries: number; textures: number } {
    return { geometries: this.ren.info.memory.geometries, textures: this.ren.info.memory.textures };
  }

  reset() {
    this.clear(); // before the cache empties, or clear() disposes what it is about to lose
    for (const geometry of this.geoms.values()) geometry.dispose();
    this.geoms.clear();
    this.cached.clear();
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
    for (const { mesh, rest, push } of this.exploded) mesh.position.copy(rest).addScaledVector(push, t);
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
    this.clear();
    const by = new Map(parts.map((p) => [p.name, p]));
    const cascade = o.cascade;
    const G = d.gangPitch;
    this.exploded = [];
    const STEP = 40; // mm of travel per joint at full explode
    const track = (mesh: THREE.Object3D, px: number, py: number, pz: number) =>
      this.exploded.push({ mesh, rest: mesh.position.clone(), push: new THREE.Vector3(px, py, pz) });
    const IW = d.IW, xe = laneXe(o, d);
    const rad = (deg: number) => (deg * Math.PI) / 180;
    // plate -> lane frame: the same pose geometry lays the plate flat with. three.js
    // "ZYX" is manifold's order - X first, seen from the model
    const posed = (m: THREE.Object3D, p: Pose) => {
      m.rotation.set(rad(p.rotate[0]), rad(p.rotate[1]), rad(p.rotate[2]), "ZYX");
      m.position.set(...p.translate);
    };
    const pose: Record<string, (m: THREE.Object3D) => void> = {
      "deck": () => {},
      "wall-left": (m) => posed(m, platePose("wall-left", IW, xe)),
      "wall-right": (m) => posed(m, platePose("wall-right", IW, xe)),
      "end-wall": (m) => posed(m, platePose("end-wall", IW, xe)),
    };
    const push: Record<string, [number, number, number]> = {
      "deck": [0, 0, 0], "wall-left": [0, STEP, 0], "wall-right": [0, -STEP, 0], "end-wall": [STEP, 0, 0],
    };
    // a plate into a lane group, standing, with its explode push; split halves also part along X
    const putPlate = (lane: THREE.Group, name: string, plate: string, half: "" | "-front" | "-rear") => {
      const p = by.get(name); if (!p) return;
      const m = this.mesh(p.mesh, COL[p.role]);
      pose[plate](m); lane.add(m);
      const [px, py, pz] = push[plate];
      track(m, px + (half === "-front" ? -STEP : half === "-rear" ? STEP : 0), py, pz);
    };
    const put = (parent: THREE.Object3D, name: string, x: number, y: number, z: number, rot = false, pushBy: [number, number, number] = [0, 0, 0], ry = 0) => {
      const p = by.get(name); if (!p) return;
      const m = this.mesh(p.mesh, COL[p.role]);
      m.rotation.set(0, ry, rot ? Math.PI : 0, "ZYX");
      m.position.set(x, y, z); parent.add(m);
      track(m, ...pushBy);
    };
    const can = new THREE.CylinderGeometry(o.canD / 2, o.canD / 2, o.canL, 36); // axis = Y = across the lane
    const canMat = new THREE.MeshStandardMaterial({ color: COL.can, roughness: 0.45 });
    const cans = new THREE.Group(); cans.visible = this.cans.visible; this.cans = cans; this.group.add(cans);
    for (let gI = 0; gI < o.lanesWide; gI++) {
      const y = gI * G;
      for (let t = 0; t < o.tiers; t++) {
        const isBottom = cascade && t === 0;
        const z = cascade ? (t === 0 ? 0 : d.Hb + (t - 1) * d.H) : t * d.H;
        const rot = cascade ? t % 2 === 1 : false;
        const role: LaneRole = isBottom ? "bottom" : t === o.tiers - 1 ? "top" : "mid";
        // each tier lifts off the one below and across from its gang neighbour
        const lane = new THREE.Group();
        lane.position.set(0, y, z); if (rot) lane.rotation.z = Math.PI;
        this.group.add(lane); track(lane, 0, gI * STEP, t * STEP);
        for (const plate of ["deck", "wall-left", "wall-right", "end-wall"] as PlateName[]) {
          // the shelf lane's deck carries the Gridfinity unit below z = 0, like the risers do
          const name = plate === "deck" && t === 0 && o.base === "gridfinity" ? "grid-deck" : laneName(o, role, plate);
          if (d.split && plate !== "end-wall") { putPlate(lane, `${name}-front`, plate, "-front"); putPlate(lane, `${name}-rear`, plate, "-rear"); }
          else putPlate(lane, name, plate, "");
        }
        const xd = isBottom || !cascade ? -d.L / 2 : d.xd;
        if (isBottom || !cascade) { const lp = lipPose(xd, d.tan); put(lane, "end-lip", ...lp.translate, false, [-2 * STEP, 0, 0], rad(lp.rotate[1])); }
        // cans, in the lane's own frame
        const n = isBottom || !cascade ? (cascade ? d.nBottom : d.n) : d.n;
        for (let i = 0; i < n; i++) {
          const xl = xd + K.lipInset + 2.5 + o.canD / 2 + i * (o.canD + 0.5);
          const zl = K.deckLo + (xl - xd) * d.tan + o.canD / 2;
          const c = new THREE.Mesh(can, canMat);
          c.position.set(rot ? -xl : xl, y, z + zl); cans.add(c); track(c, 0, gI * STEP, t * STEP);
        }
      }
      const top = cascade ? d.Hb + (o.tiers - 1) * d.H : o.tiers * d.H;
      // the cover turns with the top lane so its loading window sits over that lane's high end
      const coverRot = cascade && (o.tiers - 1) % 2 === 1;
      const coverPush: [number, number, number] = [0, gI * STEP, (o.tiers + 1) * STEP];
      if (d.split) { put(this.group, "cover-front", 0, y, top, coverRot, coverPush); put(this.group, "cover-rear", 0, y, top, coverRot, coverPush); } else put(this.group, "cover", 0, y, top, coverRot, coverPush);
      if (o.base === "feet") for (const sx of [1, -1]) for (const sy of [1, -1]) put(this.group, "riser-24", sx * d.px, y + sy * d.py, -24, false, [0, gI * STEP, -STEP]);
    }
    this.addFloor(o.bed);
    this.theta = 2.45; this.phi = 1.0; this.frame(0.8);
    this.explode(this.explodeT);
  }

  /** A print plate as the slicer will see it. */
  showPlate(placed: { name: string; pos: Float32Array; idx: Uint32Array; bbox: MeshData["bbox"] }[], bed: [number, number, number]) {
    this.clear();
    const bedMesh = new THREE.Mesh(new THREE.BoxGeometry(bed[0], bed[1], 2), new THREE.MeshStandardMaterial({ color: COL.bed, roughness: 0.9 }));
    bedMesh.position.set(bed[0] / 2, bed[1] / 2, -1); this.group.add(bedMesh);
    for (const p of placed) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(p.pos, 3)); g.setIndex(new THREE.BufferAttribute(p.idx, 1)); g.computeVertexNormals();
      this.group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: COL.lane, roughness: 0.62, flatShading: true })));
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
