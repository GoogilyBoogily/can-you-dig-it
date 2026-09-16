#!/usr/bin/env python3
"""
cansys.py - parametric modular can storage system.

  python3 cansys.py                              # 12 oz cascade, 3 tiers, 2 wide
  python3 cansys.py --preset slim --tiers 4
  python3 cansys.py --can-d 73 --can-l 110 --per-deck 3
  python3 cansys.py --chute 0                    # flat lanes (denser, manual advance)
  python3 cansys.py --bed 220x220x250            # different printer

Outputs one .3mf per part plus can-system.3mf, a multi-plate project with
every part laid out and ready to slice.

Geometry is driven entirely by can diameter, can length and cans-per-deck.
Everything else - lane length, tier height, deck slope, hex cell grid, chute
width, lip position - is derived and range-checked against the build volume.
"""
import argparse, math, os, sys, zipfile
from dataclasses import dataclass, field

import numpy as np
import trimesh
from shapely.geometry import Polygon, box as sbox
from shapely.affinity import scale as sscale

ENG = "manifold"
PRESETS = {                       # name: (diameter, length)  mm
    "12oz":   (66.0, 122.5),      # 355 ml US soda / beer
    "330ml":  (66.3, 115.2),      # Euro 330 ml
    "16oz":   (66.0, 157.0),      # tallboy
    "slim":   (53.0, 134.0),      # 250-330 ml slim / energy
    "250ml":  (53.0, 134.0),
    "8oz":    (53.5, 92.0),       # mini
}


# ============================================================ mesh helpers
def box(sx, sy, sz, cx=0.0, cy=0.0, cz=0.0):
    return trimesh.creation.box(
        extents=[sx, sy, sz],
        transform=trimesh.transformations.translation_matrix([cx, cy, cz]))


def cyl(r, h, cx=0.0, cy=0.0, z0=0.0, seg=48):
    return trimesh.creation.cylinder(
        radius=r, height=h, sections=seg,
        transform=trimesh.transformations.translation_matrix([cx, cy, z0 + h / 2]))


def prism_z(pts_xy, h, z0=0.0):
    m = trimesh.creation.extrude_polygon(Polygon(pts_xy), height=h)
    m.apply_translation([0, 0, z0])
    return m


def prism_y(pts_xz, depth, y0):
    m = trimesh.creation.extrude_polygon(Polygon(pts_xz), height=depth)
    m.apply_transform(trimesh.transformations.rotation_matrix(math.radians(90), [1, 0, 0]))
    m.apply_translation([0, y0 + depth, 0])
    return m


def prism_x(pts_yz, depth, x0):
    m = trimesh.creation.extrude_polygon(Polygon(pts_yz), height=depth)
    T = np.eye(4)
    T[:3, :3] = np.array([[0, 0, 1], [1, 0, 0], [0, 1, 0]], float)
    m.apply_transform(T)
    m.apply_translation([x0, 0, 0])
    return m


def union(p):
    return p[0] if len(p) == 1 else trimesh.boolean.union(p, engine=ENG)


def diff(a, p):
    return trimesh.boolean.difference([a] + list(p), engine=ENG)


def isect(a, b):
    return trimesh.boolean.intersection([a, b], engine=ENG)


# ============================================================ hex lattice
def hex_cells(R, t, bounds, ystretch=1.0, holes=(), min_area=None):
    """Hexagon holes on a uniform-gap grid inside a shapely bounds polygon.

    ystretch=sqrt(3) turns the regular hexagon into the self-supporting cell:
    the left/right ligaments become vertical (they stack into continuous load
    columns) and the peaks land at exactly 45 deg, so nothing needs support.

    Boundaries: the grid is phased so the first row sits on the bottom edge.
    Cells cut by the TOP edge are dropped (a flat-topped hole is a bridge);
    cells cut by the bottom or the sides are clipped (those edges print fine).
    `holes` are solid keep-out bands: cells are clipped around them, not dropped.
    """
    P = R + t / math.sqrt(3.0)
    dx, dy = math.sqrt(3.0) * P, 1.5 * P * ystretch
    hw, hh = math.sqrt(3.0) * R / 2, R * ystretch            # half width / half height
    hexa = Polygon([(R * math.cos(math.radians(90 + 60 * k)),
                     R * math.sin(math.radians(90 + 60 * k))) for k in range(6)])
    hexa = sscale(hexa, 1.0, ystretch, origin=(0, 0))
    x0, y0, x1, y1 = bounds.bounds
    keep = None
    if holes:
        from shapely.ops import unary_union
        keep = bounds.difference(unary_union(list(holes)))
    else:
        keep = bounds
    if min_area is None:
        min_area = 2.5 * t * t
    out = []
    nrow = int((y1 - y0 - 2 * hh) // dy) + 1
    for j in range(-1, nrow + 1):
        cy = y0 + hh + j * dy
        if cy + hh > y1 + 1e-6:
            continue                                         # would need a bridge
        off = dx / 2 if j % 2 else 0.0
        for i in range(-1, int((x1 - x0) // dx) + 3):
            cx = x0 + hw + i * dx + off
            c = Polygon([(px + cx, py + cy) for px, py in hexa.exterior.coords])
            if not c.intersects(keep):
                continue
            c = c.intersection(keep)
            geoms = [c] if c.geom_type == "Polygon" else list(getattr(c, "geoms", []))
            for g in geoms:
                if g.geom_type == "Polygon" and g.area >= min_area and \
                        (g.bounds[2] - g.bounds[0]) >= 2.0 * t:
                    out.append(g)
    return out


def pts(p):
    return list(p.exterior.coords)[:-1]


# ============================================================ the spec
@dataclass
class Spec:
    can_d: float = 66.0
    can_l: float = 122.5
    per_deck: int = 0             # 0 = fit as many as the bed allows
    tiers: int = 3
    lanes_wide: int = 2

    clearance: float = 3.5        # total side slop across the can length
    wall: float = 6.0             # side / end wall thickness
    slope: float = 3.0            # deck slope, degrees (long lanes want shallow)
    deck_lo: float = 4.0          # deck top height at the low end
    topgap: float = 2.0           # headroom over the can
    slack: float = 8.0            # spare deck length
    chute: float = -1.0           # -1 auto (can_d+6+wall), 0 = flat lane
    lip_h: float = 20.0           # dispense lip height above the deck
    length: float = 480.0         # target lane length; > bed => split in halves
    fit: float = 0.0              # added to every clearance (+ looser, - tighter)
    corner_r: float = 5.0         # vertical outer corner radius
    chamfer: float = 1.0          # top outer edge chamfer

    hex_r: float = 9.0
    lig: float = 1.7
    skin: float = 1.8
    border: float = 5.0
    web: float = 3.5              # lattice web thickness (wall is recessed to this)
    solid: bool = False           # skip the lattice entirely

    dovetail: float = 3.0
    dt_base: float = 10.0
    dt_tip: float = 14.0
    dt_cl: float = 0.25
    peg_r: float = 2.0
    peg_h: float = 4.0
    soc_r: float = 2.2
    soc_d: float = 4.5
    splice_base: float = 30.0     # deck splice dovetail, narrow end
    splice_tip: float = 40.0
    splice_depth: float = 8.0
    lap_len: float = 10.0         # wall half-lap length at the splice

    bed: tuple = (256.0, 256.0, 256.0)
    bed_margin: float = 3.0
    part_gap: float = 6.0

    d: dict = field(default_factory=dict)

    def solve(self):
        tan = math.tan(math.radians(self.slope))
        inset = 0.0 if self.chute == 0 else (
            self.can_d + 6.0 + self.wall if self.chute < 0 else self.chute)
        usable_x = self.bed[0] - 2 * self.bed_margin
        usable_y = self.bed[1] - 2 * self.bed_margin

        if self.per_deck > 0:
            n = self.per_deck
            L = round(n * self.can_d + inset + self.wall + self.slack, 1)
        else:
            L = min(self.length, 2 * (usable_x - self.lap_len))
            n = int((L - inset - self.wall - self.slack) // self.can_d)
        split = L > usable_x
        n_bottom = int((L - self.wall - self.slack) // self.can_d)

        IW = round(self.can_l + self.clearance, 1)
        OW = IW + 2 * self.wall
        run = L - inset
        dhi = self.deck_lo + run * tan
        H = math.ceil(dhi + self.can_d + self.topgap)

        dhi_b = self.deck_lo + L * tan            # bottom lane: full-length deck
        H_b = math.ceil(dhi_b + self.can_d + self.topgap)
        self.d = dict(
            n=n, n_bottom=n_bottom, split=split, L=L, IW=IW, OW=OW, H=H,
            H_b=H_b, dhi_b=dhi_b,
            run=run, dhi=dhi, tan=tan, inset=inset,
            xd=-L / 2 + inset,
            px=L / 2 - 40.0, py=IW / 2 + self.wall / 2,
            lipy=IW / 2 - 14.0, lipx=-L / 2 + inset + 8.0,
            rail_hy=IW / 2 - 20.0,
            gang_pitch=OW + self.dovetail,
            plate_x=(L / 2 + self.lap_len if split else L), plate_y=OW + self.dovetail,
            usable_x=usable_x, usable_y=usable_y)
        return self

    def check(self):
        d, w = self.d, []
        big = max(d["usable_x"], d["usable_y"])
        if d["plate_x"] > big:
            w.append("FAIL lane half %.0f > usable bed %.0f - lower --length"
                     % (d["plate_x"], big))
        if d["plate_y"] > big:
            w.append("FAIL lane width %.0f > usable bed %.0f - can too long for this bed"
                     % (d["plate_y"], big))
        if d["L"] > d["usable_x"] and d["plate_y"] > d["usable_y"]:
            w.append("FAIL lane does not fit the bed in either orientation")
        if d["inset"] and d["inset"] - self.wall < self.can_d + 4:
            w.append("FAIL chute clear %.1f < can dia + 4 - cans jam at the drop"
                     % (d["inset"] - self.wall))
        if d["n"] < 1:
            w.append("FAIL zero cans per deck")
        if d["split"] and d["xd"] > -self.splice_depth - 20:
            w.append("FAIL chute reaches the splice - lower --per-deck or raise --length")
        if self.wall < self.dovetail + 2.5:
            w.append("WARN wall %.1f leaves < 2.5 mm behind the dovetail socket"
                     % self.wall)
        if not self.solid and self.lig < 1.6:
            w.append("WARN ligament %.1f under 4 extrusion lines at 0.42 nozzle"
                     % self.lig)
        if d["H"] - d["dhi"] < self.can_d:
            w.append("WARN headroom under the tier above is less than a can")
        return w


# ============================================================ parts
def rounded_rect(L, W, r):
    return sbox(-L / 2, -W / 2, L / 2, W / 2).buffer(r, join_style=1).buffer(-2 * r, join_style=1).buffer(r, join_style=1)


def build_lane(s, bottom=False, top=False):
    """Full lane. bottom=True: no chute, full-length deck, lip slots at the front.
    top=True: nothing drops in from above, so the high-end wall is a loading lip,
    not a wall - cans are pushed in over it from that end."""
    d = s.d
    L, IW, OW = d["L"], d["IW"], d["OW"]
    inset = 0.0 if bottom else d["inset"]
    xd = -L / 2 + inset
    dhi = d["dhi_b"] if bottom else d["dhi"]
    H = d["H_b"] if bottom else d["H"]
    px, py = d["px"], d["py"]
    lipx, lipy = xd + 8.0, d["lipy"]
    fit = s.fit

    ewh = dhi + s.lip_h if top else H            # high-end wall height
    S = [prism_y([(xd, 0), (L / 2, 0), (L / 2, dhi), (xd, s.deck_lo)], OW, -OW / 2)]
    for sy in (1, -1):
        S.append(box(L, s.wall, H, 0, sy * py, H / 2))
    S.append(box(s.wall, IW, ewh, L / 2 - s.wall / 2, 0, ewh / 2))
    body = union(S)
    if s.corner_r > 0:                                   # round the 4 vertical corners
        body = isect(body, prism_z(pts(rounded_rect(L, OW, s.corner_r)), H + 2, -1))
    S = [body]
    for sx in (1, -1):
        for sy in (1, -1):
            S.append(cyl(s.peg_r, s.peg_h, sx * px, sy * py, H))
    dtx = L / 2 - s.dt_tip / 2 - s.corner_r - 6              # dovetails at the ends: no mid-wall
    for dx in (-dtx, dtx):                                #   keep-out band, better parallelism
        S.append(prism_z([(dx - s.dt_base / 2, OW / 2), (dx + s.dt_base / 2, OW / 2),
                          (dx + s.dt_tip / 2, OW / 2 + s.dovetail),
                          (dx - s.dt_tip / 2, OW / 2 + s.dovetail)], H - 32.0, 8.0))
    body = union(S)

    C = []
    if s.chamfer > 0:                                    # top outer edges
        c = s.chamfer
        for sy in (1, -1):
            C.append(prism_x([(sy * OW / 2, H + 0.01), (sy * (OW / 2 - c), H + 0.01),
                              (sy * OW / 2, H - c)][::sy], L + 2, -L / 2 - 1))
    if not s.solid:
        b = s.border
        keep = [sbox(dx - s.dt_tip / 2 - 2.5, 0, dx + s.dt_tip / 2 + 2.5, H)
                for dx in (-dtx, dtx)]
        if d["split"]:
            keep.append(sbox(-s.lap_len - 2.5, 0, 2.5, H))
        panel = sbox(-L / 2 + b, b, L / 2 - b, H - b)
        for c in hex_cells(s.hex_r, s.lig, panel, math.sqrt(3.0), keep):
            for sy in (1, -1):
                C.append(prism_y(pts(c), s.wall + 4, sy * py - (s.wall + 4) / 2))
        # recess the outer face over the lattice field: web = s.web, frame stays s.wall.
        # 45 deg ceiling on the recess so it prints without support.
        rd = s.wall - s.web
        if rd > 0.2:
            from shapely.ops import unary_union
            field = panel.difference(unary_union(keep))
            zt = H - b
            for g in (field.geoms if hasattr(field, "geoms") else [field]):
                gx0, _, gx1, _ = g.bounds
                for sy in (1, -1):
                    yo = sy * OW / 2
                    prof = [(gx0, b - 1), (gx1, b - 1), (gx1, zt - rd), (gx0, zt - rd)]
                    C.append(prism_y(prof, rd + 1, yo - rd if sy > 0 else yo - 1))
                    tri = [(yo - sy * rd, zt - rd), (yo + sy * 1, zt - rd), (yo + sy * 1, zt + 1)]
                    C.append(prism_x(tri[::sy], gx1 - gx0, gx0))
        if ewh - 2 * b > 2 * math.sqrt(3) * s.hex_r:
            epanel = sbox(-IW / 2 + b, b, IW / 2 - b, ewh - b)
            for c in hex_cells(s.hex_r, s.lig, epanel, math.sqrt(3.0)):
                C.append(prism_x(pts(c), s.wall + 4, L / 2 - s.wall - 2))
        # deck centre band: open between the two rails, cross-ties every ~80 mm.
        # (a hex lattice here prints 100 %-dense ligaments and weighs MORE than
        #  the two skins it replaces - measured, not guessed)
        x0, x1 = xd + 6, L / 2 - s.wall - 6
        ties = [lipx]                                        # tie under the lip slots
        if d["split"]:
            ties.append(-s.splice_depth / 2)                 # tie carries the splice
        nt = max(1, int(round((x1 - x0) / 80.0)) - 1)
        ties += [x0 + (x1 - x0) * (i + 1) / (nt + 1) for i in range(nt)]
        ties = sorted(set(round(t, 1) for t in ties))
        tw_ = 8.0
        edges = [x0] + [t + sg * (tw_ / 2 + (6 if abs(t - lipx) < 1 else
                                            s.splice_depth / 2 + 2 if d["split"] and abs(t + s.splice_depth / 2) < 1
                                            else 0)) for t in ties for sg in (-1, 1)] + [x1]
        for a_, b_ in zip(edges[0::2], edges[1::2]):
            if b_ - a_ > 12:
                C.append(box(b_ - a_, 2 * d["rail_hy"], dhi + 4, (a_ + b_) / 2, 0, dhi / 2 + 1))
    for sx in (1, -1):
        for sy in (1, -1):
            C.append(cyl(s.soc_r + fit, s.soc_d, sx * px, sy * py, -0.01))
    for sy in (1, -1):
        C.append(box(12.4 + fit, 5.4 + fit, 40, lipx, sy * lipy, 10))
    bw, tw = s.dt_base + 2 * (s.dt_cl + fit), s.dt_tip + 2 * (s.dt_cl + fit)
    for dx in (-dtx, dtx):
        C.append(prism_z([(dx - bw / 2, -OW / 2), (dx + bw / 2, -OW / 2),
                          (dx + tw / 2, -OW / 2 + s.dovetail),
                          (dx - tw / 2, -OW / 2 + s.dovetail)], H, 8.0))
    m = diff(body, C)
    m.merge_vertices()
    return m


def split_lane(s, lane, bottom=False):
    """Cut at x=0. Rear half gets a deck dovetail tongue + outer wall half-laps;
    front half gets the matching socket + inner half-laps. Slides together
    vertically, no glue."""
    d = s.d
    L, IW, OW = d["L"], d["IW"], d["OW"]
    H = d["H_b"] if bottom else d["H"]
    dhi = d["dhi_b"] if bottom else d["dhi"]
    xd = -L / 2 + (0.0 if bottom else d["inset"])
    cl = s.dt_cl + s.fit
    big = max(L, OW, H) + 20

    rear = isect(lane, box(big, big, big, big / 2, 0, 0))
    front = isect(lane, box(big, big, big, -big / 2, 0, 0))

    # deck tongue: the rear deck's own wedge, extended past the cut, clipped to a dovetail
    wedge = prism_y([(xd, 0), (L / 2, 0), (L / 2, dhi), (xd, s.deck_lo)], OW, -OW / 2)
    sb, st, sd = s.splice_base, s.splice_tip, s.splice_depth
    tongue = isect(wedge, prism_z([(0.5, -sb / 2), (0.5, sb / 2),
                                    (-sd, st / 2), (-sd, -st / 2)], H, -1))
    socket = prism_z([(0.5, -(sb / 2 + cl)), (0.5, sb / 2 + cl),
                      (-sd - cl, st / 2 + cl), (-sd - cl, -(st / 2 + cl))], H + 2, -1)

    # wall half-laps: rear keeps the OUTER half over [-lap, 0], front keeps the INNER half
    lapx = -s.lap_len / 2
    outer_keep = [box(s.lap_len, s.wall / 2 - cl / 2, H + 2, lapx,
                      sy * (OW / 2 - (s.wall / 2 - cl / 2) / 2), H / 2) for sy in (1, -1)]
    outer_cut = [box(s.lap_len + 0.5, s.wall / 2 + cl / 2, H + 2, lapx - 0.25,
                     sy * (OW / 2 - (s.wall / 2 + cl / 2) / 2), H / 2) for sy in (1, -1)]
    rear = union([rear, tongue] + [isect(lane, k) for k in outer_keep])
    front = diff(front, [socket] + outer_cut)
    rear.merge_vertices(); front.merge_vertices()
    return front, rear


def build_lip(s):
    d = s.d
    p = [box(5.0, d["IW"] - 1.0, s.lip_h, 0, 0, s.lip_h / 2)]
    p += [box(4.8, 12.0, 6.0, 0, sy * d["lipy"], -3.0) for sy in (1, -1)]
    m = union(p)
    scoop = trimesh.creation.cylinder(radius=22.0, height=8.0, sections=64,
        transform=trimesh.transformations.rotation_matrix(math.pi / 2, [0, 1, 0])
        @ trimesh.transformations.translation_matrix([0, 0, 0]))
    scoop.apply_translation([0, 0, s.lip_h + 12.0])
    return diff(m, [scoop])


def build_riser(s, h, side=20.0):
    b = union([box(side, side, h, 0, 0, h / 2), cyl(s.peg_r, s.peg_h, 0, 0, h)])
    return diff(b, [cyl(s.soc_r + s.fit, s.soc_d, 0, 0, -0.01)])


def build_cover(s):
    """Flat hex-perforated top so the stack becomes a shelf. Split like the lane."""
    d = s.d
    L, OW, t = d["L"], d["OW"], 2.4
    plate = prism_z(pts(rounded_rect(L, OW, s.corner_r)), t, 0)
    C = [cyl(s.soc_r + s.fit, t + 1, sx * d["px"], sy * d["py"], -0.5)
         for sx in (1, -1) for sy in (1, -1)]
    if not s.solid:
        panel = sbox(-L / 2 + 10, -OW / 2 + 10, L / 2 - 10, OW / 2 - 10)
        keep = [sbox(sx * d["px"] - 8, sy * d["py"] - 8, sx * d["px"] + 8, sy * d["py"] + 8)
                for sx in (1, -1) for sy in (1, -1)]
        if d["split"]:
            keep.append(sbox(-6, -OW, 6, OW))
        for c in hex_cells(s.hex_r, s.lig, panel, holes=keep):
            C.append(prism_z(pts(c), t + 2, -1))
    m = diff(plate, C)
    if d["split"]:
        big = L + 20
        return [isect(m, box(big, big, 10, -big / 2, 0, 0)),
                isect(m, box(big, big, 10, big / 2, 0, 0))]
    return [m]


# ============================================================ 3MF writers
CT = ('<?xml version="1.0" encoding="UTF-8"?>'
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-'
      'package.relationships+xml"/><Default Extension="model" ContentType='
      '"application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'
      '<Default Extension="png" ContentType="image/png"/>'
      '<Default Extension="config" ContentType="text/xml"/></Types>')
RELS = ('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://'
        'schemas.openxmlformats.org/package/2006/relationships"><Relationship '
        'Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/'
        '3dmanufacturing/2013/01/3dmodel"/></Relationships>')
NS = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'


def _obj_xml(oid, mesh, name):
    o = ['<object id="%d" type="model" name="%s"><mesh><vertices>' % (oid, name)]
    o += ['<vertex x="%.4f" y="%.4f" z="%.4f"/>' % tuple(v) for v in mesh.vertices]
    o.append('</vertices><triangles>')
    o += ['<triangle v1="%d" v2="%d" v3="%d"/>' % tuple(t) for t in mesh.faces]
    o.append('</triangles></mesh></object>')
    return "".join(o)


def write_single(mesh, path, name):
    body = ('<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" '
            'xml:lang="en-US" xmlns="%s"><metadata name="Title">%s</metadata>'
            '<resources>%s</resources><build><item objectid="1"/></build></model>'
            % (NS, name, _obj_xml(1, mesh, name)))
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CT)
        z.writestr("_rels/.rels", RELS)
        z.writestr("3D/3dmodel.model", body)


def plate_cols(n):
    """Bambu Studio: compute_colum_count() in PartPlate.hpp - cols = ceil(sqrt(n))."""
    v = math.sqrt(n)
    r = round(v)
    return int(r + 1) if v > r else int(r)


def plate_origin(i, n, bed):
    """PartPlateList::compute_origin: plates go in a ceil(sqrt(n))-wide grid,
    columns along +X, rows along -Y, stride = bed * 1.2 (LOGICAL_PART_PLATE_GAP)."""
    cols = plate_cols(n)
    return ((i % cols) * bed[0] * 1.2, -(i // cols) * bed[1] * 1.2)


def write_project(items, path, bed):
    """items: (name, mesh, plate_index), meshes already positioned in bed coords
    of their own plate. The slicer derives an object's plate from position, so
    the offsets are baked into the vertices and also declared in the config."""
    nplates = max(p for _, _, p in items) + 1
    objs, build, cfg, plates = [], [], [], {}
    for i, (name, mesh, plate) in enumerate(items, start=1):
        ox, oy = plate_origin(plate, nplates, bed)
        m = mesh.copy()
        m.apply_translation([ox, oy, 0])
        objs.append(_obj_xml(i, m, name))
        build.append('<item objectid="%d" transform="1 0 0 0 1 0 0 0 1 0 0 0" '
                     'printable="1"/>' % i)
        cfg.append('<object id="%d"><metadata key="name" value="%s"/>'
                   '<metadata key="extruder" value="1"/>'
                   '<part id="%d" subtype="normal_part">'
                   '<metadata key="name" value="%s"/>'
                   '<metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>'
                   '<mesh_stat edges_fixed="0" degenerate_facets="0" '
                   'facets_removed="0" facets_reversed="0" backwards_edges="0"/>'
                   '</part></object>' % (i, name, i, name))
        plates.setdefault(plate, []).append(i)
    for p in sorted(plates):
        cfg.append('<plate><metadata key="plater_id" value="%d"/>'
                   '<metadata key="plater_name" value=""/>'
                   '<metadata key="locked" value="false"/>' % (p + 1))
        cfg += ['<model_instance><metadata key="object_id" value="%d"/>'
                '<metadata key="instance_id" value="0"/></model_instance>' % o
                for o in plates[p]]
        cfg.append('</plate>')

    body = ('<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" '
            'xml:lang="en-US" xmlns="%s"><metadata name="Application">cansys.py'
            '</metadata><resources>%s</resources><build>%s</build></model>'
            % (NS, "".join(objs), "".join(build)))
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CT)
        z.writestr("_rels/.rels", RELS)
        z.writestr("3D/3dmodel.model", body)
        z.writestr("Metadata/model_settings.config",
                   '<?xml version="1.0" encoding="UTF-8"?><config>%s</config>'
                   % "".join(cfg))


# ============================================================ plate packing
def pack(parts, bed, margin, gap):
    W, D = bed[0] - 2 * margin, bed[1] - 2 * margin
    flat = []
    for name, mesh, qty in parts:
        for k in range(qty):
            flat.append(["%s-%02d" % (name, k + 1) if qty > 1 else name, mesh])
    flat.sort(key=lambda r: -r[1].extents[1])

    out, plate, cx, cy, rowh = [], 0, 0.0, 0.0, 0.0
    for name, mesh in flat:
        ex, ey = mesh.extents[0], mesh.extents[1]
        rot = ex > W and ey <= W and ex <= D
        if rot:
            ex, ey = ey, ex
        if cx + ex > W + 1e-6:
            cx, cy, rowh = 0.0, cy + rowh + gap, 0.0
        if cy + ey > D + 1e-6:
            plate, cx, cy, rowh = plate + 1, 0.0, 0.0, 0.0
        m = mesh.copy()
        if rot:
            m.apply_transform(trimesh.transformations.rotation_matrix(
                math.pi / 2, [0, 0, 1]))
        lo = m.bounds[0]
        m.apply_translation([margin + cx - lo[0], margin + cy - lo[1], -lo[2]])
        out.append((name, m, plate))
        cx += ex + gap
        rowh = max(rowh, ey)
    return out


# ============================================================ estimate
def filament_g(mesh, dz=1.5, shell=1.26, infill=0.0, density=1.27):
    lo, hi = mesh.bounds
    solid, z = 0.0, lo[2] + dz / 2
    while z < hi[2]:
        s = mesh.section(plane_normal=[0, 0, 1], plane_origin=[0, 0, z])
        if s is not None:
            p, _ = s.to_2D()
            for q in p.polygons_full:
                ia = max(q.buffer(-shell).area, 0.0)
                solid += (q.area - ia) + infill * ia
        z += dz
    return solid * dz / 1000.0 * density


# ============================================================ main
def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--preset", choices=sorted(PRESETS), default="12oz")
    ap.add_argument("--can-d", type=float)
    ap.add_argument("--can-l", type=float)
    ap.add_argument("--length", type=float, default=480.0,
                    help="target lane length (mm); longer than the bed => two keyed halves")
    ap.add_argument("--per-deck", type=int, default=0, help="override: cans per upper deck")
    ap.add_argument("--tiers", type=int, default=2)
    ap.add_argument("--lanes-wide", type=int, default=2)
    ap.add_argument("--chute", type=float, default=-1.0,
                    help="-1 auto cascade, 0 flat lanes, or an explicit mm value")
    ap.add_argument("--slope", type=float, default=3.0)
    ap.add_argument("--wall", type=float, default=6.0)
    ap.add_argument("--clearance", type=float, default=3.5)
    ap.add_argument("--fit", type=float, default=0.0,
                    help="add to every clearance: +0.1 looser, -0.1 tighter")
    ap.add_argument("--hex-r", type=float, default=9.0)
    ap.add_argument("--ligament", type=float, default=1.7,
                    help="1.7 = four 0.42 lines; 2.1 = five")
    ap.add_argument("--solid", action="store_true", help="no lattice")
    ap.add_argument("--no-cover", action="store_true")
    ap.add_argument("--bed", default="256x256x256")
    ap.add_argument("--bed-margin", type=float, default=3.0)
    ap.add_argument("--out", default="out")
    ap.add_argument("--no-estimate", action="store_true")
    a = ap.parse_args()

    cd, cl = PRESETS[a.preset]
    s = Spec(can_d=a.can_d or cd, can_l=a.can_l or cl, per_deck=a.per_deck,
             length=a.length, tiers=a.tiers, lanes_wide=a.lanes_wide, chute=a.chute,
             slope=a.slope, wall=a.wall, clearance=a.clearance, fit=a.fit,
             hex_r=a.hex_r, lig=a.ligament, solid=a.solid,
             bed=tuple(float(v) for v in a.bed.lower().split("x")),
             bed_margin=a.bed_margin).solve()

    warn = s.check()
    for w in warn:
        print(w, file=sys.stderr)
    if any(w.startswith("FAIL") for w in warn):
        sys.exit(1)

    d = s.d
    os.makedirs(a.out, exist_ok=True)
    cascade = d["inset"] > 0
    n_upper = s.lanes_wide * (s.tiers - 1) if cascade else s.lanes_wide * s.tiers
    n_bottom = s.lanes_wide if cascade else 0
    n_lip = s.lanes_wide * (1 if cascade else s.tiers)

    parts = []
    def add(name, mesh, qty):
        if d["split"]:
            f, r = split_lane(s, mesh, bottom=(name == "lane-bottom"))
            parts.append((name + "-front", f, qty)); parts.append((name + "-rear", r, qty))
        else:
            parts.append((name, mesh, qty))
    if n_upper:
        add("lane", build_lane(s), n_upper)
    if n_bottom:
        add("lane-bottom", build_lane(s, bottom=True), n_bottom)
    parts.append(("end-lip", build_lip(s), n_lip))
    parts.append(("riser-24", build_riser(s, 24.0), s.lanes_wide * 4))
    parts.append(("riser-08", build_riser(s, 8.0), s.lanes_wide * 4))
    if not a.no_cover:
        cv = build_cover(s)
        for i, m in enumerate(cv):
            parts.append(("cover" + ("-front" if len(cv) > 1 and i == 0 else
                                     "-rear" if len(cv) > 1 else ""), m, s.lanes_wide))

    for name, mesh, _ in parts:
        write_single(mesh, os.path.join(a.out, name + ".3mf"), name)
    placed = pack(parts, s.bed, s.bed_margin, s.part_gap)
    write_project(placed, os.path.join(a.out, "can-system.3mf"), s.bed)

    nplates = max(p for _, _, p in placed) + 1
    cap = (d["n"] * (s.tiers - 1) + d["n_bottom"]) * s.lanes_wide if cascade \
          else d["n"] * s.tiers * s.lanes_wide
    Ht = (d["H_b"] + (s.tiers - 1) * d["H"]) if cascade else s.tiers * d["H"]
    print("\ncan       %.1f dia x %.1f long" % (s.can_d, s.can_l))
    print("lane      %.0f x %.0f x %d mm%s" % (d["L"], d["OW"], d["H"],
          "   two keyed halves of %.0f" % d["plate_x"] if d["split"] else ""))
    if cascade:
        print("capacity  bottom tier %d cans (full deck), upper tiers %d each  ->  %d cans "
              "in %d x %d" % (d["n_bottom"], d["n"], cap, s.tiers, s.lanes_wide))
        print("chute     %.0f mm (%.0f clear); upper tiers rotate 180 deg"
              % (d["inset"], d["inset"] - s.wall))
    else:
        print("capacity  %d per deck  ->  %d cans in %d x %d" % (d["n"], cap, s.tiers, s.lanes_wide))
    print("deck      %.1f deg, rise %.1f mm; tier pitch %d (bottom %d)"
          % (s.slope, d["dhi"] - s.deck_lo, d["H"], d["H_b"]))
    print("assembly  %.0f x %.0f x %.0f mm, gang pitch %.0f"
          % (d["L"], s.lanes_wide * d["gang_pitch"], Ht, d["gang_pitch"]))
    print("plates    %d" % nplates)
    for p in range(nplates):
        print("  plate %-2d %s" % (p + 1, ", ".join(n for n, _, q in placed if q == p)))
    if not a.no_estimate:
        tot = 0.0; per = {}
        for name, mesh, qty in parts:
            g = filament_g(mesh, infill=0.06); per[name] = g; tot += g * qty
        lane_g = sum(v for k, v in per.items() if k.startswith("lane-") and "bottom" not in k) \
                 or per.get("lane", 0)
        print("filament  %.0f g PETG per upper lane, %.0f g total  (2 walls, 6%% gyroid)"
              % (lane_g, tot))
    print("wrote     %s/can-system.3mf + %d part files" % (a.out, len(parts)))


if __name__ == "__main__":
    main()
