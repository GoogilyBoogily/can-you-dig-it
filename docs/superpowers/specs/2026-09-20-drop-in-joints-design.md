# Drop-in joints

## Why

The sliding-slot cut made every joint straight-sided, and the model still did not read as
a kit you drop together. Three things, from looking at it:

- The wall sat on the deck by 12 mm ears with an 8 × 3 tab in each. Hard to see, hard to
  find with a wall in each hand.
- The wall splice at x = 0 was the one joint that slid sideways: the halves went together
  in Y before the wall went on the deck.
- Six joint shapes - ear and tab, blade and notch, pin and notch, deck T, gang T, lip tab.

What limits the answer: a T or dovetail head only locks when the tongue goes in in its own
plane. The deck splice and the gang tongue do that. A wall dropping onto a deck cannot
carry a head - it would have to pass through the slot - so between a standing plate and a
flat one the only drop-in joint is a straight tab in a straight slot. Between two standing
plates the drop-in joint is the cross-lap: each slotted half way, one dropped over the
other. Neither needs anything off the plate's plane, so the overhang rule holds.

## Corner: a cross-lap

The end wall stands `post` 3 mm in from the lane end. The side wall runs on past it, and
that post is what closes the side wall's slot on the far side. The side wall is slotted
from its top edge down to `te + lap` (12 above the deck end, where the old blades
reached), the wall's own thickness plus clearance wide. The end wall is `OW` wide from
`te + lap` up and `IW` wide below: the side bands it is missing there are its slot, and
they sit over the side wall standing on the deck. Its posts go to the full tier height `H`
whatever the loading lip is, so the tier above and the cover still meet a wall top at the
corner.

The end wall drops in last. The side wall's slot holds it in X both ways; its body holds
the side walls from closing in, and the deck ears hold them out. The deck tab, the side
blades, the side wall's bottom-edge end notch and `sideTabH` are gone.

`solve()` charges the post: `n` and `nBottom` lose `post` mm, `laneLengthFor` adds it. At
5 (the border) the default 480 mm bottom deck lost its seventh can; 3 keeps it.

## Wall splice: a butt

`splitWall` is a plane cut. Each half stands on at least one ear - `laneOf` puts one at
each end of the deck and every interior one clears the seam - and that ear is what holds
the half in X and Y. The tier above and the cover bridge the seam. The wall's keep-out at
the seam is one border wide each side; the rear halves lost their 8 mm tongue, and the
default gang packs on 18 plates, not 19.

## Ears and tabs

`earW` 12 → 24, `tabW` 8 → 16, `gangHead` 18 → 30 (six wider than the neck it ends,
as before). Pins, cover holes and riser bosses follow `tabW`: still one tab shape.

The three numbers that kept an ear off a pin were hand-tuned to 12 and 8 and now derive:

- `tabIn` = `earW / 2 + 1` - the end ear starts 1 mm inside the deck end (was `tabW / 2 +
  3` = 7, which is the same number for a 12 mm ear and would hang a 24 mm one 2 mm past
  the deck).
- `tabClear` = `earW / 2 + tabW / 2 + 2` - an interior ear keeps this from the seam and
  from ±px; `check()` uses the same margin for the front ear against the pin below.
- `pinIn` = `wall + post + tabIn + tabClear` - where ±px sit in from the lane end, just
  clear of the rear ear. Was a fixed 40, which a 24 mm ear reached.

The can-size envelope moves with it: a cascade with cans under 41 mm puts the front ear
on the pin below and `check()` says so (was 37 at 12/8 with the pin at 40). Flat lanes
are unaffected.

## Volume

Default lane, per part: decks +1.6 %, walls −2.8 % (front) / +1 % (rear), end walls
+9 % (full height) to +18 % (top lane, the posts), covers −0.3 %. Minimal decks +18 %:
the plinths under the longer ears. Lip and grid feet unchanged.

## Status, 2026-09-20

On `sliding-slots`, after `cf76656`. `bun run check` clean, `bun test test/` 827 pass,
`bun run test:ui` 29 pass (one profile-reload timeout on the first run, green on rerun),
`ref.json` regenerated and the diff read: every lane plate moves, the lip and the grid
feet do not.

Not done:

- Nothing printed. First print: one `length` 240 top lane, all four plates. What to
  check: the end wall drops into the side walls without persuasion at `fit` 0, the
  posts sit flush with the side walls' outer faces, the 16 mm tabs find their slots by
  feel.
- The overhang test skips triangles under 2e-3 mm² of normal length: a kumiko diagonal
  meeting a pad edge left a 1e-4 mm² sliver with a noise normal. Slivers that small are
  not faces; if one ever grows, the threshold is the first thing to look at.
