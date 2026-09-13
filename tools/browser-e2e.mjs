// 브라우저 E2E (Edge/Chrome 헤드리스 + CDP): 샘플 불러오기 → 화면 캡처 → 브라우저에서 HWPX 생성
// 사전 조건: python -m http.server 8000 (저장소 루트)
// 사용: node tools/browser-e2e.mjs [샘플파일명]
import { spawn } from "node:child_process";
import { mkdir, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserPath } from "./lib/rasterize.mjs";

const BASE = process.env.E2E_BASE || "http://127.0.0.1:8000/index.html";
const SAMPLE = process.argv[2] || "2026_진로탐색_사전사후.xlsx";
const PORT = 9333;
const sleep = ms => new Promise(r => setTimeout(r, ms));
await mkdir("out/browser", { recursive: true });

// 서버 대기
for (let i = 0; ; i++) {
  try { if ((await fetch(BASE)).ok) break; } catch { /* 재시도 */ }
  if (i > 40) throw new Error(`웹서버 응답 없음: ${BASE}`);
  await sleep(250);
}

const profile = await mkdtemp(join(tmpdir(), "e2e-"));
const browser = spawn(browserPath(), ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--window-size=1400,1000", "about:blank"], { stdio: "ignore" });
let wsUrl;
for (let i = 0; i < 60; i++) {
  try { const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const pg = list.find(t => t.type === "page"); if (pg) { wsUrl = pg.webSocketDebuggerUrl; break; } } catch { /* 대기 */ }
  await sleep(250);
}
if (!wsUrl) { browser.kill(); throw new Error("CDP 연결 실패"); }

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map(), problems = [];
ws.onmessage = ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === "Runtime.exceptionThrown") problems.push(`예외: ${msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text}`);
  if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) problems.push(`console.${msg.params.type}: ${msg.params.args.map(a => a.value ?? a.description).join(" ")}`);
  if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") problems.push(`로그: ${msg.params.entry.text} ${msg.params.entry.url || ""}`);
};
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, m => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression, awaitPromise = false) => {
  const r = await cdp("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const waitFor = async (expr, ms = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await evaluate(expr)) return true; await sleep(200); }
  throw new Error(`대기 시간 초과: ${expr}`);
};
const shot = async name => {
  const { data } = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(`out/browser/${name}.png`, Buffer.from(data, "base64"));
};

try {
  await cdp("Runtime.enable"); await cdp("Page.enable"); await cdp("Log.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp("Page.navigate", { url: `${BASE}#/load` });
  await waitFor(`!!document.querySelector('.sample')`);
  await shot("1-load");

  await evaluate(`document.querySelector('[data-file="${SAMPLE}"]').click()`);
  await waitFor(`location.hash === '#/setup' && !!document.querySelector('.tbl.setup')`);
  await shot("2-setup");

  for (const [hash, name, sel] of [["#/business", "3-business", ".tbl.kpi"], ["#/dash", "4-dash", ".cards"], ["#/dash/사전·사후 성과 변화", "4b-dash-prepost", ".paper"], ["#/report", "5-report", "#reportPaper"]]) {
    await evaluate(`location.hash = ${JSON.stringify(hash)}`);
    await waitFor(`!!document.querySelector(${JSON.stringify(sel)})`);
    await sleep(300);
    await shot(name);
  }

  // 문장 직접 편집 흐름: 요약 첫 문장 수정
  const edited = await evaluate(`(() => { const el = document.querySelector('#reportPaper [data-edit]'); el.focus(); el.textContent = '브라우저에서 고친 요약 문장'; el.blur(); return true; })()`);
  await waitFor(`document.querySelector('#reportPaper').textContent.includes('브라우저에서 고친 요약 문장')`);

  // 브라우저에서 HWPX 생성 (canvas 래스터화 경로)
  const t0 = Date.now();
  const b64 = await evaluate(`(async () => {
    const [m, s, t, r] = await Promise.all([import('./js/report/render-hwpx.js'), import('./js/ui/store.js'), import('./js/report/hwpx/template-parts.js'), import('./js/charts/rasterize.js')]);
    const blocks = s.reportBlocks();
    const bytes = await m.renderHwpx(blocks, { parts: t.TEMPLATE_PARTS, JSZip: window.JSZip, title: blocks[0].text, rasterize: (svg, w, h) => r.svgToPng(svg, w, h, 2.5) });
    let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  })()`, true);
  const out = `out/browser/e2e_${SAMPLE.replace(/\.[^.]+$/, "")}.hwpx`;
  await writeFile(out, Buffer.from(b64, "base64"));
  console.log(`OK 화면 5종 캡처, 문장 편집=${edited}, 브라우저 HWPX ${Math.round(b64.length * 0.75 / 1024)}KB (${((Date.now() - t0) / 1000).toFixed(1)}s) → ${out}`);
} catch (e) {
  await shot("error").catch(() => {});
  console.error("E2E 실패:", e.message);
  process.exitCode = 1;
} finally {
  if (problems.length) { console.log(`브라우저 경고/오류 ${problems.length}건:`); problems.slice(0, 20).forEach(p => console.log("  " + p)); }
  ws.close(); browser.kill();
}
