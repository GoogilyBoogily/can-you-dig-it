# Shared-wall crest-pin candidate v2

The v1 geometry gate passed but its unchanged first-layer toolpath probes found
missing upper-pin hook coverage at tight/default fit. Slicing unmodified production
pins reproduced the same loss. The original v1 source, tests and failed artifacts
remain as evidence; no probe, threshold or profile was weakened.

V2 adds a straight **0.6 mm upward crest** to the shared divider's wall-top pin.
The original lower return flank, lower crest position, maximum hook reach and
free-root depth remain unchanged. The lead-in and tip move upward 0.6 mm. The
paired wall receiving chamber grows from that exact profile. The cover's chamber
throat remains unchanged while its tent roof and finished thickness rise 0.6 mm;
its 0.8 mm outer skin remains intact. Ordinary outer-wall pins and their sockets
retain the original geometry. Physical insertion force, material recovery and
loaded strength remain unqualified.

Source APIs:

- `sharedCrestPinJoint(geometry, options, crestHeight)` in
  `shared-wall-crest.ts` returns pin, receiving notch, relief, blind cover socket,
  new tip/cover thickness and original root dimensions. Clearance remains K.cl+fit.
- `buildSharedCrestPinCoupon(geometry, options, crestHeight)` returns the real pin,
  relieved root and full wall stem in print coordinates.
- `sharedWallCrestPrototype(geometry, configuration)` in
  `shared-wall-mechanics-v2.ts` composes the full v1 mechanism with the new pair.
  The final candidate defaults to crestHeight=0.6; experimental values are explicit.
- `geometry.buildWall` accepts an optional `WallPinFeatures` pair and receiving-tip,
  hook and root-depth values; perforation keep-outs use those exact dimensions.
  Default call paths remain unchanged.
- `geometry.buildCover` accepts optional finished thickness. V2's common sockets
  are cut from the exact new pair, while outer sockets retain their original roof.

The same 27 complete-mechanism tests passed at P=0.6: 22,956 assertions in 15.54 s.
Nine added pair tests passed P=0.4/0.6/0.8 across all fits, checking containment,
unchanged return/root/reach, printability and roof skin. Additional receiving-ligament
checks exercise the real patterned production wall around its enlarged lower chamber.

The fresh small-coupon ladder passed 432/432 original and added probes at every
P=0.4/0.6/0.8, all three fits and both packed orientations, with the same process
and unchanged 0.27 mm acceptance threshold. Original v1 half-hook coordinates at
the original lower peak were preserved; new crest probes were added separately.
The owner selected P=0.6 as a finite crest with more margin than the smallest tested
0.4 mm candidate. Full v2 pair/triple and all-fit/orientation end-post toolpaths
still require their independent qualification record.

Independent default-geometry comparison loaded the original git-HEAD composer in
an isolated module and checked both solid differences for 42 wall/cover combinations
across fits, standard/minimal designs, lane roles and sides: zero changed solids.
The unchanged reference/features tests passed 215 tests, 1,688 assertions.

A future production boundary must charge the extra 0.6 mm finished cover/pin
headroom. If it cannot fit while preserving the requested tier count and settings,
retain the boundary. Do not shorten tiers or silently change shelf capacity.

The v1 ownership, staggered supports, closed collars, end-wall half-posts, assembly
order and fixed-domain limitations still apply; see `shared-wall-mechanics.md`.
Neither prototype is yet an application generation path.
