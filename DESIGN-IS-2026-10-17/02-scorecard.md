# Can dispenser design scorecard

Total: **15/30**. Scores are a conservative expert heuristic using the design-is rubric, not measured user-success ratings. Each principle is equally weighted. Source and browser evidence are consolidated in [01-evidence.md](01-evidence.md).

1. **Good design is innovative — 2/3**
   Evidence: [E4](01-evidence.md#e4-progressive-disclosure-and-mixed-stack-orientation) and the feature contract show a configurable, previewed mixed-stack workflow.
   Justification: Combining established form/preview patterns improves a specific task; no five-product comparison supports a claim of unique interaction design.

2. **Good design makes a product useful — 1/3**
   Evidence: [E1](01-evidence.md#e1-printer-setup-and-error-recovery), [E2](01-evidence.md#e2-result-and-download-hierarchy): printer recovery requires a detour and exports follow the entire plate inventory.
   Justification: The task is supported, but avoidable detours interrupt primary setup and output.

3. **Good design is aesthetic — 1/3**
   Evidence: [E5](01-evidence.md#e5-plain-language-and-truthful-summaries), desktop screenshot: raw assumptions and unrounded machine decimals dominate the summary column.
   Justification: The palette is coherent, but this is a jarring violation of the otherwise restrained presentation.

4. **Good design makes a product understandable — 1/3**
   Evidence: [E4](01-evidence.md#e4-progressive-disclosure-and-mixed-stack-orientation), [E5](01-evidence.md#e5-plain-language-and-truthful-summaries): engineering labels, inconsistent can dimension names and vertical-to-spatial stack mapping.
   Justification: Several controls need interpretation and help; a first-time comprehension score of 3 is unsupported.

5. **Good design is unobtrusive — 1/3**
   Evidence: [E2](01-evidence.md#e2-result-and-download-hierarchy), [E3](01-evidence.md#e3-mobile-task-continuity), [E6](01-evidence.md#e6-accessible-inspection-and-feedback): long inventories and controls compete with preview/result access.
   Justification: Configuration and inspection chrome competes with the result, particularly on a phone.

6. **Good design is honest — 2/3**
   Evidence: [E5](01-evidence.md#e5-plain-language-and-truthful-summaries): useful approximation and qualification disclosures coexist with incorrect cover-window wording and an unverified unconditional rolling claim.
   Justification: No manipulation was found, but claims and labels do not all match behavior exactly.

7. **Good design is long-lasting — 3/3**
   Evidence: [E7](01-evidence.md#e7-visual-restraint-and-resource-use), `styles.css:1–31`: native controls, restrained colors, straightforward type and explicit themes.
   Justification: The visual language has no conspicuous short-lived trend markers; future readability is an expert judgment.

8. **Good design is thorough down to the last detail — 2/3**
   Evidence: [E6](01-evidence.md#e6-accessible-inspection-and-feedback), [E7](01-evidence.md#e7-visual-restraint-and-resource-use): all six state categories exist, but focus/keyboard and asynchronous announcement details are incomplete.
   Justification: The state system is present, with the focus/accessible-feedback treatment rough rather than absent.

9. **Good design is environmentally friendly — 1/3**
   Evidence: [E7](01-evidence.md#e7-visual-restraint-and-resource-use): 780,736 decoded JavaScript bytes and an unconditional idle render loop; themes and reduced motion work.
   Justification: The 500 KB–2 MB JavaScript band and ongoing rendering match this rubric level; energy use itself was not measured.

10. **Good design is as little design as possible — 1/3**
    Evidence: [E4](01-evidence.md#e4-progressive-disclosure-and-mixed-stack-orientation), [E5](01-evidence.md#e5-plain-language-and-truthful-summaries): contextual Gridfinity/magnet controls, an ignored manual auto-sizing field and expanded machine assumptions unnecessarily occupy the main task surface.
    Justification: Several elements can leave the initial surface through contextual disclosure while every underlying capability remains available.

The rubric yields REDESIGN because the total is below 20. The scope is the workflow and information hierarchy, with the working features and established visual identity preserved.
