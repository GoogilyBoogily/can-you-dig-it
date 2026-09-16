// The slicer profile the user imported, cached between visits.
// It is a convenience: nothing about it may stop the page loading. That means
// guarding the storage *access* too - reading localStorage throws outright when
// cookies are blocked, in Safari private browsing, and in a sandboxed iframe.

export interface StoredProfile { name: string; config: string }

export const PROFILE_KEY = "cansys.profile";

/** Parse what localStorage handed back. Returns null for anything unusable, and says why. */
export function readStoredProfile(raw: string | null): StoredProfile | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.name === "string" && typeof parsed?.config === "string" && parsed.config.length)
      return { name: parsed.name, config: parsed.config }; // rebuild, so the type and the check stay in step
    console.error(`discarding stored profile: expected {name, config}, got ${raw.slice(0, 80)}`);
  } catch (err) {
    console.error(`discarding stored profile: ${err}`);
  }
  return null;
}

export function loadStoredProfile(): StoredProfile | null {
  try {
    return readStoredProfile(localStorage.getItem(PROFILE_KEY));
  } catch (err) {
    console.error(`storage unavailable, continuing without a saved profile: ${err}`);
    return null;
  }
}

/** Persist a profile. Returns the reason it could not be saved, or null on success. */
export function saveStoredProfile(profile: StoredProfile): string | null {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    return null;
  } catch (err: any) {
    return String(err?.message ?? err);
  }
}

export function clearStoredProfile(): void {
  try {
    localStorage.removeItem(PROFILE_KEY);
  } catch (err) {
    console.error(`could not clear the saved profile: ${err}`);
  }
}
