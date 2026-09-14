import test from "node:test";
import assert from "node:assert/strict";
import { fontNameCandidates, isFontInstalled } from "../../js/ui/fontcheck.js";

test("known Windows and Hancom font aliases are included", () => {
  assert.ok(fontNameCandidates("함초롬바탕").includes("HCR Batang"));
  assert.ok(fontNameCandidates("Pretendard GOV Variable").includes("Pretendard GOV"));
  assert.ok(fontNameCandidates("KoPub돋움체 Medium").includes("KoPubWorldDotum Medium"));
});

test("local font enumeration accepts an alias and family style variation", async () => {
  const oldWindow = globalThis.window;
  const oldFontFace = globalThis.FontFace;
  globalThis.FontFace = class {};
  globalThis.window = {
    queryLocalFonts: async () => [{ family: "Pretendard GOV", fullName: "Pretendard GOV Regular" }],
  };
  try {
    assert.equal(await isFontInstalled("Pretendard GOV Variable", { allowPermissionPrompt: true }), true);
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldFontFace === undefined) delete globalThis.FontFace; else globalThis.FontFace = oldFontFace;
  }
});

test("local() checks every known alias before reporting a missing font", async () => {
  const oldWindow = globalThis.window;
  const oldFontFace = globalThis.FontFace;
  globalThis.window = {};
  globalThis.FontFace = class {
    constructor(_family, src) { this.src = src; }
    load() { return this.src.includes("HCR Batang") ? Promise.resolve(this) : Promise.reject(new Error("missing")); }
  };
  try {
    assert.equal(await isFontInstalled("함초롬바탕"), true);
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldFontFace === undefined) delete globalThis.FontFace; else globalThis.FontFace = oldFontFace;
  }
});
