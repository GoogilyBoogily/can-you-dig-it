// Fresh real-wall fit samples. Usage: bun prototypes/export-mixed-wall-spline.ts [fresh-directory]
import { mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { DEFAULTS, buildLanePlates, solve, K, type Options } from "../src/geometry";
import { buildMixedSpline, mixedConnectionHeight } from "../src/features/mixed-connection";
import { stand, lay, platePose } from "../src/features/pose";
import { inspectMesh, meshDataOf, packPlan, threeMf, type MeshData } from "../src/export";
import { composeProfile, defaultPicks, filamentsFor, keepOutFromConfig, type ProfileIndex } from "../src/profiles";
import { geo, overhangArea } from "../test/geo";

const output = resolve(process.argv[2] ?? `.slice/mixed-wall-spline-${Date.now()}`);
await mkdir(output);
const machine = "Bambu Lab P2S 0.4 nozzle";
const catalogue: ProfileIndex = await Bun.file("profiles/index.json").json();
const filament = filamentsFor(catalogue, machine).find((candidate) => candidate.label === "Bambu PETG Translucent");
if (!filament) throw new Error("Missing P2S PETG Translucent profile");
const settings = JSON.parse(new TextDecoder().decode(composeProfile(catalogue, {
  ...defaultPicks(catalogue,machine),filament:filament.name,translucent:true,
})));
const profile = new TextEncoder().encode(JSON.stringify({ ...settings,curr_bed_type:"High Temp Plate" }));
const samples = geo.arena(() => {
  const samples: {mesh:MeshData;qty:number}[] = [];
  const requests = [{ canD:66,canL:122.5,length:480,tiers:2 },{ canD:53,canL:134,length:360,tiers:3 }];
  for (const fit of [-0.2,0,0.3]) {
    const stacks = requests.map((request) => {
      const options:Options = {...DEFAULTS,...request,fit,lanesWide:1,left:"none",right:"none"};
      const derived = solve(options);
      return {options,derived,height:mixedConnectionHeight(derived.Hb,derived.split)};
    });
    for (const [index,stack] of stacks.entries()) {
      const name = index === 0 ? "wall-left-closed" : "wall-right-closed";
      const pose = platePose(name,stack.derived.IW,0);
      const connection = {endFromFront:342,height:stack.height};
      const plate = buildLanePlates(geo,stack.options,stack.derived,"bottom",new Set([name]),
        index === 0 ? {left:connection} : {right:connection})[0];
      const realWall = geo.union([plate.front,plate.rear,plate.whole].filter((mesh) => mesh !== undefined).map((mesh) => stand(mesh,pose)));
      const window = geo.box(66,1000,stack.height + 7,-stack.derived.L / 2 + 33,0,(stack.height + 7) / 2);
      const mesh = lay(geo.isect(realWall,window),pose);
      add(`fit-${fit}-front-wall-${index + 1}`,mesh);
    }
    const totalLength = 342 - 14 - 2 * (K.cl + fit);
    add(`fit-${fit}-spline`,buildMixedSpline(geo,stacks[0].options,K.gangGap,
      stacks[0].height,stacks[1].height,totalLength / Math.ceil(totalLength / 40)));
  }
  function add(name:string,mesh:import("manifold-3d").Manifold) {
    if (mesh.status() !== "NoError" || mesh.decompose().length !== 1 || overhangArea(mesh) > 1e-6)
      throw new Error(`${name}: invalid, disconnected or unsupported sample`);
    if (Math.abs(mesh.boundingBox().min[2]) > 1e-6) throw new Error(`${name}: sample does not start on bed`);
    const converted = meshDataOf(name,mesh.getMesh());
    const degenerates = inspectMesh(converted,true);
    if (degenerates) console.info(`${name}: retained ${degenerates} kernel zero-area faces`);
    samples.push({mesh:converted,qty:1});
  }
  return samples;
});
const plan = packPlan(samples,[256,256,256],3,undefined,keepOutFromConfig(profile));
const bytes = threeMf(plan,[256,256,256],{profile});
await Bun.write(join(output,"wall-spline-samples.3mf"),bytes);
const report = {machine,material:filament.label,fit:[-0.2,0,0.3],copies:plan.placements.length,
  plates:Math.max(...plan.placements.map((placement) => placement.plate)) + 1,
  sha256:createHash("sha256").update(bytes).digest("hex"),
  purpose:"Actual front windows of the production wall geometry and one actual equal-length segment per fit, printed in production orientation",
  limitations:"Front samples open at the cut rear edge. They qualify gate insertion, recovery and front withdrawal only; they do not include the complete spline train, closed rear stop, loaded strength or physical fit evidence."};
await Bun.write(join(output,"report.json"),JSON.stringify(report,null,2));
console.log(JSON.stringify({output,...report},null,2));
