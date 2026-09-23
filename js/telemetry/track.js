// 익명 사용 이벤트 계측 — anon_id 는 세션 스토리지 전용 난수이며 로그인 계정과 절대 연결되지 않는다.
// event 는 아래 ALLOW 목록에 있는 것만 전송되고, extra 는 이벤트별 허용 키·40자 이하 문자열만 통과한다.
// 그 밖의 것(등록 안 된 이벤트, 허용 밖 키, 긴 문자열)은 코드 레벨에서 구조적으로 버려져
// 실수로 설문 문항·응답 같은 내용이 섞여 나갈 수 없다(README 개인정보 원칙 유지 장치).
import { rpcRequest } from "../auth/api.js";

const ANON_ID_KEY = "survey-v5-anon-id";
const SRC_KEY = "survey-v5-src";
const FLUSH_MS = 15000;
const MAX_BATCH = 20;
const MAX_STR = 40;

const ALLOW = {
  view_enter: [],
  export_hwpx: [],
  export_pptx: [],
  export_html: [],
  export_pdf: [],
  sample_load: ["file"],
  js_error: [],
};

/** 이벤트별 허용 키만 남기고 나머지는 버림(문자열은 길이도 제한). 순수 함수 — 테스트 대상 */
export function sanitizeExtra(event, extra) {
  const keys = ALLOW[event];
  if (!keys || !extra) return undefined;
  const out = {};
  for (const k of keys) {
    const v = extra[k];
    if (typeof v === "string" && v.length > 0 && v.length <= MAX_STR) out[k] = v;
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

let anonId = "";
function getAnonId() {
  if (anonId) return anonId;
  try {
    anonId = sessionStorage.getItem(ANON_ID_KEY) || "";
    if (!anonId) { anonId = crypto.randomUUID(); sessionStorage.setItem(ANON_ID_KEY, anonId); }
  } catch { anonId = crypto.randomUUID(); }
  return anonId;
}

// 접속 경로 태그: 배포 링크에 ?src=경기도청 처럼 붙이면 그 값을 세션 동안 기억해 모든 이벤트에 함께 보냄.
// 리퍼러(어디서 왔는지)는 보지 않는다 — README 의 "리퍼러 전송 안 함" 약속은 그대로 유지.
let srcTag = null;
function getSrcTag() {
  if (srcTag !== null) return srcTag;
  try {
    const fromUrl = new URLSearchParams(location.search).get("src");
    if (fromUrl) { srcTag = fromUrl.trim().slice(0, MAX_STR); sessionStorage.setItem(SRC_KEY, srcTag); }
    else srcTag = sessionStorage.getItem(SRC_KEY) || "";
  } catch { srcTag = ""; }
  return srcTag;
}

/**
 * 접속 기기·브라우저 분류 — User-Agent 문자열만 보고 판단(순수 함수 — 테스트 대상).
 * 알려진 한계: 최신 iPadOS의 Safari는 기본 설정에서 데스크톱 Mac과 완전히 같은 UA를 보내
 * (애플이 의도적으로 그렇게 통일함) 문자열만으로는 구분할 수 없어 "PC"로 분류된다 —
 * 구글 애널리틱스 등 다른 도구도 같은 한계를 가진다(오탐이 아니라 UA 자체가 동일함).
 */
export function classifyUserAgent(ua) {
  const s = String(ua || "");
  let browser = "기타";
  if (/Edg\//.test(s)) browser = "Edge";
  else if (/SamsungBrowser\//.test(s)) browser = "삼성 인터넷";
  else if (/Firefox\//.test(s)) browser = "Firefox";
  else if (/Chrome\//.test(s)) browser = "Chrome";
  else if (/Safari\//.test(s) && /Version\//.test(s)) browser = "Safari"; // Chrome·Edge 도 Safari/ 토큰을 남기므로 Version/ 도 함께 있어야 진짜 Safari
  let device = "PC";
  if (/iPad|(?:Android|Tablet)(?!.*Mobile)/i.test(s)) device = "태블릿";
  else if (/Mobi|iPhone|Android/i.test(s)) device = "모바일";
  return { device, browser };
}

// 이번 세션 동안 바뀌지 않는 값이라 한 번만 계산해 재사용(org·src 처럼 매 이벤트에 함께 실려 감)
let deviceBrowser = null;
function getDeviceBrowser() {
  if (deviceBrowser) return deviceBrowser;
  try { deviceBrowser = classifyUserAgent(navigator.userAgent); } catch { deviceBrowser = { device: "", browser: "" }; }
  return deviceBrowser;
}

let appVersion = "";
let getOrg = () => ""; // main.js 가 state.settings.orgName 을 넘겨줌(설정이 바뀌면 다음 이벤트부터 바로 반영되도록 매번 호출)
let sender = events => rpcRequest("track_events", { events });
let queue = [];
let timer = 0;

/** main.js 부트스트랩에서 한 번 호출. send 를 넘기면 테스트에서 실제 네트워크 대신 목(mock)을 쓸 수 있음 */
export function initTelemetry({ version = "", send, getOrg: g } = {}) {
  appVersion = version;
  if (send) sender = send;
  if (g) getOrg = g;
}

export function trackEvent(view, event, extra) {
  if (!(event in ALLOW)) return; // 등록 안 된 이벤트 이름은 구조적으로 버림
  const org = String(getOrg() || "").trim().slice(0, MAX_STR);
  const { device, browser } = getDeviceBrowser();
  queue.push({ anon_id: getAnonId(), view, event, extra: sanitizeExtra(event, extra), app_version: appVersion, org: org || undefined, src: getSrcTag() || undefined, device: device || undefined, browser: browser || undefined });
  if (queue.length >= MAX_BATCH) flush();
  else scheduleFlush();
}

function scheduleFlush() {
  if (timer) return;
  timer = setTimeout(flush, FLUSH_MS);
}

/** 큐를 비우고 전송 시도. 실패해도 재시도하지 않음 — 통계 손실은 허용, 큐 무한 증식 방지가 우선 */
export async function flush() {
  clearTimeout(timer); timer = 0;
  if (!queue.length) return;
  const batch = queue.splice(0, MAX_BATCH);
  try { await sender(batch); } catch { /* 이번 배치는 버림 */ }
}

export function installAutoFlush() {
  if (typeof document === "undefined") return;
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
  window.addEventListener("pagehide", () => flush());
}
