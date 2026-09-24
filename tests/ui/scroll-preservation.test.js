import test from "node:test";
import assert from "node:assert/strict";
import { shouldRestoreViewport } from "../../js/ui/scroll-preservation.js";

test("같은 화면의 재렌더링은 요청 여부와 관계없이 스크롤을 유지한다", () => {
  assert.equal(shouldRestoreViewport({ viewChanged: false }), true);
  assert.equal(shouldRestoreViewport({ viewChanged: false, keepScroll: true }), true);
});

test("새 단계로 이동할 때만 기본적으로 새 화면 상단에서 시작한다", () => {
  assert.equal(shouldRestoreViewport({ viewChanged: true }), false);
  assert.equal(shouldRestoreViewport({ viewChanged: true, keepScroll: true }), true);
});
