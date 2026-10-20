# Shared-wall mechanical prototype

This standalone production-derived experiment establishes a digital geometry gate.
It is not consumed by the application and does not establish physical PETG fit or
loaded strength. Source: `shared-wall-mechanics.ts`; tests:
`../test/shared-wall-mechanics.test.ts`.

## Dimension and ownership map

The boundary centre is Y=0 in this diagram. Both lanes keep their requested IW.
The neutral divider spans Y=[-3,+3]. All wall tabs/pins stay on its -Y print face,
occupying Y=[-3,0]. The divider prints with that face on the bed.

```text
                     X sites (mm), depth 240
             -98     -65     -28      +28     +65     +96
Deck A ear    A                        A
Deck B ear                    B                       B
Cover catch           A                        B

Y: lane A rail | -3       neutral wall        +3 | lane B rail
               | tab/pin [-3,0]                 |
A ear root ----+================================+
B collar       +================================+---- B ear root
          < c + 1.7 mm >
          A rail relieved locally at B sites, through its FULL deck height;
          an independent full-thickness plinth remains inward of that relief.
```

Ear snaps, wall receiving notches, pin snaps, deck wedge, end-wall snaps, lattice,
cover grille, cover blind chamber/45 degree tent roof and front lips are derived
from actual production builders. All actual printable parts are exercised.

- Clearance c = K.cl + fit: 0.05/0.25/0.55 mm at fits -0.2/0/+0.3.
- Follower far-face collar extension = c + K.ligMin: 1.75/1.95/2.25 mm.
- Follower closed far-face Y rail: exactly 1.7 mm, through the 4 mm ear depth.
- Ear X width remains the production 24 mm; tab width/thickness remain 16/3 mm.
  The inherited bottom flare leaves approximately 1.45 mm X end rails at fit +0.3;
  this is not a claim of 1.7 mm material around the entire slot perimeter.
- Ear roots run 1 mm into full 21 mm rail plinths. The primary rail also receives
  plinths at follower-owned sites, including minimal decks.
- Each end wall owns its own half of the common cross-lap post, leaving a c gap
  on each side of the Y=0 partition. Minimum retained half-post width is 2.45 mm.
  Each remains rooted to its own end-wall body and its own deck catches.
- Cover finger half-width in X = 8 + 1.6 + 2c + 0.5 + 1.7:
  11.9/12.3/12.9 mm. This protects the complete pin relief and wall-top bearing
  shoulders as well as the chamber. Each chamber, roof and skin stays on one cover.
- An outside cover has two outer catches and one shared catch. A middle cover has
  two diagonal shared catches, one on each side; its diagonal rocking is tested.

The prototype overrides all stack pin positions with [-65,+65], including outer
walls and outer cover catches, so those remain coordinated. A production adapter
must represent shared versus retained side schedules explicitly; it cannot replace
all pins indiscriminately in a mixed retained/shared row.

## Assembly order and free space

1. At the first tier, lower/interleave the independent decks in Z. At upper tiers,
   lower decks onto the already installed lower walls. Every deck keeps direct
   bearing on both supporting walls.
2. Lower the neutral dividers and outer walls in Z. Ear catches temporarily flex;
   the rigid hosts clear. Upper walls also receive the pins of the wall below.
3. Lower each end wall in Z. Both half-posts enter the same common cross-lap slot;
   each end wall retains its own deck snaps and remaining side bracing.
4. Repeat tiers, then lower each independent cover in Z. Their common strips
   interdigitate; both covers bear on the neutral wall and retain their own catch.

There are no additional loose retainers and no lateral insertion needed in this
fixed whole-part experiment. Digital insertion checks start 20 mm above the final
position. The operator needs free space above the unfinished build at least the
height of the part being installed plus its insertion travel. A later split-part
adapter must assemble longitudinal keys before lowering the joined walls/covers.

Snap insertion deliberately has temporary interference. Tests remove only material
inside actual free-prong/root envelopes from the rigid-host check and require
nonzero full-mesh snap interference. This establishes where flex is needed, not
insertion force, hand fit, elastic recovery or a physical load limit. The existing
production prong design's 0.5 mm catch interference and PETG qualification status
still apply.

## Gate evidence

`bun run check` passed. `bun test test/shared-wall-mechanics.test.ts` passed
27 tests, 22,956 assertions, 0 failures in 15.58 seconds (2026-10-17).

The gate covers 240 mm long, 6 mm thick, flat layouts, slopes 0/3 (the stronger
full assembly cases use 3), 1/2 tiers, 2/3 unequal-width lanes, fits -0.2/0/+0.3,
standard/minimal design and production patterned parts. Triple examples contain
29 physical parts including all six front lips.

Evidence includes connected NoError support-free prints, finite local bounds and
zero minimum Z, real P2S-sized 256 mm pack plans, all-part static collisions,
actual can positions at axial extremes, continuous feed/lift/dispense swept solids,
per-ear upper-tier common-wall projected bearing, per-cover common-wall bearing,
up/down catch obstruction, full follower roll barriers before sampled ear escape
with X/Y clearance play, middle-cover diagonal rocking and lifted diagonal peel (downward bearing removed), independent end-wall
lateral/yaw/roll retention without neighboring end walls, Z insertion rigid-host
clearance, and full-depth collar/root/remaining-rail conservation.

Failures diagnosed before the current passing source:

1. A narrow cover finger enclosed its socket but left too little contact beside
   the wall pin relief. Including K.snapT in the protected envelope retained both
   real wall-top shoulders; the bearing assertions stayed unchanged.
2. A minimal primary deck had no rail/plinth at the follower-owned collar site.
   The collar clearance now leaves a deliberately rooted local plinth there.
3. At follower rear X=98 and fit +0.3 the remaining primary rail touched an end-wall
   snap pocket. Moving that support to X=96 leaves its actual clearance/root intact.
4. Far-world Y coordinates distorted a 45 degree mesh face after Float32 emission.
   Printable decks/covers now remain in their own local print frames.

Fresh mechanism-specific slicing is handled separately and must retain source
hashes, both packed orientations, first and functional upper layers and all fits.
No toolpath, physical-fit or loaded-use result is implied by this geometry record.

## Physical coupon protocol

Print the fresh mechanism coupon with the agreed P2S 0.4 mm, 0.2 mm Standard,
Bambu PETG Translucent and Smooth PEI profile, keeping packed orientations identified.
Try the three fit values first. Record hand insertion, release/retention, visible
prong stress, seam/roof/collar integrity and repeat cycles. Then print the complete
paired and triple specimens: check both-full and one-sided can loading, continuous
feed, front dispensing, end-wall lean and diagonal cover rock. Move a loaded
assembly with its bottom supported. Agree load and dwell before evaluating creep,
residual set or strength; none is numerically qualified here.

## Production contract handoff

The fixed coordinates are evidence, not a generic allocation algorithm. A pure
boundary schedule should own primary/follower ear sites, common pin sites, cover
catch ownership, collar envelope and end-wall half-post ownership for every role
and printable section. It must independently protect existing pin roots, lip and
end-wall snap pockets, chute footprints, seam/key bands and can paths at actual
clearance. Both side schedules must be supplied to each middle deck/end-wall/cover.

Build adapters should consume explicit side state and the agreed schedule without
changing lane IW or tier geometry. Outer/retained sides preserve their original
pin/ear/cover schedule. Source identity must include side state and schedule.
The current experiment has no seams, cascade parity, multiple repeated roles,
Gridfinity or arbitrary unequal-height/depth support, and authorizes no integration
claim for those cases.
