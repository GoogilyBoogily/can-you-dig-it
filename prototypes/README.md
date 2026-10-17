# Mixed-stack connection feasibility prototype

This is an isolated mechanical experiment for one connected organizer with unlike
can sizes and front-to-back container depths. The browser does not import it.
The existing product geometry, defaults, and `ref.json` are unchanged.

## Candidate

The example has three front-aligned stacks:

| Can diameter × height | Depth | Cascade tiers |
|---|---:|---:|
| 66 × 122.5 mm | 480 mm | 2 |
| 53 × 134 mm | 360 mm | 3 |
| 66 × 122.5 mm | 300 mm | 2 |

Each bottom deck gains a 10 mm lower frame. Its original bed footprint extends
downward so the existing ties remain supported during printing. Two transverse
rails connect each neighboring pair. A T locates the pair in the shelf plane;
a key crosses the T and receiving rail to obstruct lifting. Three bearing
regions on the key locate both hosts. Two printed snap keepers capture each key
axially. All parts print flat, with snap fingers in the printed plane.

Connection locations are planned per boundary, including keep-outs for the
receiver's original deck ears and both keeper heads. At fit 0, the example's
front connections are 51.4 mm from the dispensing fronts. The rear connections
are 299.6 mm for the first pair and 239.6 mm for the second. Thus the middle stack
has different features on its two sides.

The prototype rejects an arrangement when two separated rails cannot preserve
the receiver's existing attachments. For example, the 381 mm slim receiver does
not have suitable space. This experiment is not a general mixed-build solver.
It uses the default P2S bed, covered standard cascades, flat bases, and shared
wall thickness, slope, fit, and print settings.

## Generate review files

From the repository root:

```sh
bun test test/mixed-stack-prototype.test.ts
bun prototypes/export-mixed-stack-connection.ts
```

The exporter creates a fresh `.slice/mixed-stack-prototype-<timestamp>/` directory
and prints its path. A supplied output directory must not already exist:

```sh
bun prototypes/export-mixed-stack-connection.ts .slice/my-new-connection-run
```

- `organizer.3mf`: every part of the full example, 104 copies on 26 plates.
- `connection-samples.3mf`: actual modified-deck windows, keys and keepers at fit
  −0.2, 0 and +0.3, 15 pieces on one plate.
- `report.json`: exact options, connection locations, quantities, geometry-volume
  material comparison, assembly sequence, profile, and file SHA-256 hashes.

Exports use P2S 0.4 mm, PETG Translucent, and smooth PEI (`High Temp Plate`).
The normal app export behavior is unchanged. Run the existing faithful slicer
helper against the sample file to obtain fresh toolpath evidence:

```sh
bun .claude/skills/slicing-with-bambu-cli/slice-3mf.ts path/to/connection-samples.3mf
```

## Assembly and evidence limits

1. Join the bottom-deck halves, then lower adjacent Ts together.
2. Insert the rear keys from the front first. Install both keepers for each key.
3. Insert the front keys and install their keepers.
4. Install the bottom walls and the remaining normal assembly parts.

Perform these steps before placing the completed assembly on the shelf; the
keepers install from above before the bottom walls cover their access paths.
The sample pieces are only joint windows; they do not qualify the long entry
path. The tests check that path on the actual full decks using a swept key.

Sixteen focused tests exercise the actual sample assemblies at fit endpoints:
valid connected solids, support-free print faces, closed mesh conversion, exact
quantities and packing, key insertion, translation restraint, original wall-catch
material/capture, and rotation restraint with keys at measured axial stops.
Mixed whole/split decks and explicit failure of impossible inputs are included.
Rotation checks establish geometric obstruction, not stiffness or load capacity.

The final local review export is
`.slice/mixed-stack-prototype-1792196676856/`. Its sample sliced with Bambu Studio
02.08.02.61 in `.slice/connection-samples-bVzWQE/`: process/result code 0, no
internal diagnostics, 110.27 g, 13 h 30 m 46 s. G-code confirms 0.2 mm layers,
270 °C nozzle, 60 °C smooth PEI, one wall, 100% infill, and no supports. Approximate
bead inspection is in that run's `toolpath-sections.json`: all three keys have
connected first layers and both end bridges; keeper-root sections retain two
1.3 mm first-layer regions and two 1.6 mm regions at 1.6 mm height. Narrow upper
key tips are omitted by the slicer. This is not full-volume deposition or printed
fit qualification. The analysis script is preserved alongside that evidence.

The candidate adds **10 mm height and 1,332.10 g of solid PETG**, approximately
28.8% above the three independent stacks' 4,625.21 g. These are geometry-volume
comparisons, not a slice measurement of the full 26-plate job. The substantial
cost and rejected depth pairs make this a feasibility candidate to improve
before adopting it as the production mixed-stack interface.

Printed insertion force, snap recovery, play, creep, asymmetric loading and
bottom-supported handling remain unverified. No printer job has been sent.
