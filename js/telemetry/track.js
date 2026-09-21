// 익명 사용 이벤트 계측 — anon_id 는 세션 스토리지 전용 난수이며 로그인 계정과 절대 연결되지 않는다.
// event 는 아래 ALLOW 목록에 있는 것만 전송되고, extra 는 이벤트별 허용 키·40자 이하 문자열만 통과한다.
// 그 밖의 것(등록 안 된 이벤트, 허용 밖 키, 긴 문자열)은 코드 레벨에서 구조적으로 버려져
// 실수로 설문 문항·응답 같은 내용이 섞여 나갈 수 없다(README 개인정보 원칙 유지 장치).
import { rpcRequest } from "../auth/api.js";

const ANON_ID_KEY = "survey-v5-anon-id";
const FLUSH_MS = 15000;
const MAX_BATCH = 20;
const MAX_STR = 40;

const ALLOW = {
  view_enter: [],
  export_hwpx: [],
  export_pptx: [],
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

let appVersion = "";
let sender = events => rpcRequest("track_events", { events });
let queue = [];
let timer = 0;

/** main.js 부트스트랩에서 한 번 호출. send 를 넘기면 테스트에서 실제 네트워크 대신 목(mock)을 쓸 수 있음 */
export function initTelemetry({ version = "", send } = {}) {
  appVersion = version;
  if (send) sender = send;
}

export function trackEvent(view, event, extra) {
  if (!(event in ALLOW)) return; // 등록 안 된 이벤트 이름은 구조적으로 버림
  queue.push({ anon_id: getAnonId(), view, event, extra: sanitizeExtra(event, extra), app_version: appVersion });
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
