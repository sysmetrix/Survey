// 브라우저 E2E (Edge/Chrome 헤드리스 + CDP): 샘플 불러오기 → 화면 캡처 → 브라우저 HWPX 생성
//   → 어두운 화면·툴팁 → 발표 모드(키보드·개요·노트·PDF) → 모바일 폭 → PWA(서비스워커·오프라인)
// 사전 조건: python -m http.server 8000 (저장소 루트)
// 사용: node tools/browser-e2e.mjs [샘플파일명]
import { spawn, execFile } from "node:child_process";
import { mkdir, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserPath } from "./lib/rasterize.mjs";

const BASE = process.env.E2E_BASE || "http://127.0.0.1:8000/index.html";
const SAMPLE = process.argv[2] || "2026_진로탐색_사전사후.xlsx";
const PORT = Number(process.env.E2E_CDP_PORT || 9333);
const sleep = ms => new Promise(r => setTimeout(r, ms));
await mkdir("out/browser", { recursive: true });

// 서버 대기
for (let i = 0; ; i++) {
  try { if ((await fetch(BASE)).ok) break; } catch { /* 재시도 */ }
  if (i > 40) throw new Error(`웹서버 응답 없음: ${BASE}`);
  await sleep(250);
}

const exe = browserPath();
if (!exe) throw new Error("헤드리스로 띄울 Edge/Chrome을 찾지 못했습니다 — E2E_BROWSER_PATH(또는 CHROME_PATH) 환경변수로 실행파일 경로를 지정하세요");
const profile = await mkdtemp(join(tmpdir(), "e2e-"));
// --no-sandbox·--disable-dev-shm-usage: CI(ubuntu-latest) 컨테이너에서 크롬 샌드박스가 커널 권한 부족으로
// 조용히 실패해 CDP 연결 자체가 안 되던 문제(로컬 Windows 에서는 필요 없지만 켜 둬도 해가 없음)
const browser = spawn(exe, ["--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--window-size=1400,1000", "about:blank"], { stdio: "ignore" });
// 브라우저 프로세스 트리 전체 종료(Windows 는 child.kill() 이 렌더러 등 자식 프로세스를 안 죽여 좀비로 남을 수 있음 — rasterize-cdp.mjs 와 같은 방식)
const killBrowserTree = () => new Promise(res => (process.platform === "win32"
  ? execFile("taskkill", ["/PID", String(browser.pid), "/T", "/F"], () => res())
  : (browser.kill("SIGKILL"), res())));
let wsUrl;
for (let i = 0; i < 60; i++) {
  try { const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const pg = list.find(t => t.type === "page"); if (pg) { wsUrl = pg.webSocketDebuggerUrl; break; } } catch { /* 대기 */ }
  await sleep(250);
}
if (!wsUrl) { await killBrowserTree(); throw new Error("CDP 연결 실패"); }

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map(), problems = [];
let offlinePhase = false;
ws.onmessage = ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === "Runtime.exceptionThrown") problems.push(`예외: ${msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text}`);
  if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) problems.push(`console.${msg.params.type}: ${msg.params.args.map(a => a.value ?? a.description).join(" ")}`);
  if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error" && !offlinePhase) problems.push(`로그: ${msg.params.entry.text} ${msg.params.entry.url || ""}`);
};
const cdp = (method, params = {}, ms = 60000) => new Promise((res, rej) => {
  const id = ++seq;
  const timer = setTimeout(() => { pending.delete(id); rej(new Error(`${method}: CDP 응답 시간 초과`)); }, ms);
  pending.set(id, m => { clearTimeout(timer); if (m.error) rej(new Error(`${method}: ${m.error.message}`)); else res(m.result); });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression, awaitPromise = false) => {
  const r = await cdp("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
// 페이지 새로고침 중에는 실행 컨텍스트가 사라져 평가가 실패·지연될 수 있으므로 짧은 제한시간으로 재시도
const waitFor = async (expr, ms = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await cdp("Runtime.evaluate", { expression: expr, returnByValue: true }, 3000);
      if (!r.exceptionDetails && r.result.value) return true;
    } catch { /* 이동 중 — 재시도 */ }
    await sleep(200);
  }
  throw new Error(`대기 시간 초과: ${expr}`);
};
const shot = async (name, ms = 60000) => {
  const { data } = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, ms);
  await writeFile(`out/browser/${name}.png`, Buffer.from(data, "base64"));
};
const KEYS = { ArrowRight: 39, ArrowLeft: 37, Enter: 13, Escape: 27, Digit4: 52, KeyO: 79, KeyN: 78, KeyT: 84 };
const press = async code => {
  const key = code.startsWith("Digit") ? code.slice(5) : code.startsWith("Key") ? code.slice(3).toLowerCase() : code;
  const base = { key, code, windowsVirtualKeyCode: KEYS[code] };
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", ...base, ...(key.length === 1 ? { text: key } : {}) });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", ...base });
};
const results = [];

try {
  await cdp("Runtime.enable"); await cdp("Page.enable"); await cdp("Log.enable");
  await cdp("Emulation.setFocusEmulationEnabled", { enabled: true }); // 헤드리스에서도 focus/blur 이벤트 발생
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp("Page.navigate", { url: `${BASE}?sw=1#/load` });
  await waitFor(`!!document.querySelector('.sample') && document.fonts.status === 'loaded'`);
  await sleep(300);
  await shot("1-load");

  await evaluate(`document.querySelector('[data-file="${SAMPLE}"]').click()`);
  await waitFor(`location.hash === '#/setup' && !!document.querySelector('.tbl.setup')`);
  await shot("2-setup");
  if (await evaluate(`!!document.querySelector('[data-act="toggle-labels"]')`)) {
    await evaluate(`document.querySelector('[data-act="toggle-labels"]').click()`);
    await waitFor(`!!document.querySelector('.labelpanel')`);
    await evaluate(`document.querySelector('.labelpanel').scrollIntoView({block:'center'})`);
    await sleep(200);
    await shot("2b-label-panel");
  }

  for (const [hash, name, sel] of [["#/business", "3-business", ".tbl.kpi"], ["#/dash", "4-dash", ".cards"], ["#/dash/사전·사후 성과 변화", "4b-dash-prepost", ".paper"], ["#/report", "5-report", "#reportPaper"]]) {
    await evaluate(`location.hash = ${JSON.stringify(hash)}`);
    await waitFor(`!!document.querySelector(${JSON.stringify(sel)})`);
    await sleep(300);
    await shot(name);
  }

  // 문장 직접 편집 흐름: 요약 첫 문장 수정
  const edited = await evaluate(`(() => { const el = document.querySelector('#reportPaper [data-edit]'); el.focus(); el.textContent = '브라우저에서 고친 요약 문장'; el.blur(); return true; })()`);
  await waitFor(`!!document.querySelector('[data-act="reset-all"]')`, 8000).catch(() => { throw new Error('문장 수정이 저장되지 않음(수정 모두 되돌리기 버튼 없음)'); });
  await waitFor(`document.querySelector('#reportPaper').textContent.includes('브라우저에서 고친 요약 문장')`);

  // 되돌리기(Ctrl+Z)·다시 실행(Ctrl+Y)
  const ctrlKey = async (code, key, vk) => {
    await cdp("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk, modifiers: 2 });
    await cdp("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers: 2 });
  };
  await evaluate(`document.activeElement?.blur(); document.body.focus()`);
  await waitFor(`!document.getElementById('undoBtn').disabled`, 8000).catch(async e => {
    const diag = await evaluate(`(async () => { const [m, s] = await Promise.all([import('./js/ui/history/manager.js'), import('./js/ui/store.js')]); return JSON.stringify({ canUndo: m.canUndo(), overrides: Object.keys(s.state.overrides).length, codebook: !!s.state.codebook, disabled: document.getElementById('undoBtn').disabled, track: m.trackChange() }); })()`, true);
    throw new Error(`${e.message} / 진단: ${diag}`);
  });
  await ctrlKey("KeyZ", "z", 90);
  await waitFor(`!document.querySelector('#reportPaper').textContent.includes('브라우저에서 고친 요약 문장')`);
  await ctrlKey("KeyY", "y", 89);
  await waitFor(`document.querySelector('#reportPaper').textContent.includes('브라우저에서 고친 요약 문장')`);

  // 한글 문서 서식: 도구모음 팝오버를 연 뒤 글꼴 조합 칩을 눌러 미리보기 반영
  await evaluate(`document.querySelector('[data-act="format-toggle"]').click()`);
  await waitFor(`!!document.querySelector('[data-act="doc-preset"][data-id="gov"]')`);
  await evaluate(`document.querySelector('[data-act="doc-preset"][data-id="gov"]').click()`);
  await waitFor(`(document.getElementById('reportPaper').getAttribute('style') || '').includes('HY헤드라인M')`);
  await sleep(300);
  await shot("5b-report-font");

  // 작업 내역: 불러오기·자동 저장 기록 → 비교
  await sleep(3500);
  await evaluate(`location.hash = '#/history'`);
  await waitFor(`document.querySelectorAll('.timeline .tl-item').length >= 2`, 15000);
  await evaluate(`document.querySelector('[data-act="hist-diff"]').click()`);
  await waitFor(`!!document.querySelector('.diff')`);
  await sleep(200);
  await shot("5c-history");
  const nVersions = await evaluate(`document.querySelectorAll('.timeline .tl-item').length`);

  // 성과지표(선택): 빠른 추가·사업정보 선택 섹션
  await evaluate(`location.hash = '#/business'`);
  await waitFor(`!!document.querySelector('.quick-kpis') && !!document.querySelector('.logic')`);
  await shot("3b-business-optional");
  await evaluate(`location.hash = '#/report'`);
  await waitFor(`!!document.querySelector('#reportPaper')`);
  results.push(`되돌리기·다시 실행 OK, 글꼴 프리셋 미리보기 OK, 작업 내역 버전 ${nVersions}개·비교 OK, 성과지표 선택 화면 OK`);

  // 브라우저에서 HWPX 생성 (canvas 래스터화 경로)
  const t0 = Date.now();
  const b64 = await evaluate(`(async () => {
    const [m, s, t, r, j] = await Promise.all([import('./js/report/render-hwpx.js'), import('./js/ui/store.js'), import('./js/report/hwpx/template-parts.js'), import('./js/charts/rasterize.js'), import('./js/ui/jszip-loader.js')]);
    const JSZip = await j.loadJSZip(); // 실제 화면과 같은 지연 로딩 경로(vendor/jszip-*.min.js 동적 삽입) 사용
    const blocks = s.reportBlocks();
    const bytes = await m.renderHwpx(blocks, { parts: t.TEMPLATE_PARTS, JSZip, title: blocks[0].text, doc: { fontPreset: 'gov', baseSize: 11, lineSpacing: 160 }, rasterize: (svg, w, h) => r.svgToPng(svg, w, h, 2.5) });
    const z = await JSZip.loadAsync(bytes);
    const header = await z.file('Contents/header.xml').async('string'), section = await z.file('Contents/section0.xml').async('string');
    if (!header.includes('face="HY헤드라인M"') || !header.includes('face="휴먼명조"')) throw new Error('HWPX 글꼴 설정 누락');
    if (!/<hp:tbl [^>]*pageBreak="TABLE"/.test(section) || /<hp:tbl [\\s\\S]*?<hp:pos treatAsChar="1"/.test(section.replace(/<hp:pic [\\s\\S]*?<\\/hp:pic>/g, ''))) throw new Error('HWPX 표가 여러 쪽 나눔 설정이 아님');
    let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  })()`, true);
  const out = `out/browser/e2e_${SAMPLE.replace(/\.[^.]+$/, "")}.hwpx`;
  await writeFile(out, Buffer.from(b64, "base64"));
  results.push(`화면 5종 캡처, 문장 편집=${edited}, 브라우저 HWPX ${Math.round(b64.length * 0.75 / 1024)}KB (${((Date.now() - t0) / 1000).toFixed(1)}s) → ${out}`);

  // 어두운 화면: 테마 버튼(시스템 → 밝게 → 어둡게)
  await evaluate(`document.getElementById('themeBtn').click()`);
  await evaluate(`document.getElementById('themeBtn').click()`);
  await waitFor(`document.documentElement.dataset.theme === 'dark'`);
  await evaluate(`location.hash = '#/dash/사전·사후 성과 변화'`);
  await waitFor(`!!document.querySelector('.paper.view svg')`);
  const darkSvg = await evaluate(`document.querySelector('.paper.view svg').innerHTML.includes('#1a1a19')`);
  if (!darkSvg) throw new Error("어두운 화면에서 차트가 어두운 테마로 그려지지 않음");
  // 툴팁: 첫 표시 요소 위로 포인터 이동
  const pt = await evaluate(`(() => { const g = document.querySelector('.paper.view .viz-mark'); g.scrollIntoView({ block: 'center' }); const r = g.getBoundingClientRect(); return { x: r.x + r.width * 0.6, y: r.y + r.height / 2 }; })()`);
  await sleep(150);
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: pt.x, y: pt.y });
  await waitFor(`!!document.querySelector('.viz-tip') && !document.querySelector('.viz-tip').hidden && document.querySelector('.viz-tip strong').textContent.length > 0`, 5000)
    .catch(async e => { throw new Error(`${e.message} / 좌표 ${JSON.stringify(pt)} 아래 요소: ${await evaluate(`(document.elementFromPoint(${pt.x}, ${pt.y})?.outerHTML || '없음').slice(0, 160)`)}`); });
  await shot("6-dash-dark-tooltip");
  results.push(`어두운 화면 차트·툴팁 OK ("${(await evaluate(`document.querySelector('.viz-tip').textContent`)).slice(0, 40)}")`);

  // 발표 모드
  await evaluate(`document.getElementById('presentBtn').click()`);
  await waitFor(`location.hash === '#/present/1' && !!document.querySelector('.p-stage .slide.t-cover')`);
  await sleep(700);
  await shot("7a-present-cover");
  await press("ArrowRight");
  await waitFor(`location.hash === '#/present/2' && !!document.querySelector('.p-stage .slide.t-stats')`);
  await sleep(700);
  await shot("7b-present-stats");
  await press("Digit4"); await press("Enter");
  await waitFor(`location.hash === '#/present/4'`);
  await sleep(900);
  await shot("7c-present-slide4-dark");
  await press("KeyT"); // 무대: 화면 테마 따름 → 밝은 무대
  await waitFor(`!!document.querySelector('.p-stage .slide.light')`);
  await sleep(900);
  await shot("7d-present-slide4-light");
  const total = await evaluate(`Number(document.querySelector('.p-count').textContent.split('/')[1])`);
  for (let i = 5; i <= total; i++) {
    await press("ArrowRight");
    await waitFor(`location.hash === '#/present/${i}'`);
    await sleep(850);
    await shot(`7e-present-${String(i).padStart(2, "0")}`);
  }
  await press("KeyN");
  await waitFor(`!!document.querySelector('.p-notes')`);
  await shot("7f-present-notes");
  await press("KeyN");
  await press("KeyO");
  await waitFor(`!!document.querySelector('.p-ov-grid')`);
  await sleep(300);
  await shot("7g-present-overview");
  await press("Escape");
  await waitFor(`!document.querySelector('.p-overview')`);
  // PDF 인쇄: beforeprint → 인쇄용 전체 슬라이드 → Page.printToPDF(16:9 쪽 크기)
  await evaluate(`window.dispatchEvent(new Event('beforeprint'))`);
  await waitFor(`!!document.querySelector('.p-print .slide')`);
  const nPrint = await evaluate(`document.querySelectorAll('.p-print .slide').length`);
  await sleep(500); // 인쇄용 슬라이드 전체(차트 SVG 포함)가 다 그려질 시간을 줌
  // 헤드리스 브라우저의 인쇄 파이프라인이 막 발표 모드로 전환한 직후 "Printing is not available"로 일시적으로
  // 실패할 때가 있음(내부 프린트 프로세스 준비 지연으로 보임) — 몇 차례 짧게 재시도
  let pdf;
  for (let attempt = 1; ; attempt++) {
    try { ({ data: pdf } = await cdp("Page.printToPDF", { preferCSSPageSize: true, printBackground: true }, 120000)); break; }
    catch (e) {
      if (attempt >= 4 || !/Printing is not available/.test(e.message)) throw e;
      await sleep(1000 * attempt);
    }
  }
  const pdfBuf = Buffer.from(pdf, "base64");
  await writeFile("out/browser/present-deck.pdf", pdfBuf);
  const pages = (pdfBuf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  await evaluate(`window.dispatchEvent(new Event('afterprint'))`);
  await waitFor(`!document.querySelector('.p-print .slide')`); // 인쇄용 전체 슬라이드 DOM(차트 다수)이 실제로 걷힌 뒤에 진행 — 안 그러면 직후 캡처가 CDP 응답 지연으로 넘어감
  if (pages !== nPrint) throw new Error(`발표 PDF 쪽수 ${pages} ≠ 슬라이드 ${nPrint}`);
  results.push(`발표 모드 ${total}장: 키보드 이동·숫자 이동·무대 전환·노트·개요 OK, PDF ${pages}쪽 → out/browser/present-deck.pdf`);

  // 모바일 폭(400px)
  await cdp("Emulation.setDeviceMetricsOverride", { width: 400, height: 860, deviceScaleFactor: 2, mobile: true });
  await sleep(500);
  await shot("8a-mobile-present", 90000);
  await press("Escape");
  await waitFor(`location.hash === '#/dash'`);
  await evaluate(`location.hash = '#/load'`);
  await waitFor(`!!document.querySelector('.sample')`);
  await sleep(300);
  const overflow = await evaluate(`document.documentElement.scrollWidth - window.innerWidth`);
  await shot("8b-mobile-load");
  if (overflow > 1) throw new Error(`모바일 폭에서 가로 스크롤 ${overflow}px`);
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });

  // PWA: 매니페스트·서비스워커·오프라인 동작
  const pwa = await evaluate(`(async () => {
    const m = await (await fetch(document.querySelector('link[rel=manifest]').href)).json();
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 20000))]);
    const keys = await caches.keys();
    const shell = keys.find(k => k.startsWith('survey-shell-'));
    const n = shell ? (await (await caches.open(shell)).keys()).length : 0;
    return { icons: m.icons.length, active: !!reg?.active, controlled: !!navigator.serviceWorker.controller, shell, n };
  })()`, true);
  if (!pwa.active || !pwa.shell || pwa.n < 50) throw new Error(`서비스워커 준비 안 됨: ${JSON.stringify(pwa)}`);
  offlinePhase = true;
  await cdp("Network.enable");
  await cdp("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await cdp("Page.navigate", { url: `${BASE}?sw=1#/load` }, 20000).catch(e => { throw new Error(`오프라인 이동 실패: ${e.message}`); });
  await sleep(1000);
  await waitFor(`document.readyState === 'complete' && !!document.querySelector('.sample')`, 20000);
  await waitFor(`!document.getElementById('net').hidden`, 5000);
  await evaluate(`document.querySelector('[data-file="${SAMPLE}"]').click()`);
  await waitFor(`location.hash === '#/setup' && !!document.querySelector('.tbl.setup')`, 15000);
  await shot("9-offline-setup");
  await cdp("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  offlinePhase = false;
  results.push(`PWA: 아이콘 ${pwa.icons}개, 서비스워커 활성=${pwa.active}, 사전 캐시 ${pwa.n}개(${pwa.shell}), 오프라인 새로고침 후 샘플 분석 OK`);

  // 로컬 테스트 프로필에서만 UI 역할을 주입한다. 실제 인증·서버 쓰기는 수행하지 않는다.
  await evaluate(`(async () => {
    const session = await import('./js/auth/session.js'); session.clearSession();
    localStorage.setItem('survey-v5-session',JSON.stringify({access_token:'local-ui-test',expires_at:Date.now()+3600000,role:'admin',user:{id:'local-ui-test'}}));
    location.hash='#/business';
  })()`, true);
  await waitFor(`!!document.querySelector('[data-change="kpi-purpose"]')`);
  await evaluate(`document.querySelector('[data-change="kpi-purpose"][data-id="change"]').click()`);
  await evaluate(`document.querySelector('[data-act="kpi-quick"][data-id="diff"]').click()`);
  await waitFor(`!!document.querySelector('article.card select[data-field="targetRef"]')`);
  const guided = await evaluate(`(async () => {
    const {state,compute}=await import('./js/ui/store.js');
    const before=state.kpis.at(-1);
    if(before.target!==null || !compute().evaluation.results.at(-1).error) throw Error('목표 기본값/문항 미선택 검증 실패');
    const select=[...document.querySelectorAll('article.card select[data-field="targetRef"]')].at(-1);
    select.value=[...select.options].find(o=>o.value.startsWith('@item:')).value;
    select.dispatchEvent(new Event('change',{bubbles:true}));
    const result=compute().evaluation.results.at(-1);
    if(result.judgment!=='목표 미설정' || !Number.isFinite(result.actualValue)) throw Error('명시적 문항 선택 계산 실패');
    return {value:result.actualValue, judgment:result.judgment};
  })()`,true);
  await shot('10-guided-kpi');
  await evaluate(`document.querySelector('[data-act="improvement-add"]').click()`);
  await waitFor(`!!document.querySelector('[data-change="improvement-edit"]')`);
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await shot('10b-guided-mobile');
  await cdp('Emulation.clearDeviceMetricsOverride');
  await evaluate(`(async()=>{(await import('./js/auth/session.js')).clearSession();(await import('./js/ui/router.js')).refresh();})()`,true);
  await waitFor(`!document.querySelector('[data-change="kpi-purpose"]') && !document.querySelector('[data-change="improvement-edit"]')`);
  results.push('간편 KPI: 목적 필터·목표 미설정·명시적 문항 선택·개선 과제·모바일 캡처·로그아웃 후 비공개 OK '+JSON.stringify(guided));

  console.log(results.map(r => `OK ${r}`).join("\n"));
} catch (e) {
  await shot("error").catch(() => {});
  if (results.length) console.log(results.map(r => `OK ${r}`).join("\n"));
  console.error("E2E 실패:", e.message);
  process.exitCode = 1;
} finally {
  if (problems.length) { console.log(`브라우저 경고/오류 ${problems.length}건:`); problems.slice(0, 20).forEach(p => console.log("  " + p)); }
  ws.close(); await killBrowserTree();
}
