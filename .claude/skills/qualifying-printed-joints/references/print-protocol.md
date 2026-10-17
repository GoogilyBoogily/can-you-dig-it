# Coupon and lane qualification

This protocol operationalizes `docs/open-questions.md`; it does not record a
completed print or create a numerical load rating.

## Retain a comparable record

Record source revision/diff, coupon filename/hash, options/fit per sample,
machine and nozzle, slicer version, selected/flattened presets and overrides,
material/spool condition, build plate, layer height, line widths, orientation,
temperatures, cooling, flow and extrusion offset. Record measured dimensions,
insertion/retention observations and photos before removal from the plate.
Different processes or bed axes are distinct experiments, not pooled evidence.

The current coupon uses PETG Translucent, smooth PEI (`High Temp Plate`) and a
60 °C bed, while ordinary app exports follow the selected printer's default bed
type. Inspect the actual project/G-code rather than assuming they match.

## Digital checks before printing

`coupon.ts` clips real parts and verifies valid, nonempty, connected solids,
overhangs, closed mesh conversion, bed margins, keep-outs, no overlap and pitch
axis retention. It includes current seam keys, blind catches, end-wall deck snaps,
the negative-fit minimal root and mirrored gang geometry.

Use the current piece list rather than historical plate counts. Slice all plates
for the intended printer; inspect first layers, both key rails/end bridges,
functional collar regions, snap roots/chambers and the short blind-roof closure.
Account for actual line width/layer height and packed 90° rotations. Compare
G-code Z with the layer's deposited interval, not a top-of-layer label as though
it were the CAD sampling midplane. Apply nozzle/tool offsets before comparing
centreline coverage to geometry. G-code coverage is still approximate evidence.

## Physical checks, in order

1. Check flatness, warp, strings/clumps and bed-edge flare before judging fit.
   Remove only ordinary print debris; record any alteration to a mating surface.
2. Grade each intended pair: drops in, thumb push, needs a tool, or will not seat.
   The current target is a snug hand push with no seated wiggle.
3. Compare same-axis three-ear pitch pairs, then deck-X/wall-Y. Same-axis success
   and crossed-axis failure points to pitch/scale, not a global clearance change.
   Do not automatically ban packing rotations without that evidence.
4. Slide wall/cover halves onto hidden keys along X before lowering the joined
   part. Check flush exterior surfaces, normal/vertical play and pull in both
   directions. Qualify fit 0 and any selected nonzero fit; inspect minimal roots.
5. Check wall-to-wall/cover catches and uncovered end-wall retention. Check
   actual insertion order and room to flex, not only a static seated pose.
6. If a strength trial is requested, use an agreed spare specimen last. Record
   bend/recovery, root fracture or layer separation; don't destroy the only fit
   evidence or a user's sample without agreement.
7. After coupons pass, print one complete lane with its keys. Check long-plate
   warp, feeding/loading transitions and deck ganging. Agree the actual can load,
   dwell period and bottom-supported handling before a loaded trial. Measure
   movement or residual set over time and after unloading.

## Diagnose before changing fit

Uniform tight/loose pairs can justify a fit ladder experiment, but `coupon.ts`
currently builds a single nominal fit plus its specific tight-root sample; it has
no general fit-ladder CLI. A single failing pair points to that joint or local
printing. Cross-axis mismatch points to pitch; layer split points to orientation,
root design or bonding. Stringing/elephant foot needs process/first-layer diagnosis.
Changing every clearance cannot correct all of these causes.

Save accepted process/fit and remaining limits in the existing design/open-question
records. Physical findings must name the exact tested revision and configuration.
