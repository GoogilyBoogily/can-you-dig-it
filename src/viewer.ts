import * as THREE from "three";
import type { MeshData } from "./export";
import type { Derived, Options } from "./geometry";
import type { PartOut } from "./worker";

const COL = { lane: 0x4a6f92, lip: 0x2b2f36, riser: 0x9b7a3c, cover: 0x7f9dbd, can: 0xc8372d, bed: 0x2a2e35 };

export class Viewer {
  private scene = new THREE.Scene();
  private cam: THREE.PerspectiveCamera;
  private ren: THREE.WebGLRenderer;
  private group = new THREE.Group();
  private theta = 2.45; private phi = 1.05; private dist = 600;
  private target = new THREE.Vector3();
  private geoms = new Map<string, THREE.BufferGeometry>();

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
    c.addEventListener("pointerup", () => (drag = false));
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
    }
    return g;
  }

  private mesh(m: MeshData, color: number): THREE.Mesh {
    return new THREE.Mesh(this.geom(m), new THREE.MeshStandardMaterial({ color, metalness: 0.05, roughness: 0.62, flatShading: true }));
  }

  private clear() {
    this.scene.remove(this.group); this.group = new THREE.Group(); this.scene.add(this.group);
  }

  private frame(pad = 1.15) {
    const b = new THREE.Box3().setFromObject(this.group);
    if (b.isEmpty()) return;
    b.getCenter(this.target);
    this.dist = (b.getSize(new THREE.Vector3()).length() * pad) / (2 * Math.tan((this.cam.fov * Math.PI) / 360));
    this.place();
  }

  reset() { this.geoms.clear(); this.clear(); }

  showPart(p: PartOut) {
    this.clear();
    this.group.add(this.mesh(p.mesh, COL[p.role]));
    this.addFloor();
    this.phi = 1.05; this.frame(0.9);
  }

  /** The assembled stack with cans, from the same part meshes. */
  showAssembly(parts: PartOut[], o: Options, d: Derived) {
    this.clear();
    const by = new Map(parts.map((p) => [p.name, p]));
    const cascade = d.inset > 0;
    const G = d.gangPitch;
    const put = (name: string, x: number, y: number, z: number, rot = false, col?: number) => {
      const p = by.get(name); if (!p) return;
      const m = this.mesh(p.mesh, col ?? COL[p.role]);
      if (rot) m.rotation.z = Math.PI;
      m.position.set(x, y, z); this.group.add(m);
    };
    const can = new THREE.CylinderGeometry(o.canD / 2, o.canD / 2, o.canL, 36); // axis = Y = across the lane
    const canMat = new THREE.MeshStandardMaterial({ color: COL.can, roughness: 0.45 });
    const deckLo = 4;
    for (let gI = 0; gI < o.lanesWide; gI++) {
      const y = gI * G;
      for (let t = 0; t < o.tiers; t++) {
        const isBottom = cascade && t === 0;
        const z = cascade ? (t === 0 ? 0 : d.Hb + (t - 1) * d.H) : t * d.H;
        const rot = cascade ? t % 2 === 1 : false;
        const pre = !cascade ? "lane" : isBottom ? "lane-bottom" : t === o.tiers - 1 ? "lane-top" : "lane-mid";
        if (d.split) { put(`${pre}-front`, 0, y, z, rot); put(`${pre}-rear`, 0, y, z, rot); }
        else put(pre, 0, y, z, rot);
        if (isBottom || !cascade) put("end-lip", -d.L / 2 + 8, y, z + deckLo);
        // cans
        const xd = isBottom || !cascade ? -d.L / 2 : d.xd;
        const n = isBottom || !cascade ? (cascade ? d.nBottom : d.n) : d.n;
        for (let i = 0; i < n; i++) {
          const xl = xd + 8 + 2.5 + o.canD / 2 + i * (o.canD + 0.5);
          const zl = deckLo + (xl - xd) * d.tan + o.canD / 2;
          const c = new THREE.Mesh(can, canMat);
          c.position.set(rot ? -xl : xl, y, z + zl); this.group.add(c);
        }
      }
      const top = cascade ? d.Hb + (o.tiers - 1) * d.H : o.tiers * d.H;
      if (d.split) { put("cover-front", 0, y, top); put("cover-rear", 0, y, top); } else put("cover", 0, y, top);
      if (o.feet) for (const sx of [1, -1]) for (const sy of [1, -1]) put("riser-24", sx * d.px, y + sy * d.py, -24);
    }
    this.addFloor();
    this.theta = 2.45; this.phi = 1.0; this.frame(0.8);
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

  private addFloor() {
    const b = new THREE.Box3().setFromObject(this.group);
    const s = Math.max(300, b.getSize(new THREE.Vector3()).length());
    const gh = new THREE.GridHelper(s, 20, 0xb8c0cc, 0xd6dbe3); gh.rotation.x = Math.PI / 2;
    const c = b.getCenter(new THREE.Vector3()); gh.position.set(c.x, c.y, b.min.z - 0.5); this.group.add(gh);
  }
}
