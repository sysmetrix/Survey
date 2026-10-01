// 발표용 HTML 내보내기: 외부 요청을 막는 CSP 메타·스크립트 끊김 방지
import test from "node:test";
import assert from "node:assert/strict";
import { buildPresentHtml, EXPORT_CSP } from "../../js/present/export-html.js";

const slide = { light: "<article>밝음</article>", dark: "<article>어두움</article>", title: "제목", section: "", notes: ["메모"] };

test("내보낸 HTML head 에 외부 요청을 막는 CSP 메타가 charset 바로 다음에 있음", () => {
  const html = buildPresentHtml({ title: "발표", slides: [slide] });
  assert.equal(EXPORT_CSP, "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:");
  const head = /<head>([\s\S]*?)<\/head>/.exec(html)[1];
  assert.match(head, /^\s*<meta charset="utf-8">\s*<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:">/);
  // 허용 목록에 외부 출처·blob:·connect 가 없다
  assert.equal(/https?:|blob:|connect-src/.test(EXPORT_CSP), false);
  // 파일 안에서 쓰는 스크립트·스타일은 인라인이라 CSP 와 맞는다 (외부 script/link 없음)
  assert.equal(/<script\s+src=|<link\s/i.test(html), false);
});

test("슬라이드 문자열 안의 </script> 가 실행 스크립트를 끊지 않음", () => {
  const html = buildPresentHtml({ slides: [{ ...slide, light: "<p></script><script>alert(1)</script></p>" }] });
  assert.equal((html.match(/<\/script/gi) || []).length, 1);
});
