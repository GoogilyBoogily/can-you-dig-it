# Copy and honesty evidence

## Sources consulted

- `index.html:17–27,39–181,184–225`: all static form, result, help and assembly copy.
- `src/main.ts:28–48,94–165,310–440,475–705,724–907,1019–1026`: dynamic stack form, layout, status, results, export, print settings and sharing copy.
- `src/viewer.ts:29–79,142–164,191–234`: actual viewer interaction and sample behavior.
- `src/solver.ts:39–95,112–141,169–182`: mixed rejection details, empty-state requirements and uniform layout behavior.
- `src/validate.ts:9–40,59–88`: field naming, bounds and error copy.
- `src/assembly.ts:27–85,136–145`: generated part identities appearing in the tab strip.
- Supporting source-string inventory: `copy-inventory.md`.

## Concrete findings

1. **Actual cover/copy mismatch.** Uniform results say “the top, through the cover window” whenever style is cascade (`src/main.ts:643`), even if “Cover plate on the top tier” is unchecked (`index.html:102`). The renderer's mixed summary correctly makes “through the cover window” conditional on `options.cover` (`src/main.ts:687–688`). Plain correction: name the cover window only when a cover exists.
2. **Auto-feed checkbox has different contracts by mode.** Uniform “Auto-feed between tiers (cascade)” (`index.html:101`) admits both cascade and flat candidates while checked (`src/solver.ts:121–129`). Mixed checkbox (`src/main.ts:122`) sets the stack's actual cascade mode (`src/solver.ts:49–52`). Uniform choice cards do disclose “auto-feed” or “flat” (`src/main.ts:394`), so the distinction is visible after interpreting the candidates. Plain label: “Include auto-feed layouts” for uniform mode; preserve exact per-stack on/off wording.
3. **Two dimensions for the same can measurement.** Uniform calls the 122.5 mm can dimension “Length” (`index.html:76`); mixed calls it “Can height” (`src/main.ts:113`), and both receive the same preset's second dimension (`src/main.ts:315–317,324–326`). Use “Can height” consistently, with a small measurement illustration if useful.
4. **Printer identity is discovered after build.** First setup exposes “Printer / Bed X / Bed Y / Z” (`index.html:90–97`). Named printer, nozzle, process and filament controls are inside initially hidden results below downloads (`index.html:200–218`). Choosing a named printer then rewrites the earlier build-volume fields and can rebuild geometry (`src/main.ts:823–838`). Same feature can be clearer by putting printer choice beside build volume, keeping custom dimensions available.
5. **Per-stack feature preservation exists but is hard to discover.** “Stack options” is a closed native details element with slope, lip headroom, auto-feed, cover, rear loading and top joining (`src/main.ts:117–126`). Global counterparts disappear in mixed mode (`src/main.ts:164–165`). Summary gives no preview of those six available settings or their current values. Plain disclosure: “Stack options · auto-feed on · cover on” or equivalent concise state summary; retain every existing control.
6. **Order requires mental translation.** The list reads from top to bottom while the help says “In order from right to left when viewed from the front” (`index.html:82`). Reorder buttons say “Move up / Move down” (`src/main.ts:128–129`), with accessible names matching the list movement (`src/main.ts:102`). This is not dishonest behavior; it is a spatial translation cost. Add a front-view strip with numbered stacks, or make “Rightmost / Leftmost” clear at list boundaries.
7. **Mixed errors usually name the offending stack and a usable bound.** Exact depth prints the printer limit (`src/solver.ts:58`); fixed tiers prints maximum count (`:73`); total width prints required shelf width including clearance (`:91`). Other messages state a constraint without the next action: “rear loading requires an odd cascade tier count” (`:76`), “shelf has no room for two cascade tiers” (`:70–71`), or depth exceeding shelf after gap without the available numerical depth (`:60`). Pair these with relevant editable fields and one actionable suggestion, retaining precise refusal behavior.
8. **Uniform no-fit message has a blind spot.** Empty-state copy only gives minimum width and height (`src/main.ts:379–382`, `src/solver.ts:112–118`) although candidate generation drops all lengths below 120 mm (`src/solver.ts:169–182`). A 50–119 mm usable shelf depth is valid form input (`index.html:53,55`; `src/validate.ts:11,13`) but receives width/height advice that does not mention depth. Provide the actual blocking dimension(s).
9. **Technical error units disagree with the control.** Slope displays degrees (`index.html:127`) while shared numeric bounds format every failure in mm (`src/validate.ts:38–40`), including slope and fit (`:20,26`). Mixed stack bound handling distinguishes degrees correctly (`src/validate.ts:77`). This is an error-copy mismatch; no input behavior needs removal.
10. **Initial guidance is concise but the screen starts building automatically.** Heading says “Measure the shelf, pick the can, download the plates” (`index.html:27`) and status initially says “Enter your shelf size to begin” (`:195`), while startup immediately runs `refit(loadHash())` (`src/main.ts:1035–1038`) with populated default dimensions (`index.html:52–54`). Clarify that the initial result is an example until the user enters measurements.
11. **Viewer gestures lack instruction.** Actual gestures are drag to orbit, Shift-drag/other-button drag to pan, wheel to zoom (`src/viewer.ts:57–78`). No corresponding help appears in the static viewer/stage controls (`index.html:187–197`) or dynamic tab section (`src/main.ts:572–596`). A short “Drag to rotate · scroll to zoom” hint reveals existing behavior; include keyboard/single-pointer alternatives if implemented later.
12. **Assembly instructions are complete but difficult to scan.** Uniform and mixed instructions are single long paragraphs at the footer (`index.html:224–225`). They use “deck T”, “hidden keys”, “deck ears”, “retaining gates”, “boundary”, and “key segments”, while part tabs expose generated engineering identifiers verbatim (`src/main.ts:578–579`; example identities `src/assembly.ts:44,50,85,136–145`). Preserve detail in numbered steps and pair each instruction with a labeled part in the assembly preview.
13. **STL export lacks an explicit plain-language format distinction.** Buttons name “Download 3MF project” and “Download STL zip” (`index.html:204–205`); help only explains the prearranged 3MF (`:218`). The STL handler exports geometry with no profile argument while 3MF passes profile configuration (`src/main.ts:713–714`). Add “3MF: arranged plates + selected print settings” and “STL ZIP: individual models for other slicers”, preserving both actions.
14. **One direction word is stale.** Imported profile without build size says “the bed below stays as typed” (`src/main.ts:907`), though bed dimensions precede print settings in document order (`index.html:90–97` versus `:206–215`). Say “your entered build volume stays unchanged”.

## Jargon → plain alternatives

| Existing copy | Suggested plain alternative | Evidence |
| --- | --- | --- |
| Bed X / Bed Y / Z | Build width / Build depth / Build height | `index.html:93–95` |
| Deck slope | Ramp angle | `index.html:127`; `src/main.ts:119` |
| Lip headroom | Space above can at the front | `index.html:130–133`; `src/main.ts:120` |
| Auto-feed between tiers (cascade) | Cans roll down between levels | `index.html:101` |
| Tiers | Levels (use one term consistently) | `src/main.ts:115–116` |
| Fit | Joint tightness | `index.html:174–180` |
| Tongue / Socket / Nothing | Protruding connector / Recessed connector / No connector, with small diagrams | `index.html:162–170` |
| Lane on its cells, across / Along | Position on Gridfinity grid: left–right / front–back | `index.html:144–153` |
| Kumiko / Breeze block | Keep named patterns, show swatch previews | `index.html:113–118` |
| Process | Layer height / print quality, retaining profile's full selected name | `index.html:210`; `src/main.ts:806` |
| Translucent: 1 wall, no shells… | Translucent finish, with existing exact settings in expandable help | `index.html:212` |

## Inflation and manipulation checks

- No marketing superlatives, fabricated badges, forced continuity, hidden prices, scarcity, confirmshaming or account funnels found in consulted UI sources. This is a source-level finding, not a security or full network audit.
- Claims about estimated material are marked approximate, disclose selected-settings assumptions and excluded supports/adhesion/purge (`src/main.ts:615–617,644`). Mixed material estimates have a shorter disclosure that omits the exclusions (`:665–667,681`).
- Sampled previews disclose that capacity and export quantities still contain every part (`src/main.ts:646,700–704`); viewer sampling is real (`src/viewer.ts:197–229`).
- Assembly copy explicitly says printed fit/loaded strength still need qualification, and recommends testing before loading (`index.html:224–225`). No verified-load claim appears.
- “3° rolls a can to the front on its own” is an unconditional physical-performance statement (`index.html:128`; reiterated for any slope >=3 at `src/main.ts:641`). This audit did not perform physical tests, so backing is unverified; consider “Designed to roll…” or qualify by material/print condition if physical testing is absent.
- “Everything runs in your browser” (`index.html:27`) describes local computation consistently with the worker (`src/main.ts:475`); it does not explicitly promise zero network requests, and Google Fonts is referenced (`index.html:20–21`). Do not characterize this as a privacy promise it does not make.

## Per-principle facts (no scores)

- #2 Useful: both printable export formats, sharing, per-stack controls and computed capacities are present (`index.html:196,204–205`; `src/main.ts:117–126,679–697`). Printer choice is sequenced after geometry setup (finding 4).
- #4 Understandable: vocabulary changes for the same can measurement, technical dimension names, unmapped gestures, dense assembly prose and list-to-spatial translation are present (findings 3, 6, 11, 12).
- #6 Honest: precise estimate/sample/physical qualification disclosures exist; cover wording, auto-feed interpretation and error units have specific mismatches (findings 1, 2, 9). No inspected dark patterns.
- #8 Thorough: named bound errors and reload guidance exist (`src/solver.ts:58,73,91`; `src/main.ts:567`). Some valid no-fit cases omit the blocking depth (finding 8).
- #10 As little design as possible: native progressive disclosure already preserves six per-stack capabilities; making state and contents visible can improve simplicity without feature removal (finding 5).

## Inventory method and known gaps

`copy-inventory.md` includes 120 static HTML text/accessible-attribute occurrences and conservative quoted-source-line candidates: main 339, viewer 17, solver 37, validate 49, layout 16, profiles 32, estimate 18. These counts include conditional copy and internal strings; they are not simultaneous visible-string counts. All direct main/viewer source sections supplying UI copy were inspected. Runtime printer catalogue choices, generated part names, browser-provided native form messages, imported filenames and arbitrary propagated error details are not a finite enumerated list. No physical prints, novice user study or third-party slicer launch was performed in this evidence pass. Browser behavior was assigned to other audit evidence gatherers; the findings here are source-based.
