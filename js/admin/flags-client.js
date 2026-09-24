// 기능 플래그 — 통계 신뢰도 고도화 4종을 관리자 전용 미리보기로 먼저 내보내고, 안정화되면
// (관리자가 "기능 플래그" 탭에서 전체 공개로 전환) 일반 이용자에게도 순차 공개하기 위한 게이팅.
// 값 자체는 민감정보가 아니라 로그인 없이도 읽을 수 있다(supabase/migrations/0005_feature_flags.sql).
import { restRequest } from "../auth/api.js";
import { isAdmin } from "../auth/session.js";
import { featureStatus, FEATURE_DEPENDENCIES } from "./feature-status.js";

let cache = null; // null=아직 못 받아옴 · {} 이상=서버 값(실패해도 빈 객체로 확정해 무한 재시도하지 않음)
let pending = null;

/** main.js 부트스트랩에서 한 번 호출. 실패해도 던지지 않음 — 통계 조회 실패가 앱 시작을 막으면 안 됨 */
export function loadFeatureFlags() {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;
  pending = restRequest("/feature_flags?select=key,enabled")
    .then(rows => { cache = Object.fromEntries((rows || []).map(r => [r.key, !!r.enabled])); return cache; })
    .catch(() => { cache = {}; return cache; })
    .finally(() => { pending = null; });
  return pending;
}

/**
 * 관리자로 로그인된 브라우저는 항상 미리보기(전체 공개 전이라도 확인 가능).
 * 일반 이용자는 서버에서 전체 공개(enabled=true)로 전환된 것만 보임. 아직 못 받아왔으면 false(안전한 기본값).
 */
export function isFeatureOn(key) {
  if (featureStatus(key) === "planned") return false;
  if ((FEATURE_DEPENDENCIES[key] || []).some(dependency => !isFeatureOn(dependency))) return false;
  if (isAdmin()) return true;
  return !!cache?.[key];
}

/** 지금 보이는 이유가 "전체 공개"가 아니라 "관리자라서"인지 — 화면에 미리보기 표시를 붙일지 판단할 때 사용 */
export function isAdminPreview(key) {
  return featureStatus(key) !== "planned" && isAdmin() && !cache?.[key];
}
export function featureVisibilityKey() { return JSON.stringify([isAdmin(), cache]); }

/** 테스트 전용: 모듈 캐시를 초기화(각 테스트가 독립된 상태에서 시작하도록) */
export function _resetForTest() { cache = null; pending = null; }
/** 테스트 전용: 네트워크 없이 캐시 값을 직접 주입 */
export function _setForTest(flags) { cache = flags; }
