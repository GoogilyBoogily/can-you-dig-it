import type { Manifold } from "manifold-3d";
import { parseConfig, type ProfileIndex } from "./profiles";

export interface EstimateSettings {
  shell: number;
  infill: number;
  topSkin: number;
  bottomSkin: number;
  density: number;
  assumptions: string[];
}

/** Resolve named presets before applying project overrides. Missing settings are
 * explicit assumptions, never inferred from a filament's display name. */
export function estimateSettings(profile?: Uint8Array, catalogue?: ProfileIndex): EstimateSettings {
  let config: Record<string, any> = {};
  const assumptions: string[] = [];
  if (profile) {
    try {
      const parsed = parseConfig(profile);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("print settings must be a JSON object");
      config = parsed;
    } catch (error) {
      console.warn("print estimate uses reference settings because the profile is unreadable", error);
      assumptions.push("unreadable profile; reference print settings");
    }
  }
  const process = catalogue?.processes.find((preset) => preset.name === config.print_settings_id)?.estimateSettings;
  const filament = catalogue?.filaments.find((preset) => preset.name === config.filament_settings_id?.[0])?.estimateSettings;
  const values = { ...process, ...filament, ...config };
  const number = (key: string, fallback: number, minimum = 0, maximum = Infinity): number => {
    const raw = Array.isArray(values[key]) ? values[key][0] : values[key];
    const parsed = raw === undefined || raw === "" ? NaN : Number(String(raw).replace(/%$/, ""));
    if (Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum) return parsed;
    assumptions.push(`${key}=${fallback}`);
    return fallback;
  };
  const layerHeight = number("layer_height", 0.2, Number.MIN_VALUE);
  const nozzle = number("nozzle_diameter", 0.4, Number.MIN_VALUE);
  const width = (key: string): number | undefined => {
    const raw = Array.isArray(values[key]) ? values[key][0] : values[key];
    if (String(raw).endsWith("%")) {
      const percentage = Number(String(raw).slice(0, -1));
      if (Number.isFinite(percentage) && percentage > 0) return nozzle * percentage / 100;
    }
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return undefined;
  };
  const lineWidth = width("line_width") ?? number("line_width", nozzle * 1.05, Number.MIN_VALUE);
  const walls = number("wall_loops", 3);
  const shell = walls === 0 ? 0 : (width("outer_wall_line_width") ?? lineWidth) + Math.max(0, walls - 1) * (width("inner_wall_line_width") ?? lineWidth);
  return {
    shell, infill: number("sparse_infill_density", 6, 0, 100) / 100,
    topSkin: Math.max(number("top_shell_layers", 5) * layerHeight, number("top_shell_thickness", 0)),
    bottomSkin: Math.max(number("bottom_shell_layers", 5) * layerHeight, number("bottom_shell_thickness", 0)),
    density: number("filament_density", 1.27, Number.MIN_VALUE), assumptions,
  };
}

/** Approximate extrusion volume using the actual perimeters, infill and asymmetric
 * skins. This is not a slicer: bridges, overlap, supports and adhesion are excluded. */
export function estimateVolume(mesh: Manifold, settings: EstimateSettings, maximumLayerStep = 0.5): number {
  const bounds = mesh.boundingBox();
  const height = bounds.max[2] - bounds.min[2];
  if (settings.infill === 1) return mesh.volume();
  const steps = Math.max(Math.ceil(height / maximumLayerStep), 8), step = height / steps;
  let volume = 0;
  for (let index = 0; index < steps; index++) {
    const section = mesh.slice(bounds.min[2] + (index + 0.5) * step);
    const sections = [section];
    try {
      const area = section.area();
      if (area <= 0) continue;
      const shrunk = section.offset(-settings.shell, "Miter"); sections.push(shrunk);
      const above = mesh.slice(bounds.min[2] + (index + 0.5) * step + settings.topSkin); sections.push(above);
      const below = mesh.slice(bounds.min[2] + (index + 0.5) * step - settings.bottomSkin); sections.push(below);
      const capped = shrunk.intersect(above); sections.push(capped);
      const core = capped.intersect(below); sections.push(core);
      volume += (area - Math.max(0, core.area()) * (1 - settings.infill)) * step;
    } finally { for (const crossSection of sections) crossSection.delete(); }
  }
  return volume;
}
