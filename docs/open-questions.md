# Open questions

Concerns and decisions we've parked for later. Each one says what's open, what the code
does today, and where it lives, so whoever picks it up doesn't have to rebuild the context.

When one gets decided, delete it here and put the decision where it belongs: a
design-rules bullet in `CLAUDE.md`, a spec in `docs/superpowers/specs/`, or a code comment.
This file only holds what's still open.

## Load from the back (`o.rearLoad`, added 2026-09-29)

- **Nothing braces the side walls at the open end.** The end wall's body is what stops the
  side walls closing in, and the open tier doesn't have one. The deck ears still hold the
  bottoms apart, and the cover's pin holes hold the tops. Without a cover, I think the
  rear end of the top tier's walls is free to lean in. Unprinted, so we don't actually know
  yet. Options: print one and see, add a tie across the top (it can't go at the bottom,
  that's a stop), or warn when `rearLoad` is on and `cover` is off.
- **The open tier's side walls still have an empty corner slot.** A flat stack's tiers
  share one set of side walls, so the top tier can't be unslotted without its own wall
  parts (two more part names). Cosmetic, I think, but it's a notch in the wall top right
  where you slide cans in. Decide: live with it, or give the rear tier its own walls.
- **Even tier count in a cascade: warn or disable?** The top tier's back is its chute
  there, so nothing opens and `check()` warns. The checkbox stays clickable. Greying it out
  would say it up front, but the form doesn't know the tier count until a layout's picked.
- **~3 mm of headroom.** A can passes over the deck at the open end with about 3 mm to
  spare on the default job (`H = dhi + canD + topgap`). A can a hair over its nominal
  diameter, or a deck printed a bit proud, and it jams at the door. `K.topgap` is the knob
  if a print says so. Don't add a per-feature one.
- **The layout estimate still counts the missing end walls.** `solver.ts` charges a flat
  `laneGrams` per lane. The totals after a build come from the real parts and are right.
  Only the number on the layout card reads high. Fix it if anyone notices.
- **A flat stack only opens its top tier.** Its lower tiers are separate lanes, not fed
  through the top one, so they still load from the front. If loading every tier from
  the back matters, that's per-tier parts again (see the corner-slot item).

## Project-wide

- **Nothing has been printed yet.** Every joint, clearance and `fit` default is untested
  on a real printer. The 2026-09-21 reviewers' consensus was to print one default lane
  before building anything else. That's still the thing that retires the most of this
  list at once.
- **Three specs are written but not built:**
  `docs/superpowers/specs/2026-09-21-sleek-outside-design.md`, `-print-cost-design.md`
  and `-fit-calibration-design.md`. Read the "Amended 2026-09-22" block at the top of each
  first. Those blocks carry the decisions from the second interview.
- **One print-hours number for every printer and filament.** `JOB_FLOW` in `src/main.ts`
  is 7.95 mm³/s, measured on the P2S. Plates spread ±10 % around it. Upgrade path: scale by
  the filament's max volumetric speed once the profile scraper pulls it into the index.
- **The bed keep-out is one rectangle.** `keepOutFromConfig` in `src/profiles.ts` takes the
  bounding box of `bed_exclude_area`. That's exact for every printer that has one today. An
  L-shaped area would need the polygon split.
- **The gang row's end lane keeps a stub of tongue out of its +Y side.** Trimming it means
  a separate end deck and a fifth plate name. We judged it not worth it on 2026-09-22.
- **Lanes under ~260 mm stand loose in a gang.** There's no clear stretch of rail for a
  tongue. `check()` warns and that's all.
- **`README.md` lags the design.** It still describes dovetails, half-laps and one-piece
  lanes. `CLAUDE.md` and the code are right where they disagree.
