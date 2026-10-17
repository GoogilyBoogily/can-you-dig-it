---
name: maintaining-can-you-dig-it
description: Implement cross-layer features and maintain build, dependencies, tests, or project skills in can-you-dig-it. Use for changes spanning the configurator pipeline or project tooling; use the focused skills for isolated geometry, UI, profile, or slicing work.
---

# Maintain can-you-dig-it

This is a browser-only Bun/TypeScript application, with Manifold WASM in a worker,
Three.js rendering, and static GitHub Pages output. Start from the actual checkout:
read `git status --short`, `package.json`, `README.md`, and the relevant current
design rules in `CLAUDE.md`. Check `docs/open-questions.md` before reviving an old
proposal. Dated specs can contain superseded decisions; read their amendments.

## Choose the change boundary

Read [the architecture map](references/architecture.md) when a feature crosses
modules. Follow the existing owners rather than creating another solver, manifest,
pose definition, or profile parser.

| Work | Focused skill |
|---|---|
| Solids, patterns, Gridfinity, kernel ownership, snapshots | [changing-geometry](../changing-geometry/SKILL.md) |
| Capacity, shelf fit, tier roles, quantities and poses | [changing-layout-and-assembly](../changing-layout-and-assembly/SKILL.md) |
| Controls, theme, sharing, worker lifecycle, viewer | [changing-browser-ui](../changing-browser-ui/SKILL.md) |
| Mesh boundaries, packing, STL and 3MF serialization | [exporting-printable-models](../exporting-printable-models/SKILL.md) |
| Preset catalogue, imported settings, material estimates | [maintaining-print-profiles](../maintaining-print-profiles/SKILL.md) |
| Snap/seam sizing and physical fit/load evidence | [qualifying-printed-joints](../qualifying-printed-joints/SKILL.md) |
| Real toolpaths and grams/time | [slicing-with-bambu-cli](../slicing-with-bambu-cli/SKILL.md) |
| Bambu drops settings or rejects a project | [debugging-bambu-3mf-import](../debugging-bambu-3mf-import/SKILL.md) |

## Integrate a feature

- State the intended behavior and assumptions. For a new user dimension, trace
  `Options`/defaults → `LIMITS`/`optionsFrom` → form → hash `KEYS` → solver/build →
  assembly/quantities → viewer/export. A display preference need not become a
  geometry option or shared-link field.
- Keep public signatures and the existing module structure unless a change has
  been explicitly agreed. A new dependency or architecture is an ask-first choice
  under the project's engineering standards.
- Classify failures against the pre-change state. Existing assertion changes need
  user approval when the contract is obsolete; prove the concrete new contract
  first. Never relax tolerances or regenerate references just to remove failures.
- Use [the verification guide](references/verification.md). Report actual commands,
  counts/failures, and missing evidence. A build does not typecheck. Digital checks
  do not establish printed fit or loaded strength.
- Keep changed behavior, amended design rules and deferred decisions together.
  A skill does not authorize a commit, push, deployment, printer job, or deletion.

## Maintain these skills

Canonical files live in `.claude/skills/`; `.agents/skills/<name>` links to the same
folder for Codex. Use repository-relative commands; `CLAUDE_SKILL_DIR` is not a
portable shell variable in every agent host. Keep automatic discovery enabled.

Run `bun .claude/skills/maintaining-can-you-dig-it/scripts/validate-skills.ts` after
editing skills. It validates manifests, links, discovery targets and optional UI
metadata without installing packages. The bundled skill-creator validator can
also be used when its Python YAML dependency is already available.

Add guidance only for demonstrated workflows or non-obvious project constraints.
Research references carry scope, dates and limitations; recheck them when the
relevant dependency, slicer version, material or workflow changes. Avoid copying
upstream manuals into this repository.
