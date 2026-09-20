// 100점 환산 기준(exact 반올림 전 | rounded 반올림 후): 엔진이 환산값을 정하고, 정렬·판정·성과지표가 그 값을 그대로 따라야 함
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { buildCodebook } from "../../js/model/codebook.js";
import { buildSurvey } from "../../js/model/survey.js";
import { analyzeSurvey } from "../../js/analysis/run.js";
import { score100 } from "../../js/analysis/items.js";
import { pairedComparison } from "../../js/analysis/prepost.js";
import { resetCrossCache } from "../../js/analysis/cross.js";
import { evaluateKpis } from "../../js/evaluation/kpi.js";
import { buildReport } from "../../js/report/build-report.js";
import { buildDeck } from "../../js/present/deck.js";
import { emptyLogicModel } from "../../js/evaluation/logic-model.js";
import { f2, cleanScoreBasis, scoreBasisExample } from "../../js/narrative/vocab.js";
import { round, seededRandom } from "../../js/core/util.js";
import { parseFile } from "../../js/io/parse.js";
import { state, loadDataset, compute, invalidate } from "../../js/ui/store.js";
import * as setup from "../../js/ui/views/setup.js";
import * as settingsView from "../../js/ui/views/settings.js";
const require = createRequire(import.meta.url);
const XLSX = require("../../vendor/xlsx-0.20.3.full.min.js");
const Papa = require("../../vendor/papaparse-5.4.1.min.js");

function makeDs() {
  const rnd = seededRandom(11);
  const headers = ["번호", "성별", "프로그램 내용이 유익했다", "강사가 전문적이었다", "시설 환경이 쾌적했다", "프로그램에 전반적으로 만족하였다"];
  const rows = Array.from({ length: 164 }, (_, i) => {
    const pick = mu => Math.max(1, Math.min(5, Math.round(mu + (rnd() - 0.5) * 2.6)));
    return [i + 1, rnd() < 0.5 ? "남" : "여", pick(4.3), pick(4.6), pick(3.9), pick(4.4)];
  });
  return { fileName: "demo.xlsx", source: "file", sheets: [{ name: "응답", headers, rows }] };
}
const analyze = (ds, scoreBasis) => { const cb = buildCodebook(ds); return { cb, an: analyzeSurvey(buildSurvey(ds, cb), { scoreBasis }) }; };
const itemTable = blocks => blocks.find(b => b.type === "table" && b.caption === "문항별 만족도");
const build = (an, cb) => buildReport({ analysis: an, evaluation: null, lint: [], logicModel: emptyLogicModel(), codebook: cb, settings: {} });

test("score100: exact 는 원값, rounded 는 소수 둘째 자리 평균으로 환산(4.37 → 84.25), 부동소수 잡음 없음", () => {
  assert.ok(Math.abs(score100(4.3659, 1, 5) - 84.1475) < 1e-9);
  assert.equal(score100(4.3659, 1, 5, "rounded"), 84.25);
  assert.equal(score100(4.198, 1, 5, "rounded"), 80); // 4.20 → 정확히 80 (79.99999999999999 아님)
  assert.ok(Number.isNaN(score100(NaN, 1, 5, "rounded")));
  assert.equal(cleanScoreBasis("rounded"), "rounded");
  assert.equal(cleanScoreBasis(undefined), "exact");
  const ex = scoreBasisExample(4.3659, 1, 5);
  assert.equal(f2(ex.exact), "84.15"); assert.equal(f2(ex.rounded), "84.25");
});

test("엔진: rounded 는 문항·전체 환산이 표시 평균으로 검산되고 meta 에 기준이 기록됨, 기본은 exact", () => {
  const ds = makeDs();
  const ex = analyze(ds, "exact").an, ro = analyze(ds, "rounded").an;
  assert.equal(ex.meta.scoreBasis, "exact"); assert.equal(ro.meta.scoreBasis, "rounded");
  assert.deepEqual(analyze(ds, undefined).an.items.map(i => i.score100), ex.items.map(i => i.score100), "기본값은 exact");
  assert.ok(ex.items.some((it, i) => f2(it.score100) !== f2(ro.items[i].score100)), "두 기준의 값이 다른 문항이 있어야 의미 있는 테스트");
  ro.items.forEach((it, i) => {
    assert.equal(it.mean, ex.items[i].mean, "평균 자체는 같음");
    assert.ok(Math.abs(it.score100 - (round(it.mean, 2) - it.min) / (it.max - it.min) * 100) < 1e-6, `${it.label}: 표시 평균으로 환산`);
  });
  const t = ro.total;
  assert.ok(Math.abs(t.score100 - (round(t.mean, 2) - t.min) / (t.max - t.min) * 100) < 1e-6, "전체 행도 표시 평균으로 환산");
  assert.notEqual(ex.total.score100, ro.total.score100);
});

test("보고서 표: rounded 는 모든 행이 표에 적힌 평균으로 검산되고 표시된 환산 점수 순으로 정렬됨", () => {
  const ds = makeDs();
  for (const basis of ["exact", "rounded"]) {
    const { cb, an } = analyze(ds, basis);
    const blocks = build(an, cb), table = itemTable(blocks);
    const rows = table.rows.slice(1).map(r => r.map(c => c.text));
    const detail = rows.filter(r => an.items.some(it => it.label === r[0] && !it.isOverall));
    const vals = detail.map(r => Number(r[4]));
    assert.deepEqual(vals, [...vals].sort((a, b) => b - a), `${basis}: 표시된 환산 점수가 높은 순`);
    if (basis === "rounded") {
      for (const r of rows.filter(r => an.items.some(it => it.label === r[0]))) {
        const it = an.items.find(x => x.label === r[0]);
        assert.equal(r[4], f2((Number(r[2]) - it.min) / (it.max - it.min) * 100), `${r[0]}: 표의 평균 ${r[2]}로 검산`);
      }
      const tot = rows.find(r => r[0] === "세부 문항 전체");
      assert.equal(tot[4], f2((Number(tot[2]) - 1) / 4 * 100));
    }
    const notes = (table.notes || []).join("|");
    assert.ok(basis === "rounded" ? notes.includes("정렬·수준 판정·성과지표 판정도 이 값을 기준") : notes.includes("반올림 전 평균으로 계산"), `${basis}: 기준 안내 주석`);
  }
});

test("성과지표 판정이 선택한 기준을 따름: 평균 4.198(반올림 4.20) 문항, 목표 80점", () => {
  const rows = Array.from({ length: 500 }, (_, i) => [i + 1, i % 2 ? "남" : "여", i < 99 ? 5 : 4, 3 + (i % 3)]); // 5가 99명, 4가 401명 → 평균 4.198
  const ds = { fileName: "k.xlsx", source: "file", sheets: [{ name: "응답", headers: ["번호", "성별", "프로그램 내용", "강사 전문성"], rows }] };
  const kpi = [{ id: "K1", name: "만족도", stage: "단기성과", goalId: "G1", metric: "score100", targetRef: "프로그램 내용", target: 80, direction: "up" }];
  const judged = basis => { const { cb, an } = analyze(ds, basis); return { item: an.items.find(i => i.label === "프로그램 내용"), r: evaluateKpis(kpi, an, cb).results[0] }; };
  const ex = judged("exact"), ro = judged("rounded");
  assert.equal(f2(ex.item.mean), "4.20");
  assert.equal(f2(ex.item.score100), "79.95"); assert.equal(ex.r.judgment, "대체로 달성");
  assert.equal(f2(ro.item.score100), "80.00"); assert.equal(ro.r.judgment, "달성", "표시 평균 4.20 → 80.00점이므로 목표 80점 달성으로 판정");
});

test("사전·사후 환산(score100Pre/Post)도 기준을 따르고 변화량(diff100)은 원자료 기준 유지", () => {
  const pre = [3, 3, 4, 3, 4, 3, 3, 4, 3, 3], post = [4, 4, 5, 4, 4, 4, 5, 4, 4, 4];
  const a = pairedComparison(pre, post, { min: 1, max: 5 }), b = pairedComparison(pre, post, { min: 1, max: 5 }, { scoreBasis: "rounded" });
  assert.equal(b.score100Post, score100(b.mPost, 1, 5, "rounded"));
  assert.equal(a.score100Post, score100(a.mPost, 1, 5));
  assert.equal(b.diff100, a.diff100);
  assert.equal(b.diff, a.diff);
});

test("발표 자료: 기준에 관계없이 슬라이드 구성은 같고 근거 문구에 기준이 표기됨", () => {
  const ds = makeDs();
  const mk = basis => { const { cb, an } = analyze(ds, basis); return buildDeck({ analysis: an, evaluation: null, logicModel: emptyLogicModel(), codebook: cb, settings: {} }); };
  const a = mk("exact"), b = mk("rounded");
  assert.deepEqual(a.map(s => s.id), b.map(s => s.id));
  assert.ok(JSON.stringify(b).includes("표시된 소수 둘째 자리 평균 기준"));
  assert.ok(JSON.stringify(a).includes("반올림 전 평균 기준"));
});

test("선택 화면: 데이터 설정·로컬 설정에 두 방식과 차이 설명, 실제 데이터 예시, 현재 선택이 표시됨", async () => {
  const file = "2026_문화의집_만족도_구글폼.csv";
  loadDataset(parseFile(new Uint8Array(await readFile(`samples/${file}`)), file, { XLSX, Papa }));
  for (const basis of ["exact", "rounded"]) {
    state.settings.scoreBasis = basis; invalidate(); compute();
    for (const [name, html] of [["setup", setup.render()], ["settings", settingsView.render()]]) {
      assert.ok(html.includes("반올림 전 평균으로 환산") && html.includes("반올림 후 평균으로 환산"), `${name}: 두 선택지 문구`);
      assert.ok(html.includes("최대 ±0.125점"), `${name}: 오차 크기 설명`);
      assert.equal((html.match(/badge info">기본</g) || []).length, 1, `${name}: '기본' 태그는 한 번만`);
      assert.ok(html.includes('badge info">조정<'), `${name}: 반올림 후 선택지의 '조정' 태그`);
      assert.ok(!html.includes("(기본)"), `${name}: 태그와 중복되는 '(기본)' 문구 없음`);
      assert.ok(html.includes("높아질 수도(올림), 낮아질 수도(내림)"), `${name}: 방향이 다를 수 있다는 설명`);
      assert.ok(html.includes("· 올림") && html.includes("· 내림") && html.includes("예 1.") && html.includes("예 2."), `${name}: 올림·내림 예시 두 개(산식 그림)`);
      assert.ok(html.includes("basis-formula") && html.includes("반올림 후(조정)"), `${name}: 반올림 전·후 산식이 그림으로 보임`);
      assert.ok(/이 파일에서는 척도 문항 \d+개 중 <b>\d+개<\/b>의 환산 점수/.test(html), `${name}: 이 파일에서의 영향 수`);
      assert.ok(html.includes("로컬 설정"), `${name}: 나중에 바꿀 수 있다는 안내`);
      const checked = html.match(/value="(exact|rounded)" checked/g);
      assert.deepEqual(checked, [`value="${basis}" checked`], `${name}: 현재 선택(${basis}) 하나만 선택됨`);
      assert.ok(!/undefined|NaN(?!\w)/.test(html.replace(/data-[a-z-]+="[^"]*"/g, "")), `${name}: 값 누락 없음`);
    }
  }
  state.settings.scoreBasis = "exact"; invalidate();
});

test("집단 비교 결과 재사용: 기준만 바꾸면 환산 점수만 달라지고 나머지는 새로 계산한 것과 같음, 자료가 바뀌면 다시 계산", () => {
  const strip = cross => cross.map(d => ({ ...d, rows: d.rows.map(r => ({ ...r, stats: r.stats.map(({ score100, ...s }) => s) })) }));
  const ds = makeDs();
  resetCrossCache();
  const a = analyze(ds, "exact").an;
  const b = analyze(ds, "rounded").an; // 재사용
  resetCrossCache();
  const c = analyze(ds, "rounded").an; // 처음부터 계산
  assert.ok(a.cross.length > 0);
  assert.deepEqual(b.cross, c.cross, "재사용한 결과 = 새로 계산한 결과");
  assert.deepEqual(strip(a.cross), strip(b.cross), "환산 점수 외 값(검정·평균 등)은 기준과 무관");
  assert.ok(a.cross.some((d, i) => d.rows.some((r, j) => r.stats.some((s, k) => s.score100 !== b.cross[i].rows[j].stats[k].score100))), "환산 점수는 기준에 따라 달라짐");
  b.cross[0].rows[0].stats[0].mean = -999; // 받은 쪽에서 고쳐도 저장된 결과가 오염되지 않아야 함
  assert.notEqual(analyze(ds, "rounded").an.cross[0].rows[0].stats[0].mean, -999);
  const ds2 = makeDs(); ds2.sheets[0].rows[0][2] = ds2.sheets[0].rows[0][2] === 1 ? 5 : 1;
  const d = analyze(ds2, "exact").an;
  resetCrossCache();
  assert.deepEqual(d.cross, analyze(ds2, "exact").an.cross, "자료가 바뀌면 캐시를 쓰지 않고 새로 계산");
});
