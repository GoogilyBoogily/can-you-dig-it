// Reads a ref.json change part by part: which parts moved, by how much volume, and which
// bound. `git diff ref.json` shows the same lines, but not the delta, and a 0.3 % move
// hides in a six-digit volume.
//
//   bun ${CLAUDE_SKILL_DIR}/ref-diff.ts                # working tree against HEAD
//   bun ${CLAUDE_SKILL_DIR}/ref-diff.ts HEAD~3         # working tree against a commit
//   bun ${CLAUDE_SKILL_DIR}/ref-diff.ts 266975a~1 266975a   # one commit's own change
import { $ } from "bun";

type Part = { vol: number; min: number[]; max: number[] };
type Ref = Record<string, Part> & { spec?: Record<string, number | string> };

// ponytail: 0.001 mm hides float noise from a manifold-3d bump; regress holds 0.01
const BOUND_NOISE = 1e-3;

const root = (await $`git rev-parse --show-toplevel`.text()).trim();
const [base = "HEAD", head] = process.argv.slice(2);
const read = async (revision?: string): Promise<Ref> =>
  revision ? JSON.parse(await $`git -C ${root} show ${revision}:ref.json`.text()) : Bun.file(`${root}/ref.json`).json();
const before = await read(base), after = await read(head);

const specBefore = before.spec ?? {}, specAfter = after.spec ?? {};
for (const key of new Set([...Object.keys(specBefore), ...Object.keys(specAfter)]))
  if (specBefore[key] !== specAfter[key]) console.log(`spec.${key}: ${specBefore[key]} -> ${specAfter[key]}`);

const names = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((name) => name !== "spec").sort();
for (const name of names) {
  const old = before[name], now = after[name];
  if (!old) { console.log(`+ ${name} (new part, vol ${now.vol})`); continue; }
  if (!now) { console.log(`- ${name} (removed)`); continue; }
  const bounds = (["min", "max"] as const).flatMap((side) => [0, 1, 2]
    .filter((axis) => Math.abs(old[side][axis] - now[side][axis]) > BOUND_NOISE)
    .map((axis) => `${side}.${"xyz"[axis]} ${old[side][axis]} -> ${now[side][axis]}`));
  if (old.vol === now.vol && bounds.length === 0) continue;
  const delta = now.vol - old.vol;
  console.log(`~ ${name}: vol ${delta >= 0 ? "+" : ""}${delta.toFixed(3)} mm³ (${(100 * delta / old.vol).toFixed(3)} %)${bounds.length ? "; " + bounds.join(", ") : ""}`);
}
