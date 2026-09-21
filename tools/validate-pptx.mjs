// PPTX 구조 검증 도구: node tools/validate-pptx.mjs <파일.pptx | 폴더> [...]
// [Content_Types].xml 커버리지·XML 정합성·슬라이드 수 일치·r:id/r:embed 참조 무결성
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { DOMParser } from "@xmldom/xmldom";
import { validatePptx } from "../js/report/pptx/validate.js";
const require = createRequire(import.meta.url);
const JSZip = require("../vendor/jszip-3.10.1.min.js");

const targets = process.argv.slice(2);
if (!targets.length) targets.push("out");
const files = [];
for (const t of targets) {
  const s = await stat(t).catch(() => null);
  if (!s) { console.error(`없음: ${t}`); process.exitCode = 1; continue; }
  if (s.isDirectory()) {
    const walk = async d => { for (const e of await readdir(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) await walk(p); else if (e.name.endsWith(".pptx")) files.push(p); } };
    await walk(t);
  } else files.push(t);
}
let failed = 0;
for (const f of files) {
  const zip = await JSZip.loadAsync(await readFile(f));
  const entries = await Promise.all(Object.values(zip.files).filter(e => !e.dir).map(async e => ({ path: e.name, data: await e.async("uint8array") })));
  const errors = validatePptx(entries, DOMParser);
  const slides = entries.filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.path)).length;
  console.log(`${errors.length ? "FAIL" : "OK  "} ${f} (슬라이드 ${slides}개)`);
  errors.forEach(e => console.log(`  - ${e}`));
  if (errors.length) failed++;
}
if (!files.length) console.log("검사할 .pptx 파일이 없습니다");
process.exitCode = failed ? 1 : process.exitCode;
