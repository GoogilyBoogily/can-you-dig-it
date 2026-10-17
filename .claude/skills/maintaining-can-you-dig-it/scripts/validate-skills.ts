// Validate the project's skill manifests, local resource links and Codex discovery.
// Run from any working directory: bun path/to/validate-skills.ts
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const skillDirectory = resolve(import.meta.dir, "../..");
const repositoryRoot = resolve(skillDirectory, "../..");
const names = readdirSync(skillDirectory).filter((name) => statSync(join(skillDirectory, name)).isDirectory());
const errors: string[] = [];
const declaredNames = new Set<string>();
let checkedLinks = 0;

for (const name of names) {
  const directory = join(skillDirectory, name);
  const manifestPath = join(directory, "SKILL.md");
  const manifest = readFileSync(manifestPath, "utf8");
  const frontmatter = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(manifest);
  if (!frontmatter) { errors.push(`${name}: missing YAML frontmatter`); continue; }
  const metadata = Bun.YAML.parse(frontmatter[1]) as Record<string, unknown> | null;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    errors.push(`${name}: frontmatter must be an object`); continue;
  }
  const allowedFields = ["name", "description", "license", "allowed-tools", "metadata"];
  for (const key of Object.keys(metadata)) if (!allowedFields.includes(key)) errors.push(`${name}: unknown field ${key}`);
  if (metadata.name !== name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64)
    errors.push(`${name}: invalid name or directory/name mismatch`);
  if (declaredNames.has(String(metadata.name))) errors.push(`${name}: duplicate manifest name`);
  declaredNames.add(String(metadata.name));
  if (typeof metadata.description !== "string" || !metadata.description.trim()
    || metadata.description.length > 1024 || /[<>]/.test(metadata.description))
    errors.push(`${name}: invalid description`);
  if (/\[TODO:/.test(manifest)) errors.push(`${name}: unfinished scaffold`);

  const discoveryPath = join(repositoryRoot, ".agents/skills", name);
  try {
    if (realpathSync(discoveryPath) !== realpathSync(directory)) errors.push(`${name}: Codex discovery resolves to another folder`);
  } catch (error) {
    errors.push(`${name}: Codex discovery missing or unreadable (${error instanceof Error ? error.message : error})`);
  }

  const markdownFiles = [manifestPath];
  const references = join(directory, "references");
  // References are deliberately flat and loaded only through explicit links.
  const entries = readdirSync(directory);
  if (entries.includes("references")) {
    for (const reference of readdirSync(references)) if (reference.endsWith(".md")) markdownFiles.push(join(references, reference));
  }
  const linkedFiles = new Set<string>();
  for (const markdownPath of markdownFiles) {
    const contents = readFileSync(markdownPath, "utf8");
    for (const match of contents.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const destination = match[1];
      if (/^(?:https?:|mailto:|#)/.test(destination)) continue;
      const target = resolve(dirname(markdownPath), decodeURIComponent(destination.split("#")[0]));
      try { realpathSync(target); linkedFiles.add(target); checkedLinks++; }
      catch (error) { errors.push(`${markdownPath}: broken link ${destination} (${error instanceof Error ? error.message : error})`); }
    }
  }
  for (const markdownPath of markdownFiles.slice(1))
    if (!linkedFiles.has(markdownPath)) errors.push(`${name}: unlinked reference ${markdownPath}`);

  const interfacePath = join(directory, "agents/openai.yaml");
  if (entries.includes("agents")) {
    const configuration = Bun.YAML.parse(readFileSync(interfacePath, "utf8")) as { interface?: { display_name?: string; short_description?: string }; policy?: { allow_implicit_invocation?: boolean } };
    if (!configuration?.interface?.display_name || !configuration.interface.short_description)
      errors.push(`${name}: incomplete interface metadata`);
    if (configuration?.policy?.allow_implicit_invocation === false)
      errors.push(`${name}: implicit invocation disabled without a project requirement`);
  }
}

if (errors.length) throw new Error(`Skill validation failed:\n${errors.join("\n")}`);
console.log(`Validated ${names.length} skills, ${checkedLinks} local links, and ${names.length} Codex discovery targets.`);
