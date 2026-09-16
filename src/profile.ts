// The slicer profile the user imported, cached between visits.
// It is a convenience: nothing about it may stop the page loading. That means
// guarding the storage *access* too - reading localStorage throws outright when
// cookies are blocked, in Safari private browsing, and in a sandboxed iframe.
//
// The config is held as bytes, not text, so the profile the slicer gets back is the
// one it wrote - a UTF-8 BOM or a cp1252 config does not survive a decode/encode
// round trip. localStorage stores strings only, hence base64 on the way in and out.

export interface StoredProfile { name: string; config: Uint8Array }

export const PROFILE_KEY = "cansys.profile";
const FORMAT_VERSION = 2; // 1 held the config as text, which could not round-trip bytes

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Parse what localStorage handed back. Returns null for anything unusable, and says why. */
export function readStoredProfile(raw: string | null): StoredProfile | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.v !== FORMAT_VERSION) {
      console.error(`discarding stored profile: format ${parsed?.v} is not ${FORMAT_VERSION}, import the 3MF again`);
      return null;
    }
    if (typeof parsed.name === "string" && typeof parsed.configBase64 === "string" && parsed.configBase64.length) {
      const config = fromBase64(parsed.configBase64);
      if (config.length) return { name: parsed.name, config }; // rebuilt, so the type and the check stay in step
    }
    console.error(`discarding stored profile: expected {name, configBase64}, got ${raw.slice(0, 80)}`);
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
    const stored = { v: FORMAT_VERSION, name: profile.name, configBase64: toBase64(profile.config) };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(stored));
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
