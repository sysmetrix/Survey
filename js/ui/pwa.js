// PWA: 서비스워커 등록·업데이트 알림, 앱 설치 버튼, 오프라인 표시, 파일 열기(file_handlers)
import { notify } from "./util.js";

let deferredPrompt = null;

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

/** @param {{hasUnsavedWork:()=>boolean}} opts */
async function registerSw({ hasUnsavedWork }) {
  if (!("serviceWorker" in navigator) || !isSecureContext) return;
  // 로컬 개발 서버에서는 캐시 때문에 수정이 안 보이는 일을 막기 위해 ?sw 를 붙였을 때만 등록
  if (["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) && !new URLSearchParams(location.search).has("sw")) return;
  let reg;
  try { reg = await navigator.serviceWorker.register("./sw.js"); } catch (e) { console.info("서비스워커 등록 생략:", e.message); return; }
  // 사용자가 업데이트를 누른 경우에만 새로고침 (첫 설치 시 clients.claim 으로 인한 전환은 무시)
  let accepted = false, reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (accepted && !reloading) { reloading = true; location.reload(); } });
  const prompt = worker => {
    notify(hasUnsavedWork() ? "새 버전이 준비되었습니다. 업데이트하면 불러온 데이터를 다시 올려야 합니다(프로젝트 파일을 먼저 저장하세요)." : "새 버전이 준비되었습니다.", {
      action: "지금 업데이트", onAction: () => { accepted = true; worker.postMessage({ type: "SKIP_WAITING" }); }, sticky: true,
    });
  };
  if (reg.waiting && navigator.serviceWorker.controller) prompt(reg.waiting);
  reg.addEventListener("updatefound", () => {
    const w = reg.installing;
    w?.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) prompt(w); });
  });
  // 오래 열어 두는 경우 1시간마다 업데이트 확인
  setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
}

/**
 * @param {{onFile:(file:File)=>void, hasUnsavedWork:()=>boolean}} opts
 */
export function initPwa({ onFile, hasUnsavedWork }) {
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
  registerSw({ hasUnsavedWork });
}
