// 작업 내역: 스냅샷 캡처·비교·보관 규칙·되돌리기·암호화
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { parseFile } from "../../js/io/parse.js";
import { state, loadDataset, compute } from "../../js/ui/store.js";
import { captureEditable, stableStringify, contentHash, diffEditable, diffCount, planRetention, summarize, projectIdOf } from "../../js/history/snapshot.js";
import { createUndoStack } from "../../js/history/undo.js";
import { encryptJson, decryptJson } from "../../js/history/crypto.js";
const require = createRequire(import.meta.url);
const XLSX = require("../../vendor/xlsx-0.20.3.full.min.js"), Papa = require("../../vendor/papaparse-5.4.1.min.js");

test("스냅샷: 원자료 제외·키 순서 무관 해시·변경 내용 비교", async () => {
  const f = "2026_진로탐색_사전사후.xlsx";
  loadDataset(parseFile(new Uint8Array(await readFile(`samples/${f}`)), f, { XLSX, Papa }));
  const before = captureEditable(state);
  assert.ok(!("dataset" in before) && before.codebook && before.kpis.length === 6);
  assert.equal(stableStringify({ b: 1, a: [1, { d: 2, c: 3 }] }), stableStringify({ a: [1, { c: 3, d: 2 }], b: 1 }));
  assert.equal(contentHash(stableStringify(before)), contentHash(stableStringify(captureEditable(state))));
  assert.ok(projectIdOf(state.codebook).startsWith("p-"));

  const col = state.codebook.columns.find(c => c.role === "likert");
  col.label = "바꾼 문항명"; col.reverse = true;
  state.kpis[0].target = 20;
  state.kpis.push({ id: "K9", name: "새 지표" });
  state.overrides["sum.kpi"] = "직접 고친 문장";
  state.hiddenChapters.push("주관식 응답 분석");
  state.settings.fontPreset = "hancom";   // 기본값(공문서형)에서 바꿔야 변경으로 잡힌다
  const after = captureEditable(state);
  const d = diffEditable(before, after);
  const areas = Object.fromEntries(d.map(g => [g.area, g.items.join(" / ")]));
  assert.match(areas["데이터 설정"], /표시 이름/);
  assert.match(areas["데이터 설정"], /역문항 지정/);
  assert.match(areas["성과지표"], /목표 12→20/);
  assert.match(areas["성과지표"], /추가: ‘새 지표’/);
  assert.match(areas["보고서 문장"], /직접 수정 1건/);
  assert.match(areas["보고서 구성"], /장 1개 숨김/);
  assert.match(areas["보고서 설정"], /글꼴/);
  assert.equal(diffCount(diffEditable(after, after)), 0);
  const sm = summarize(state, compute());
  assert.equal(sm.n, 94);
  assert.ok(sm.kpi && sm.fileName === f);
});

test("보관 규칙: 고정·직접 저장 유지, 자동 저장은 개수·기간 제한, 최신은 항상 유지", () => {
  const now = Date.UTC(2026, 8, 14);
  const day = 86400000;
  const snaps = [
    ...Array.from({ length: 40 }, (_, i) => ({ id: `a${i}`, kind: "auto", createdAt: now - i * 3600000 })),
    { id: "old-auto", kind: "auto", createdAt: now - 200 * day },
    { id: "old-manual", kind: "manual", createdAt: now - 400 * day },
    { id: "old-pinned", kind: "export", pinned: true, createdAt: now - 400 * day },
    { id: "old-export", kind: "export", createdAt: now - 100 * day },
  ];
  const rm = new Set(planRetention(snaps, { maxAuto: 30, maxAgeDays: 90, now }));
  assert.ok(!rm.has("a0") && !rm.has("a29") && rm.has("a30") && rm.has("a39"));
  assert.ok(rm.has("old-auto") && rm.has("old-export"));
  assert.ok(!rm.has("old-manual") && !rm.has("old-pinned"));
  assert.deepEqual(planRetention([{ id: "only", kind: "auto", createdAt: now - 999 * day }], { now }), []);
});

test("되돌리기·다시 실행 스택", () => {
  const u = createUndoStack({ limit: 3 });
  u.reset("s0");
  assert.equal(u.record("s0"), false);
  ["s1", "s2", "s3", "s4"].forEach(s => u.record(s));
  assert.deepEqual(u.depth, { undo: 3, redo: 0 });
  assert.equal(u.undo(), "s3");
  assert.equal(u.undo(), "s2");
  assert.equal(u.redo(), "s3");
  u.record("s5");
  assert.equal(u.canRedo, false);
  assert.equal(u.undo(), "s3");
  assert.equal(u.undo(), "s2");
  assert.equal(u.undo(), "s1");
  assert.equal(u.undo(), null, "한도(3) 넘는 과거는 버림");
});

test("원자료 암호화: AES-GCM 왕복·비밀번호 오류·변조 감지·짧은 비밀번호 거부", async () => {
  const data = { sheets: [{ name: "응답", headers: ["이름"], rows: [["홍길동"]] }] };
  const box = await encryptJson(data, "correct horse 1");
  assert.equal(box.alg, "AES-GCM-256");
  assert.ok(!JSON.stringify(box).includes("홍길동"));
  assert.deepEqual(await decryptJson(box, "correct horse 1"), data);
  await assert.rejects(decryptJson(box, "wrong password"), /비밀번호/);
  const tampered = { ...box, data: box.data.slice(0, -4) + (box.data.endsWith("AAAA") ? "BBBB" : "AAAA") };
  await assert.rejects(decryptJson(tampered, "correct horse 1"));
  await assert.rejects(encryptJson(data, "short"), /8자/);
});
