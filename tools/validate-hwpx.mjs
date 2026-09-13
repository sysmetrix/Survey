// HWPX 구조 검증 도구: node tools/validate-hwpx.mjs <파일.hwpx | 폴더> [...]
// mimetype 순서·XML 정합성·itemCnt·ID 참조·그림 참조·표 격자 + 여러 쪽 표 설정·이모지 잔존 여부
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { DOMParser } from "@xmldom/xmldom";
import { validateHwpx } from "../js/report/hwpx/validate.js";
const require = createRequire(import.meta.url);
const JSZip = require("../vendor/jszip-3.10.1.min.js");

const targets = process.argv.slice(2);
if (!targets.length) targets.push("out");
const files = [];
for (const t of targets) {
  const s = await stat(t).catch(() => null);
  if (!s) { console.error(`없음: ${t}`); process.exitCode = 1; continue; }
  if (s.isDirectory()) {
    const walk = async d => { for (const e of await readdir(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) await walk(p); else if (e.name.endsWith(".hwpx")) files.push(p); } };
    await walk(t);
  } else files.push(t);
}
let failed = 0;
for (const f of files) {
  const zip = await JSZip.loadAsync(await readFile(f));
  // zip 항목 순서 유지 (mimetype 첫 항목 검사)
  const entries = await Promise.all(Object.values(zip.files).filter(e => !e.dir).map(async e => ({ path: e.name, data: await e.async("uint8array"), store: e._data?.compression?.magic === "\x00\x00" })));
  const errors = validateHwpx(entries, DOMParser);
  const tables = (new TextDecoder().decode(entries.find(e => e.path === "Contents/section0.xml")?.data || new Uint8Array()).match(/<hp:tbl /g) || []).length;
  console.log(`${errors.length ? "FAIL" : "OK  "} ${f} (표 ${tables}개)`);
  errors.forEach(e => console.log(`  - ${e}`));
  if (errors.length) failed++;
}
if (!files.length) console.log("검사할 .hwpx 파일이 없습니다");
process.exitCode = failed ? 1 : process.exitCode;
