// 글머리 글자 폭 실측 도구 — js/report/hwpx/metrics.js 의 값을 만들고 검산한다.
//
// 한글에는 "글자 폭"을 물어보는 API 가 없어서, 한글이 직접 배치한 결과를 거꾸로 읽는다:
// 시험용 HWPX → 한글 2024 가 PDF 저장 → PDF 안에 어절마다 찍힌 좌표를 그대로 잰다.
//
// 사용법 (세 단계)
//   1) node tools/hwpx-glyph-widths.mjs gen out/glyph
//   2) powershell -ExecutionPolicy Bypass -File tools/hwp-verify.ps1 -Dir out/glyph
//   3) node tools/hwpx-glyph-widths.mjs read out/glyph
//
// 3단계가 찍는 표를 metrics.js 의 GLYPH_EM 에 옮겨 적는다. 같은 명령이 "글머리 다음 첫 글자"와
// "줄바꿈된 둘째 줄"의 좌표가 실제로 일치하는지도 함께 검사한다.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { createRequire } from "node:module";
import { TEMPLATE_PARTS } from "../js/report/hwpx/template-parts.js";
import { createHwpxDoc } from "../js/report/hwpx/writer.js";
import { packHwpx } from "../js/report/hwpx/package.js";
const require = createRequire(import.meta.url);
const JSZip = require("../vendor/jszip-3.10.1.min.js");

const CHARS = ["□", "○", "·", "-", "※", ":", "가", "A", "1", ".", ",", "("];
const PRESETS = ["gov", "hancom", "malgun", "nanum", "kopub", "noto", "pretendard"];
const BASE = 12;
const LONG = "가나다라마바사아자차카타파하 ".repeat(6).trim(); // 반드시 줄이 넘어가도록
const UNIT_PT = 0.119935; // 한글이 내보내는 PDF 의 좌표 한 칸 = 이만큼(pt)
// 허용 오차: 좌표 한 칸(0.12pt)에 더해, 한글이 글자 크기를 줄일 때 글자 폭을 한 번 더 반올림하는 몫(≈0.09mm)
const TOL_PT = 0.25;

// ─────────────────────────── 1) 시험 문서 만들기 ───────────────────────────
async function gen(dir) {
  await mkdir(dir, { recursive: true });
  for (const preset of PRESETS) {
    // 폭 재기: "c 끝" 과 "cc 끝" 의 '끝' 좌표 차이 = 글자 c 한 개의 폭
    const w = createHwpxDoc({ parts: TEMPLATE_PARTS, title: `w_${preset}`, baseSize: BASE, fontSettings: { fontPreset: preset } });
    for (const c of CHARS) w.paragraph(`${c} 끝`, { align: "LEFT" }).paragraph(`${c}${c} 끝`, { align: "LEFT" });
    await writeFile(`${dir}/w_${preset}.hwpx`, await packHwpx(w.finish(), JSZip));

    // 검산: 개조식·주석·요약상자·표 안 줄이 모두 첫 글자에 맞는지
    const a = createHwpxDoc({ parts: TEMPLATE_PARTS, title: `a_${preset}`, baseSize: BASE, fontSettings: { fontPreset: preset } });
    for (const lv of [1, 2, 3, 4]) a.bullet(lv, LONG);
    a.note(`주: ${LONG}`).note(`※ ${LONG}`).box([`□ ${LONG}`, `○ ${LONG}`]);
    a.table({ columns: [{ weight: 1, align: "LEFT" }], rows: [["머리"], [`· ${LONG}`]], headerRows: 1 });
    await writeFile(`${dir}/a_${preset}.hwpx`, await packHwpx(a.finish(), JSZip));
  }
  console.log(`${dir} 에 시험 문서 ${PRESETS.length * 2}개 생성 — 이제 tools/hwp-verify.ps1 로 PDF 를 만드세요.`);
}

// ─────────────────────────── 2) PDF 에서 글자 좌표 읽기 ───────────────────────────
/** 가장 큰 압축 스트림 = 본문 내용 */
function contentStream(buf) {
  const streams = [];
  for (let i = buf.indexOf("stream"); i >= 0; i = buf.indexOf("stream", i + 6)) {
    const s = buf.indexOf("\n", i) + 1, e = buf.indexOf("endstream", s);
    if (e < 0) break;
    try { streams.push(inflateSync(buf.subarray(s, e))); } catch { /* 압축 아님 */ }
  }
  if (!streams.length) throw new Error("PDF 안에서 본문 스트림을 찾지 못했습니다");
  return streams.reduce((a, b) => (b.length > a.length ? b : a)).toString("latin1");
}

/** 글자 묶음마다 {글자크기(pt), x(pt), y, 글자수} — 한글은 어절 단위로 좌표를 찍는다 */
function textRuns(content) {
  const out = [];
  for (const chunk of content.split("BT").slice(1)) {
    const blk = chunk.split("ET")[0];
    const tf = /\/\w+ ([\d.]+) Tf/.exec(blk);
    const tm = /1\.?0* 0\.?0* 0\.?0* -1\.?0* ([\d.]+) ([\d.]+) Tm/.exec(blk);
    const tj = /\[([\s\S]*?)\]TJ/.exec(blk);
    if (!tf || !tm || !tj) continue;
    const chars = (tj[1].match(/<([0-9a-fA-F]+)>/g) || []).reduce((n, h) => n + (h.length - 2) / 4, 0);
    out.push({ size: +tf[1] * UNIT_PT, x: +tm[1] * UNIT_PT, y: +tm[2], n: chars });
  }
  return out;
}

const byLine = runs => {
  const m = new Map();
  for (const r of runs) {
    const k = Math.round(r.y);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v.sort((a, b) => a.x - b.x));
};

function widths(content) {
  const lines = byLine(textRuns(content).filter(r => Math.abs(r.size - BASE) < 0.2));
  const em = {};
  CHARS.forEach((c, i) => {
    const one = lines[2 * i], two = lines[2 * i + 1];
    if (!one || !two || one.length < 2 || two.length < 2) return;
    const d1 = one[1].x - one[0].x;          // c + 공백
    const d2 = two[1].x - two[0].x;          // c + c + 공백
    em[c] = { char: (d2 - d1) / BASE, space: (d1 - (d2 - d1)) / BASE };
  });
  return em;
}

/** 글머리 줄(첫 묶음이 1~2글자) 다음 줄이 첫 글자 자리에서 시작하는지 */
function alignment(content) {
  const lines = byLine(textRuns(content)).filter(l => l[0].y < 6000); // 쪽번호(맨 아래)는 뺀다
  const res = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const L = lines[i], N = lines[i + 1];
    if (L.length < 2 || L[0].n > 2 || Math.abs(N[0].size - L[0].size) > 0.2) continue;
    // "주:" 처럼 표시가 두 묶음으로 쪼개지는 경우가 있어, 둘째 줄 좌표와 가장 가까운 묶음을 첫 글자로 본다
    const first = L.slice(1).reduce((a, b) => (Math.abs(b.x - N[0].x) < Math.abs(a.x - N[0].x) ? b : a));
    res.push({ size: L[0].size, markerX: L[0].x, firstX: first.x, wrapX: N[0].x, gap: N[0].x - first.x });
    i++;
  }
  return res;
}

async function read(dir) {
  const files = (await readdir(dir)).filter(f => f.endsWith(".pdf"));
  if (!files.length) return console.error(`${dir} 에 PDF 가 없습니다 — tools/hwp-verify.ps1 을 먼저 실행하세요.`);
  const f2 = v => v.toFixed(2);
  console.log("\n■ 글자 폭(em) — metrics.js 의 GLYPH_EM 에 옮겨 적는 값");
  for (const preset of PRESETS) {
    if (!files.includes(`w_${preset}.pdf`)) continue;
    const em = widths(contentStream(await readFile(`${dir}/w_${preset}.pdf`)));
    const cells = CHARS.filter(c => em[c]).map(c => `"${c}": ${em[c].char.toFixed(2)}`).join(", ");
    const space = CHARS.filter(c => em[c]).reduce((s, c) => s + em[c].space, 0) / CHARS.filter(c => em[c]).length;
    console.log(`  ${preset.padEnd(11)}{ ${cells} }   공백=${space.toFixed(3)}`);
  }
  console.log(`\n■ 검산 — 줄바꿈된 줄이 글머리 다음 첫 글자에 맞는지(허용 오차 ${TOL_PT}pt)`);
  let bad = 0;
  for (const preset of PRESETS) {
    if (!files.includes(`a_${preset}.pdf`)) continue;
    const rows = alignment(contentStream(await readFile(`${dir}/a_${preset}.pdf`)));
    const off = rows.filter(r => Math.abs(r.gap) > TOL_PT);
    bad += off.length;
    console.log(`  ${preset.padEnd(11)}${rows.length}줄 검사, 어긋남 ${off.length}줄` +
      off.map(r => `\n     ${f2(r.size)}pt 첫글자=${f2(r.firstX)} 둘째줄=${f2(r.wrapX)} (${r.gap > 0 ? "+" : ""}${f2(r.gap)}pt)`).join(""));
  }
  console.log(bad ? `\n어긋난 줄 ${bad}개 — metrics.js 값을 위 표로 고치세요.` : "\n모두 첫 글자에 맞음.");
  process.exitCode = bad ? 1 : 0;
}

const [cmd, dir = "out/glyph"] = process.argv.slice(2);
if (cmd === "gen") await gen(dir);
else if (cmd === "read") await read(dir);
else console.log("사용법: node tools/hwpx-glyph-widths.mjs gen|read [폴더]");
