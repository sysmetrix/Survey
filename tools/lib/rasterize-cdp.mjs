// 투명 배경 SVG → PNG (Node 도구용): 설치된 Edge/Chrome 을 DevTools 프로토콜로 구동한다.
//  · Emulation.setDefaultBackgroundColorOverride(투명) + Page.captureScreenshot 로 알파 채널 PNG 를 얻는다.
//  · Emulation.setDeviceMetricsOverride 로 뷰포트를 정확한 픽셀 크기(16×16 등)로 맞춘다 — --window-size 는 최소 크기 제한이 있다.
//  · 브라우저는 1회 띄워 여러 작업을 처리하고, 끝나면 자기가 띄운 프로세스 트리만 종료한다.
import { spawn, execFile } from "node:child_process";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { pathToFileURL } from "node:url";
import { browserPath } from "./rasterize.mjs";

const T0 = Date.now();
const dbg = (...a) => { if (process.env.RASTER_DEBUG) console.error(`[cdp +${Date.now() - T0}ms]`, ...a); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.once("error", rej); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); }); });
const getJson = url => fetch(url, { signal: AbortSignal.timeout(2000) }).then(r => r.json());

/**
 * @param {{svg:string, width:number, height:number, scale?:number}[]} jobs  width/height = 논리(CSS) 픽셀, 결과는 width*scale × height*scale
 * @returns {Promise<Buffer[]>} 알파 채널이 있는 PNG (RGBA)
 */
export async function rasterizeTransparent(jobs) {
  const exe = browserPath();
  if (!exe) throw new Error("Edge/Chrome 을 찾을 수 없습니다");
  const dir = await mkdtemp(join(tmpdir(), "svgcdp-"));
  // 프로필은 고정 경로를 재사용한다: 매번 새로 만들고 지우면 시작 ~9초 + 삭제 ~20초(Windows 백신 영향)가 든다. 동시에 두 번 실행하지 말 것.
  const profile = join(tmpdir(), "survey-icons-cdp-profile");
  const port = await freePort();
  // --edge-skip-compat-layer-relaunch: Edge 가 자기 자신을 다시 실행해 PID 를 잃는 것을 막는다
  const child = spawn(exe, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "--edge-skip-compat-layer-relaunch",
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore", windowsHide: true });
  const kill = () => new Promise(res => (process.platform === "win32"
    ? execFile("taskkill", ["/PID", String(child.pid), "/T", "/F"], () => res())
    : (child.kill("SIGKILL"), res())));
  const watchdog = setTimeout(() => { console.error("rasterize-cdp: 시간 초과 — 브라우저를 종료합니다"); kill().then(() => process.exit(1)); }, 240000);
  try {
    dbg("spawned", child.pid, "port", port);
    for (let i = 0; i < 100; i++) { if (await getJson(`http://127.0.0.1:${port}/json/version`).then(() => true, () => false)) break; await sleep(150); }
    dbg("browser up");
    let pageWs = null;
    for (let i = 0; i < 100 && !pageWs; i++) {
      const list = await getJson(`http://127.0.0.1:${port}/json/list`).catch(() => []);
      pageWs = list.find(t => t.type === "page")?.webSocketDebuggerUrl || null;
      if (!pageWs) await sleep(100);
    }
    if (!pageWs) throw new Error("페이지 대상을 찾지 못했습니다");

    dbg("page target", pageWs);
    const ws = new WebSocket(pageWs);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("웹소켓 연결 실패")); });
    let seq = 0; const pending = new Map(); const waiters = [];
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
      else if (m.method) for (const w of waiters.splice(0)) w(m);
    };
    const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; const t = setTimeout(() => { pending.delete(id); rej(new Error(`CDP 응답 없음: ${method}`)); }, 20000); pending.set(id, { res: v => { clearTimeout(t); res(v); }, rej: e => { clearTimeout(t); rej(e); } }); ws.send(JSON.stringify({ id, method, params })); });
    const nextEvent = name => new Promise(res => { const f = m => (m.method === name ? res(m) : waiters.push(f)); waiters.push(f); });

    dbg("ws open");
    await send("Page.enable");
    const out = [];
    for (const [i, job] of jobs.entries()) {
      const { svg, width, height, scale = 1 } = job;
      const html = join(dir, `j${i}.html`);
      await writeFile(html, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}svg{display:block}</style></head><body>${svg}</body></html>`, "utf8");
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });
      await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
      const loaded = nextEvent("Page.loadEventFired");
      await send("Page.navigate", { url: pathToFileURL(html).href });
      await Promise.race([loaded, sleep(8000)]); // 로컬 파일이라 곧 끝난다 — 이벤트를 놓쳐도 진행
      await sleep(50);
      dbg("loaded; capturing", i);
      const { data } = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
      out.push(Buffer.from(data, "base64"));
    }
    ws.close();
    return out;
  } finally {
    // 내가 띄운 프로세스 트리만 종료 (이미지 이름 기준 종료는 하지 않는다)
    clearTimeout(watchdog);
    dbg("killing");
    await kill();
    await sleep(500);
    dbg("cleanup");
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  }
}
