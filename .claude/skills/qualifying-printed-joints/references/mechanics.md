# Mechanical assumptions and scientific sources

## Analytical sizing, not a material rating

For a uniform rectangular, small-deflection, end-loaded cantilever, elementary
beam theory gives maximum surface strain approximately
`3 × thickness × deflection / (2 × freeLength²)`. State which dimension is the
thickness in the bending direction and measure free length to the actual root,
not to the plate's outer silhouette. A notch, short/thick beam, tapered prong,
large motion or compliant host changes the model.

The production seam key comment uses a different boundary model: a fixed-fixed
rail with central displacement, approximately
`12 × thickness × deflection / span²`. Do not substitute the cantilever formula
for that model. Its cited 1.8% example and the snaps' 2.5% sizing assumption are
unvalidated design estimates, not allowable strains for Bambu PETG Translucent.

Deflection must cover the actual hook interference after the mouth/clearance,
not just a named catch constant. Separate insertion deflection, seated residual
preload, extraction geometry and load path. Long-term retention should not be
inferred from insertion stiffness. Check the printed host as well as the key.

Print orientation governs layer bonds and raster direction. Current risers print
on their sides so prongs flex in the printed plane; Gridfinity bosses remain
plain. Current keys use a relief between two first-layer rails and end bridges.
Verify toolpath continuity at functional regions rather than demanding every
mathematical tip becomes a full-width extrusion or dismissing all tip omission.

## Primary research and manufacturer guidance

Reviewed 2026-10-15; reopen full methods before using numeric results.

| Source | Supported use | Limits |
|---|---|---|
| [Stankevics et al., 2025, Polymers 17(15), 2075](https://www.mdpi.com/2073-4360/17/15/2075), [PubMed record](https://pubmed.ncbi.nlm.nih.gov/40808122/), DOI `10.3390/polym17152075` | PETG creep and recovery were measured with raster-direction dependence under sustained stress. This supports measuring dwell, residual set and time-dependent retention. | Devil Design PETG, Ultimaker S5, 0.4 mm nozzle, 0.1 mm layers, unidirectional solid specimens at a different process. The article does not validate our material, joints or allowable load. Live full-text retrieval was blocked; searchable methods/abstract and bibliographic record were available. |
| [Effect of Different Standard Geometry Shapes on the Tensile Properties of 3D-Printed Polymer, 2023](https://pubmed.ncbi.nlm.nih.gov/37514419/) | Experimental PETG specimen results depend on geometry and print orientation. Preserve orientation/process when comparing coupons. | Standard tensile specimens are not notched snap prongs or repeatedly assembled joints. Abstract-level research here; obtain full methods before transferring any modulus, strength or strain value. |
| [Covestro, Snap-Fit Joints for Plastic: A Design Guide](https://solutions.covestro.com/-/media/covestro/solution-center/brands/downloads/imported/1556891135.pdf?rev=7b75ed4c2eba4ffd8072b82fbed0bc4d) | Manufacturer reference to consult for snap mechanics, root geometry and deflection assumptions. | Designed for molded engineering plastics, not a source of FFF PETG allowables. Download was unavailable during this pass; its formulas/tables were not used as newly verified evidence. |

**Project inference:** because raster direction, process and sustained loading
matter, use the production coupon followed by a complete loaded lane. No cited
paper establishes an admissible loaded dispenser mass or safe cover-lifting
method. Keep that limitation explicit when documenting future design changes.
