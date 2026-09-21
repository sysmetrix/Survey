// PWA: 서비스워커 등록·즉시 업데이트, 앱 설치 버튼, 오프라인 표시, 파일 열기(file_handlers)
//
// 업데이트 흐름 (판단 규칙은 update-policy.js, 안내 띠·화면 상태 감지는 update-banner.js)
//  감지: 시작할 때·화면이 다시 보일 때·창에 포커스가 올 때·온라인이 될 때·보이는 동안 60초마다 registration.update() 와
//        sw.js 원문을 직접 받아(no-store + 쿼리로 CDN·HTTP 캐시 우회) 버전·리비전을 비교 → 서비스워커 설치가 끝나기 전에도 몇 초 안에 알림
//  적용: 새 서비스워커가 대기 중이면 SKIP_WAITING → controllerchange 에서 딱 한 번 새로고침(반복 방지 기록).
//        불러온 데이터가 없으면 곧바로, 작업 중이면 입력·끌기·처리 중이 아닐 때 10초 조용하면 자동(직전에 작업 저장 + 새로고침 뒤 복원),
//        '나중에' 는 5분 뒤 다시 안내
import { notify } from "./util.js";
import {
  DEFAULTS, GUARD_KEY, RESUME_KEY, parseSwVersion, detectUpdate, pageIsStale, releaseKey, nextCheckDelay, shouldCheck, checkWaitMs,
  snoozeUntil, shouldShowBanner, canAutoApply, bannerCopy, readGuard, recordReload, autoReloadAllowed, parseResume,
} from "./update-policy.js";
import { createEnvSensor, createUpdateBanner } from "./update-banner.js";

let deferredPrompt = null;
let updateReloading = false;

/** 업데이트 때문에 다시 불러오는 중인가 (이때는 '나가시겠습니까?' 확인창을 띄우지 않음 — 작업은 저장해 두었음) */
export const isUpdateReloading = () => updateReloading;

const store = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* 저장소 없음 */ } },
  del(k) { try { sessionStorage.removeItem(k); } catch { /* 무시 */ } },
};

/** 업데이트 새로고침 직전에 남긴 '작업 복원' 표식을 한 번만 꺼낸다 (없거나 기한이 지났으면 null) */
export function takeUpdateResume(now = Date.now()) {
  const raw = store.get(RESUME_KEY);
  store.del(RESUME_KEY);
  return raw ? parseResume(raw, now) : null;
}

function setInstallVisible(on) {
  const b = document.getElementById("installBtn");
  if (b) b.hidden = !on;
}

export function installApp() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  deferredPrompt.userChoice.finally(() => { deferredPrompt = null; setInstallVisible(false); });
}

function watchNetwork() {
  const chip = document.getElementById("net");
  const update = () => { if (chip) chip.hidden = navigator.onLine; };
  addEventListener("online", update);
  addEventListener("offline", update);
  update();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 서비스워커에 버전을 묻는다 (예전 서비스워커는 답이 없어 null) */
function askVersion(worker, ms = 1500) {
  return new Promise(resolve => {
    if (!worker) { resolve(null); return; }
    const ch = new MessageChannel();
    const t = setTimeout(() => resolve(null), ms);
    ch.port1.onmessage = e => { clearTimeout(t); resolve(e.data?.version ? e.data : null); };
    try { worker.postMessage({ type: "GET_VERSION" }, [ch.port2]); } catch { clearTimeout(t); resolve(null); }
  });
}

/**
 * @param {ServiceWorkerRegistration} reg
 * @param {{appVersion:string, hasUnsavedWork:()=>boolean, isPersistent:()=>boolean, isSaving:()=>boolean, prepareReload:()=>Promise<object|null>}} o
 */
function createUpdater(reg, o) {
  const sw = navigator.serviceWorker;
  const sensor = createEnvSensor();
  const S = {
    available: false, info: null, swapped: false, reloadOnChange: false, hadController: !!sw.controller,
    shownAt: 0, snoozedUntil: 0, applying: false, failedUntil: 0,
    lastCheckAt: 0, failures: 0, timer: 0, ticker: 0, running: { version: o.appVersion, revision: null },
  };
  const banner = createUpdateBanner({ onNow: () => apply(false), onLater: snooze });
  const env = () => ({ ...sensor.read(), saving: !!o.isSaving(), hasWork: !!o.hasUnsavedWork(), persistOk: !!o.isPersistent() });
  const target = () => releaseKey(S.info) || "unknown";
  const guard = () => readGuard(store.get(GUARD_KEY));

  const decide = (now = Date.now()) => {
    const d = canAutoApply({
      available: S.available, now, shownAt: S.shownAt, lastInteractionAt: sensor.lastInteractionAt(), snoozedUntil: S.snoozedUntil,
      autoAllowed: autoReloadAllowed(guard(), now, target()), ...env(),
    });
    return d.ok && now < S.failedUntil ? { ...d, ok: false, reason: "failed" } : d;
  };

  function tick() {
    const now = Date.now();
    if (!S.available) { banner.render({ visible: false, phase: "available", text: "", hint: "", progress: 0 }); return; }
    if (S.snoozedUntil && now >= S.snoozedUntil) { S.snoozedUntil = 0; S.shownAt = now; } // 미룬 시간이 끝나면 다시 안내(카운트다운 처음부터)
    const e = env(), d = decide(now);
    const phase = S.applying ? "applying" : now < S.failedUntil ? "failed" : "available";
    const copy = bannerCopy({ phase, version: S.info?.version, hasWork: e.hasWork, persistOk: e.persistOk, reason: d.reason, remainingMs: d.remainingMs });
    const total = e.hasWork ? DEFAULTS.idleMs : DEFAULTS.idleMsNoWork;
    banner.render({
      visible: shouldShowBanner({ available: true, snoozedUntil: S.snoozedUntil, now, presenting: e.presenting }),
      phase, text: copy.text, hint: copy.hint, progress: d.reason === "wait" || d.ok ? 1 - d.remainingMs / total : 0,
    });
    if (d.ok && !S.applying) apply(true);
  }
  const startTicking = () => { if (!S.ticker) S.ticker = setInterval(tick, 1000); };

  function markAvailable(info) {
    if (info?.version && (!S.info || releaseKey(info) !== releaseKey(S.info))) S.info = info;
    if (!S.available) { S.available = true; S.shownAt = Date.now(); }
    startTicking();
    tick();
  }
  function snooze() {
    S.snoozedUntil = snoozeUntil(Date.now());
    if (banner.el.contains(document.activeElement)) document.getElementById("main")?.focus({ preventScroll: true }); // 띠가 사라져 포커스를 잃지 않도록
    tick();
  }

  /** 새 서비스워커가 설치되어 대기 상태가 될 때까지 기다림 (설치가 진행 중이 아니면 update() 로 다시 시도) */
  async function waitForWaiting(ms = 45_000) {
    const t0 = Date.now();
    let kicked = 0;
    while (Date.now() - t0 < ms) {
      if (reg.waiting) return reg.waiting;
      if (!reg.installing && Date.now() - kicked > 12_000) { kicked = Date.now(); reg.update().catch(() => { /* 오프라인 */ }); }
      await sleep(400);
    }
    return reg.waiting || null;
  }

  async function apply(auto) {
    if (S.applying) return;
    S.applying = true; S.failedUntil = 0;
    tick();
    try {
      const worker = S.swapped ? null : await waitForWaiting();
      if (!S.swapped && !worker) throw new Error("새 서비스워커를 받지 못함");
      let resume = null;
      try { resume = await o.prepareReload(); } catch (e) { if (auto) throw e; console.warn("작업 저장 실패:", e); }
      // 마지막 순간 재확인: 그 사이 입력·조작이 시작됐으면 이번엔 포기하고 다음 기회로
      if (auto && !decide().ok) { S.applying = false; tick(); return; }
      store.set(GUARD_KEY, JSON.stringify(recordReload(guard(), Date.now(), target())));
      if (resume) store.set(RESUME_KEY, JSON.stringify(resume));
      updateReloading = true;
      if (S.swapped) { location.reload(); return; }
      S.reloadOnChange = true;
      worker.postMessage({ type: "SKIP_WAITING" });
      await sleep(10_000);
      throw new Error("새 서비스워커가 활성화되지 않음");
    } catch (err) {
      console.info("업데이트 적용 보류:", err.message);
      S.applying = false; S.reloadOnChange = false; updateReloading = false;
      store.del(RESUME_KEY);
      S.failedUntil = Date.now() + 60_000;
      tick();
    }
  }

  // ── 서비스워커 이벤트 ──
  async function verifyController() {
    const info = await askVersion(sw.controller);
    if (!info) return;
    S.running.revision = info.revision || null;
    if (pageIsStale(o.appVersion, info)) { S.swapped = true; markAvailable(info); } // 화면이 활성 서비스워커보다 낡음 → 다시 불러오기만 하면 됨
  }
  sw.addEventListener("controllerchange", async () => {
    if (S.reloadOnChange) { location.reload(); return; }
    if (!S.hadController) { S.hadController = true; verifyController(); return; } // 첫 설치의 clients.claim
    S.swapped = true; // 다른 창에서 새 버전을 적용함 → 이 창도 다시 불러와야 새 파일과 맞음
    const info = await askVersion(sw.controller);
    if (info) S.running.revision = info.revision || S.running.revision;
    markAvailable(info);
  });
  const onWaiting = worker => {
    markAvailable(null);
    askVersion(worker).then(info => { if (info) { S.info = info; tick(); } });
  };
  reg.addEventListener("updatefound", () => {
    const w = reg.installing;
    w?.addEventListener("statechange", () => { if (w.state === "installed" && sw.controller) onWaiting(w); });
  });

  // ── 확인(감지) ──
  async function fetchRemote() {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    try {
      const res = await fetch(new URL(`sw.js?_=${Date.now()}`, reg.scope).href, { cache: "no-store", credentials: "omit", signal: ac.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseSwVersion(await res.text());
    } finally { clearTimeout(t); }
  }
  async function runCheck() {
    const now = Date.now();
    if (S.applying || !shouldCheck({ now, lastCheckAt: S.lastCheckAt, online: navigator.onLine })) return;
    S.lastCheckAt = now;
    const [, remote] = await Promise.allSettled([reg.update(), fetchRemote()]);
    if (remote.status === "rejected") { S.failures += 1; return; } // 오프라인·서버 오류: 조용히 넘기고 주기만 늘림
    S.failures = 0;
    if (reg.waiting && sw.controller && !S.available) onWaiting(reg.waiting);
    const d = detectUpdate(S.running, remote.value);
    if (d.available) markAvailable(remote.value);
  }
  function scheduleNext() {
    clearTimeout(S.timer);
    const delay = nextCheckDelay({ failures: S.failures, hidden: document.hidden });
    if (delay === null) return; // 숨겨진 동안은 멈춤 — 다시 보일 때 바로 확인
    S.timer = setTimeout(async () => { await runCheck(); scheduleNext(); }, delay);
  }
  let deferred = 0;
  const checkNow = () => {
    const wait = checkWaitMs({ now: Date.now(), lastCheckAt: S.lastCheckAt });
    // 방금 확인했다면 계기를 버리지 않고 허용 간격이 지난 뒤 한 번만 확인
    if (wait > 0) { if (!deferred) deferred = setTimeout(() => { deferred = 0; checkNow(); }, wait); return; }
    runCheck().finally(scheduleNext);
  };
  document.addEventListener("visibilitychange", () => { if (document.hidden) clearTimeout(S.timer); else checkNow(); });
  addEventListener("focus", checkNow);
  addEventListener("online", () => { S.failures = 0; checkNow(); });

  // ── 시작 ──
  if (sw.controller) verifyController();
  if (reg.waiting && sw.controller) onWaiting(reg.waiting);
  checkNow();
}

/** @param {Parameters<typeof createUpdater>[1]} opts */
async function registerSw(opts) {
  if (!("serviceWorker" in navigator) || !isSecureContext) return;
  // 로컬 개발 서버에서는 캐시 때문에 수정이 안 보이는 일을 막기 위해 ?sw 를 붙였을 때만 등록
  if (["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) && !new URLSearchParams(location.search).has("sw")) return;
  let reg;
  try { reg = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }); } catch (e) { console.info("서비스워커 등록 생략:", e.message); return; }
  createUpdater(reg, opts);
}

/**
 * @param {{onFile:(file:File)=>void, appVersion:string, hasUnsavedWork:()=>boolean, isPersistent:()=>boolean, isSaving:()=>boolean, prepareReload:()=>Promise<object|null>}} opts
 */
export function initPwa({ onFile, ...updateOpts }) {
  addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredPrompt = e; setInstallVisible(true); });
  addEventListener("appinstalled", () => { deferredPrompt = null; setInstallVisible(false); notify("앱으로 설치했습니다. 바탕화면·시작 메뉴에서 바로 열 수 있습니다."); });
  watchNetwork();
  // 설치된 앱에서 .xlsx/.csv 를 '연결 프로그램'으로 연 경우
  if ("launchQueue" in window) {
    window.launchQueue.setConsumer(async params => {
      const h = params.files?.[0];
      if (h) onFile(await h.getFile());
    });
  }
  registerSw(updateOpts);
}
