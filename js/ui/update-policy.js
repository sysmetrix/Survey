// 앱 업데이트 판단 규칙 (순수 모듈 — DOM·서비스워커 없음, 시각은 인자로 주입)
// 새 배포를 얼마나 빨리 알아채고(감지) 언제 화면을 다시 불러와도 안전한지(적용) 정한다. 실제 배선은 pwa.js.

export const DEFAULTS = Object.freeze({
  /** 작업 중일 때: 마지막 조작 뒤 이만큼 가만히 있으면 자동 적용 */
  idleMs: 10_000,
  /** 불러온 데이터가 없을 때(잃을 작업 없음): 거의 바로 적용 */
  idleMsNoWork: 1_500,
  /** '나중에' 를 누르면 이 시간 동안 조용히 */
  snoozeMs: 5 * 60_000,
  /** 화면이 보이는 동안 확인 주기 */
  pollMs: 60_000,
  /** 연속 실패 시 늘려 가는 주기의 상한 */
  maxBackoffMs: 5 * 60_000,
  /** 아무리 잦은 계기(포커스·표시 전환 등)가 와도 이 간격보다 자주 확인하지 않음 */
  minCheckGapMs: 15_000,
  /** 같은 배포로 다시 자동 새로고침하지 않는 기간 */
  loopWindowMs: 10 * 60_000,
  /** 그 밖에, 이 짧은 기간 안에 자동 새로고침을 이 횟수 넘게 하지 않음 (배포를 연달아 해도 몇 분 간격이면 문제없음) */
  burstWindowMs: 2 * 60_000,
  maxReloadsInBurst: 3,
  /** 작업 복원 표식의 유효 시간 (새로고침 직후에만 의미가 있음) */
  resumeTtlMs: 2 * 60_000,
});

export const GUARD_KEY = "survey-v5-update-guard";
export const RESUME_KEY = "survey-v5-update-resume";

// ───────────── 버전 문자열 ─────────────

/** "5.28.0" → [5,28,0] (숫자와 점만, 2~4 마디). 그 밖에는 null */
export function parseVersion(v) {
  if (typeof v !== "string" || !/^\d{1,6}(\.\d{1,6}){1,3}$/.test(v.trim())) return null;
  return v.trim().split(".").map(Number);
}

/** a<b → -1, 같음 → 0, a>b → 1, 하나라도 해석 불가 → null (마디 수가 다르면 모자란 쪽을 0 으로 봄) */
export function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  if (!x || !y) return null;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * 받아 온 sw.js 원문에서 배포 버전을 읽는다. tools/build-sw.mjs 가 만든 `const VERSION = "…"`, `const REVISION = "…"` 를 찾음.
 * 버전을 읽지 못하면(오류 페이지·빈 응답·형식 변경) null → 호출쪽에서 '알 수 없음'으로 조용히 넘어간다.
 * @returns {{version:string, revision:string|null}|null}
 */
export function parseSwVersion(text) {
  if (typeof text !== "string" || !text) return null;
  const head = text.length > 20000 ? text.slice(0, 20000) : text; // 생성 블록은 맨 앞쪽
  const v = /(?:^|\n)\s*const\s+VERSION\s*=\s*"([^"\n]{1,40})"/.exec(head);
  if (!v || !parseVersion(v[1])) return null;
  const r = /(?:^|\n)\s*const\s+REVISION\s*=\s*"([0-9a-f]{6,64})"/i.exec(head);
  return { version: v[1].trim(), revision: r ? r[1].toLowerCase() : null };
}

/** 배포 식별자 (버전+리비전) — 같은 배포를 두 번 자동 적용하지 않기 위한 열쇠 */
export const releaseKey = info => (info && info.version ? `${info.version}#${info.revision || ""}` : "");

/**
 * 실행 중인 앱과 서버의 sw.js 를 견주어 업데이트 여부를 판단.
 * - 서버 버전이 더 높으면 업데이트
 * - 버전이 같아도 리비전(파일 내용 해시)이 다르면 업데이트 (버전을 올리지 않은 배포)
 * - 서버가 더 낮은 버전(캐시·롤백)이면 여기서는 업데이트로 보지 않음 — 서비스워커 자체 갱신 경로가 처리
 * @param {{version:string, revision?:string|null}} running
 * @param {{version:string, revision?:string|null}|null} remote
 * @returns {{available:boolean, reason:'none'|'unknown'|'newer'|'revision'|'same'|'older', version:string|null}}
 */
export function detectUpdate(running, remote) {
  if (!remote || !remote.version) return { available: false, reason: "unknown", version: null };
  const cmp = compareVersions(remote.version, running?.version);
  if (cmp === null) return { available: false, reason: "unknown", version: null };
  if (cmp > 0) return { available: true, reason: "newer", version: remote.version };
  if (cmp < 0) return { available: false, reason: "older", version: remote.version };
  if (running.revision && remote.revision && running.revision !== remote.revision) return { available: true, reason: "revision", version: remote.version };
  return { available: false, reason: "same", version: remote.version };
}

/** 이 화면(APP_VERSION)이 이미 활성화된 서비스워커보다 낡았나 — 첫 방문·HTTP 캐시로 예전 화면이 떠 있는 경우 등 */
export function pageIsStale(appVersion, controller) {
  if (!controller || !controller.version) return false;
  return compareVersions(controller.version, appVersion) === 1;
}

// ───────────── 확인 주기 ─────────────

/** 다음 자동 확인까지 대기(ms). 화면이 숨겨져 있으면 null(멈춤 — 다시 보일 때 즉시 확인). 실패가 이어지면 2배씩 늘림 */
export function nextCheckDelay({ failures = 0, hidden = false, pollMs = DEFAULTS.pollMs, maxBackoffMs = DEFAULTS.maxBackoffMs } = {}) {
  if (hidden) return null;
  const f = Math.max(0, Math.min(10, Math.floor(failures) || 0));
  return Math.min(maxBackoffMs, pollMs * 2 ** f);
}

/** 지금 확인해도 되나 (오프라인이면 안 함, 너무 잦으면 안 함) */
export function shouldCheck({ now, lastCheckAt = 0, online = true, minGapMs = DEFAULTS.minCheckGapMs, force = false } = {}) {
  if (!online) return false;
  if (force) return true;
  return now - lastCheckAt >= minGapMs;
}

/** 확인 계기가 너무 잦아 막혔을 때, 언제 다시 확인하면 되는지(ms, 0 이면 지금) — 계기를 버리지 않고 허용 간격이 지난 뒤 한 번 확인 */
export function checkWaitMs({ now, lastCheckAt = 0, minGapMs = DEFAULTS.minCheckGapMs } = {}) {
  return Math.max(0, lastCheckAt + minGapMs - now);
}

// ───────────── 알림·자동 적용 ─────────────

/** '나중에' 누른 시각부터 재알림 시각 */
export const snoozeUntil = (now, ms = DEFAULTS.snoozeMs) => now + ms;
export const isSnoozed = (snoozedUntil, now) => Number.isFinite(snoozedUntil) && now < snoozedUntil;

/** 안내 띠를 보여줄 때 — 새 버전이 있고, 미루는 중이 아니고, 발표 중이 아닐 때 */
export function shouldShowBanner({ available, snoozedUntil = 0, now, presenting = false }) {
  return !!available && !presenting && !isSnoozed(snoozedUntil, now);
}

/**
 * 지금 화면을 다시 불러오면 안 되는 이유 (없으면 null).
 * 글 입력 중·끌어 놓기 중·처리 중 오버레이·발표 중·안내 진행 중·저장 대기 중이면 미룸.
 * 불러온 데이터가 있는데 이 브라우저에 작업을 저장할 수 없으면(hasWork && !persistOk) 자동 적용 안 함 — 직접 누르는 것만 허용.
 */
export function unsafeReason(s) {
  if (s.presenting) return "presenting";
  if (s.typing) return "typing";
  if (s.dragging) return "dragging";
  if (s.busy) return "busy";
  if (s.tutorial) return "tutorial";
  if (s.saving) return "saving";
  if (s.hasWork && !s.persistOk) return "no-persist";
  return null;
}

/**
 * 자동 적용 판단.
 * @param {{available:boolean, now:number, shownAt:number, lastInteractionAt:number, snoozedUntil?:number, autoAllowed?:boolean,
 *   hasWork:boolean, persistOk:boolean, typing?:boolean, dragging?:boolean, busy?:boolean, presenting?:boolean, tutorial?:boolean, saving?:boolean}} s
 * @param {{idleMs?:number, idleMsNoWork?:number}} [opt]
 * @returns {{ok:boolean, reason:string|null, remainingMs:number}} reason: none|snoozed|loop-guard|<unsafeReason>|wait
 */
export function canAutoApply(s, { idleMs = DEFAULTS.idleMs, idleMsNoWork = DEFAULTS.idleMsNoWork } = {}) {
  const idle = s.hasWork ? idleMs : idleMsNoWork;
  const base = Math.max(s.shownAt || 0, s.lastInteractionAt || 0);
  const remainingMs = Math.max(0, base + idle - s.now);
  if (!s.available) return { ok: false, reason: "none", remainingMs };
  if (isSnoozed(s.snoozedUntil, s.now)) return { ok: false, reason: "snoozed", remainingMs };
  if (s.autoAllowed === false) return { ok: false, reason: "loop-guard", remainingMs };
  const bad = unsafeReason(s);
  if (bad) return { ok: false, reason: bad, remainingMs };
  if (remainingMs > 0) return { ok: false, reason: "wait", remainingMs };
  return { ok: true, reason: null, remainingMs: 0 };
}

const WHY_WAIT = {
  typing: "입력을 마치면 자동으로 적용됩니다.",
  dragging: "조작을 마치면 자동으로 적용됩니다.",
  busy: "처리가 끝나면 자동으로 적용됩니다.",
  tutorial: "안내를 마치면 자동으로 적용됩니다.",
  saving: "저장이 끝나면 자동으로 적용됩니다.",
  "no-persist": "",
  "loop-guard": "",
  presenting: "",
};

/**
 * 안내 띠 문구. text 는 상태가 바뀔 때만 바뀌는 안내(스크린리더가 읽음), hint 는 초마다 바뀌는 보조 문구.
 * @param {{phase:'available'|'applying'|'failed', version?:string|null, hasWork:boolean, persistOk:boolean, reason?:string|null, remainingMs?:number}} v
 */
export function bannerCopy({ phase, version = null, hasWork, persistOk, reason = null, remainingMs = 0 }) {
  const ver = version ? `v${version}` : "";
  if (phase === "applying") return { text: `${ver ? `${ver} 버전으로 ` : "새 버전으로 "}업데이트하는 중입니다…`, hint: "" };
  if (phase === "failed") return { text: "새 버전을 내려받지 못했습니다. 잠시 후 다시 시도합니다.", hint: "" };
  const head = ver ? `새 버전 ${ver}이(가) 나왔습니다.` : "새 버전이 나왔습니다.";
  const save = !hasWork ? "" : persistOk ? " 작업 내용은 자동 저장됩니다." : " 이 브라우저에 작업을 저장할 수 없어 불러온 데이터를 다시 올려야 합니다. 프로젝트 파일을 먼저 저장하세요.";
  let hint = "";
  if (reason === "wait") hint = `${Math.max(1, Math.ceil(remainingMs / 1000))}초 뒤 자동 적용`;
  else if (reason && WHY_WAIT[reason]) hint = WHY_WAIT[reason];
  return { text: head + save, hint };
}

// ───────────── 새로고침 반복 방지 ─────────────

/** sessionStorage 원문 → {entries:[{at,target}]} (깨진 값은 빈 기록) */
export function readGuard(raw) {
  try {
    const o = JSON.parse(raw);
    const entries = Array.isArray(o?.entries) ? o.entries.filter(e => e && Number.isFinite(e.at) && typeof e.target === "string").slice(-8) : [];
    return { entries };
  } catch { return { entries: [] }; }
}

/** 새로고침을 하기로 한 순간의 기록 추가 (오래된 것은 정리) */
export function recordReload(guard, now, target, { loopWindowMs = DEFAULTS.loopWindowMs } = {}) {
  const entries = (guard?.entries || []).filter(e => now - e.at < loopWindowMs).concat({ at: now, target: String(target || "") }).slice(-8);
  return { entries };
}

/**
 * 자동 새로고침을 해도 되나. 같은 배포(target)로 최근에 이미 새로고침했는데도 또 감지된다면
 * (서버가 엇갈린 파일을 주는 등) 반복하지 않는다. 짧은 기간(2분)의 총 횟수에도 상한. 직접 '지금 업데이트' 는 이 검사를 받지 않음.
 */
export function autoReloadAllowed(guard, now, target, { loopWindowMs = DEFAULTS.loopWindowMs, burstWindowMs = DEFAULTS.burstWindowMs, maxReloadsInBurst = DEFAULTS.maxReloadsInBurst } = {}) {
  const entries = guard?.entries || [];
  if (entries.filter(e => now - e.at < burstWindowMs).length >= maxReloadsInBurst) return false;
  return !entries.some(e => now - e.at < loopWindowMs && e.target === String(target || ""));
}

// ───────────── 새로고침 뒤 작업 복원 표식 ─────────────

/** 표식 원문 → {projectId, hash, at} | null (기한 지남·형식 오류는 null) */
export function parseResume(raw, now, { resumeTtlMs = DEFAULTS.resumeTtlMs } = {}) {
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o.projectId !== "string" || !o.projectId || !Number.isFinite(o.at)) return null;
    if (now - o.at > resumeTtlMs || now < o.at - 5000) return null;
    return { projectId: o.projectId, hash: typeof o.hash === "string" && o.hash.startsWith("#") ? o.hash.slice(0, 300) : "", at: o.at };
  } catch { return null; }
}
