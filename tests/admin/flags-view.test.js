// 관리자 '기능 플래그' 탭 — 마이그레이션 미적용(테이블 없음) 오류를 정확히 구분해내는지
import test from "node:test";
import assert from "node:assert/strict";
import { isMissingTableError } from "../../js/ui/views/admin/flags.js";
import { featureStatus } from "../../js/admin/feature-status.js";

test("PostgREST 스키마 캐시 오류(관계 없음)를 마이그레이션 미적용으로 인식", () => {
  assert.equal(isMissingTableError("Could not find the table 'public.feature_flags' in the schema cache"), true);
  assert.equal(isMissingTableError('relation "public.feature_flags" does not exist'), true);
  assert.equal(isMissingTableError("PGRST205"), true);
  assert.equal(isMissingTableError("42P01"), true);
});

test("다른 오류(네트워크·권한 등)는 그대로 일반 오류로 취급", () => {
  assert.equal(isMissingTableError("Failed to fetch"), false);
  assert.equal(isMissingTableError("admin only"), false);
  assert.equal(isMissingTableError(undefined), false);
});

test("관리자 검증(preview) 플래그는 공개 전환 스위치를 잠그지 않는다", () => {
  assert.equal(featureStatus("operationalUsageStats"), "preview");
  assert.notEqual(featureStatus("operationalUsageStats"), "planned");
});
