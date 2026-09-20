import { test, expect } from "bun:test";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { extractProfile, threeMf, bboxOf, type Placement } from "../src/export";
import { readStoredProfile, saveStoredProfile, PROFILE_KEY, type StoredProfile } from "../src/profile";

const PROFILE_TEXT = `{"printer_settings_id":"Bambu Lab P1S 0.4 nozzle","layer_height":"0.28","filament_type":["PETG"]}`;
const PROFILE = strToU8(PROFILE_TEXT);

// Two shapes a UTF-8 decode would quietly rewrite: a BOM (TextDecoder eats it) and a
// cp1252 byte (0xB5, "µ", which is not valid UTF-8 and decodes to U+FFFD). Both are
// plausible in a config a slicer wrote on Windows.
const PROFILE_WITH_BOM = new Uint8Array([0xef, 0xbb, 0xbf, ...strToU8(`{"nozzle":"0.4"}`)]);
const PROFILE_CP1252 = new Uint8Array([...strToU8(`{"note":"20 `), 0xb5, ...strToU8(`m"}`)]);

const threeMfWith = (entries: Record<string, string>) =>
  zipSync(Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, strToU8(v)])));

test("extractProfile pulls project_settings.config out of a slicer 3MF", () => {
  const file = threeMfWith({
    "3D/3dmodel.model": "<model/>",
    "Metadata/project_settings.config": PROFILE_TEXT,
    "Metadata/slice_info.config": "<config/>",
  });
  expect(extractProfile(file)).toEqual(PROFILE);
});

test("extractProfile names the missing entry when the 3MF has no profile", () => {
  const file = threeMfWith({ "3D/3dmodel.model": "<model/>" });
  expect(() => extractProfile(file)).toThrow(/Metadata\/project_settings\.config/);
});

test("extractProfile fails loudly on something that is not a zip", () => {
  expect(() => extractProfile(strToU8("not a 3mf"))).toThrow();
});

const BED: [number, number, number] = [256, 256, 256];
const pos = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]);
const placed: Placement[] = [
  { name: "end-lip", part: "end-lip", pos, idx: new Uint32Array([0, 1, 2]), bbox: bboxOf(pos), plate: 0 },
];

test("a 3MF built with a profile carries it through byte for byte", () => {
  const out = unzipSync(threeMf(placed, BED, { profile: PROFILE }));
  expect(out["Metadata/project_settings.config"]).toEqual(PROFILE);
});

// These fail the moment the profile is carried as a string: strFromU8 swallows the BOM
// and turns 0xB5 into U+FFFD, so the slicer gets back a config it did not write.
test.each([
  ["a UTF-8 BOM", PROFILE_WITH_BOM],
  ["a cp1252 byte", PROFILE_CP1252],
])("a profile containing %s reaches the 3MF unchanged", (_label, bytes) => {
  const out = unzipSync(threeMf(placed, BED, { profile: bytes }));
  expect(out["Metadata/project_settings.config"]).toEqual(bytes);
  expect(extractProfile(threeMf(placed, BED, { profile: bytes }))).toEqual(bytes);
});

test("a 3MF built without a profile has no profile entry", () => {
  const out = unzipSync(threeMf(placed, BED));
  expect(out["Metadata/project_settings.config"]).toBeUndefined();
  expect(out["Metadata/model_settings.config"]).toBeDefined();
});

test("a profile survives the round trip back out through extractProfile", () => {
  expect(extractProfile(threeMf(placed, BED, { profile: PROFILE }))).toEqual(PROFILE);
});

// A profile is a cached convenience. Nothing about it may stop the page loading.
// saveStoredProfile is the only thing that writes this format, so round-tripping through
// it is what keeps the reader and the writer honest about each other.
const storedJson = (profile: StoredProfile): string => {
  const written: Record<string, string> = {};
  const storage = { setItem: (k: string, v: string) => { written[k] = v; } };
  // bun runs every test file in one process: put the real storage back afterwards
  const real = (globalThis as any).localStorage;
  (globalThis as any).localStorage = storage;
  try {
    expect(saveStoredProfile(profile)).toBeNull();
  } finally {
    (globalThis as any).localStorage = real;
  }
  return written[PROFILE_KEY];
};

test.each([
  ["plain UTF-8", PROFILE],
  ["a UTF-8 BOM", PROFILE_WITH_BOM],
  ["a cp1252 byte", PROFILE_CP1252],
])("a stored profile containing %s round-trips through storage", (_label, config) => {
  const profile = { name: "myprofile.3mf", config };
  expect(readStoredProfile(storedJson(profile))).toEqual(profile);
});

test("a profile stored in the old text format is discarded, not misread", () => {
  const version1 = JSON.stringify({ name: "myprofile.3mf", config: PROFILE_TEXT });
  expect(readStoredProfile(version1)).toBeNull();
});

test("nothing stored yields no profile", () => {
  expect(readStoredProfile(null)).toBeNull();
});

test("a corrupt stored profile is discarded rather than thrown", () => {
  expect(readStoredProfile("{not json")).toBeNull();
});

// These carry the current version so they exercise the shape checks rather than
// stopping at the version gate, which would pass for the wrong reason.
test("a stored profile missing its config is discarded", () => {
  expect(readStoredProfile(JSON.stringify({ v: 2, name: "myprofile.3mf" }))).toBeNull();
});

test("a stored profile that is not an object is discarded", () => {
  expect(readStoredProfile(`"just a string"`)).toBeNull();
});

test("an empty profile entry is a corrupt file, not an absent one", () => {
  const file = threeMfWith({ "3D/3dmodel.model": "<model/>" });
  const withEmpty = zipSync({ "3D/3dmodel.model": strToU8("<model/>"), "Metadata/project_settings.config": new Uint8Array(0) });
  expect(() => extractProfile(withEmpty)).toThrow(/empty/);
  expect(() => extractProfile(file)).toThrow(/no Metadata/);
});

test("a stored profile with an empty config is discarded", () => {
  expect(readStoredProfile(JSON.stringify({ v: 2, name: "x.3mf", configBase64: "" }))).toBeNull();
});

test("a zip bomb is refused instead of inflated", () => {
  const huge = zipSync({ "Metadata/project_settings.config": new Uint8Array(8_000_000) });
  const started = Date.now();
  expect(() => extractProfile(huge)).toThrow();
  expect(Date.now() - started).toBeLessThan(2000); // never materialised
});
