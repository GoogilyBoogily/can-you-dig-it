// The slicer profile the user imported, cached between visits.
// It is a convenience: a bad cached value must never stop the page loading.

export interface StoredProfile { name: string; config: string }

export const PROFILE_KEY = "cansys.profile";

/** Parse what localStorage handed back. Returns null for anything unusable, and says why. */
export function readStoredProfile(raw: string | null): StoredProfile | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.name === "string" && typeof parsed?.config === "string") return parsed;
    console.error(`discarding stored profile: expected {name, config}, got ${raw.slice(0, 80)}`);
  } catch (err) {
    console.error(`discarding stored profile: ${err}`);
  }
  return null;
}
