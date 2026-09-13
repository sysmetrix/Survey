import test from "node:test";
import assert from "node:assert/strict";
import { buildCodebook } from "../../js/model/codebook.js";
import { buildSurvey } from "../../js/model/survey.js";
import { analyzeSurvey } from "../../js/analysis/run.js";
import { classify, tokenize } from "../../js/analysis/text.js";
import { seededRandom } from "../../js/core/util.js";

function makeData(n = 80, seed = 7) {
  const rnd = seededRandom(seed);
  const clamp = v => Math.max(1, Math.min(5, Math.round(v)));
  const headers = ["번호", "성별", "학교급", "사전_자기효능감1", "사전_자기효능감2", "사후_자기효능감1", "사후_자기효능감2", "프로그램 내용", "강사 전문성", "시설 환경", "전반적 만족도", "친구에게 추천할 의향", "좋았던 점"];
  const rows = [];
  for (let i = 0; i < n; i++) {
    const g = rnd() < 0.5 ? "남" : "여", s = rnd() < 0.5 ? "중학생" : "고등학생";
    const base = 3 + rnd();
    const pre1 = clamp(base - 0.5 + rnd()), pre2 = clamp(base - 0.4 + rnd());
    const c = clamp(base + 0.6 + rnd() * 0.8), t = clamp(base + 0.9 + rnd() * 0.6), f = clamp(base - 0.3 + rnd());
    rows.push([i + 1, g, s, pre1, pre2, clamp(pre1 + 0.6 + rnd()), clamp(pre2 + 0.5 + rnd()), c, t, i === 3 ? "" : f, clamp((c + t + f) / 3 + rnd() - 0.5), Math.min(10, Math.round(base * 2 + rnd() * 3)), i % 3 ? "강사님이 친절하고 체험 활동이 재미있었어요" : "시간이 짧아서 아쉬웠고 더 길게 했으면 좋겠어요"]);
  }
  return { fileName: "demo.xlsx", source: "file", sheets: [{ name: "응답", headers, rows }] };
}

test("분석 총괄: 문항·영역·교차·사전사후·NPS·주관식·IPA", () => {
  const ds = makeData();
  const cb = buildCodebook(ds);
  assert.equal(cb.design, "prepost-wide");
  const sv = buildSurvey(ds, cb);
  const res = analyzeSurvey(sv);
  assert.equal(res.meta.n, 80);
  const fac = res.items.find(i => i.label === "시설 환경");
  assert.equal(fac.n, 79); // 빈칸 제외
  res.items.forEach(it => { assert.equal(it.min, 1, `${it.label} 척도 최소`); assert.equal(it.max, 5); assert.equal(it.freq.pct.length, 5); });
  assert.ok(fac.score100 >= 0 && fac.score100 <= 100);
  assert.ok(Math.abs(fac.freq.pct.reduce((s, v) => s + v, 0) - 100) < 1e-9);
  assert.equal(res.overallItem.label, "전반적 만족도");
  assert.equal(res.nps.length, 1); assert.ok(res.nps[0].nps >= -100 && res.nps[0].nps <= 100);
  assert.equal(res.cross.length, 2);
  assert.ok(res.cross[0].rows[0].test && Number.isFinite(res.cross[0].rows[0].test.p));
  assert.equal(res.prepost.items.length, 2);
  const pp = res.prepost.items[0];
  assert.ok(pp.diff > 0 && pp.primary.p < 0.05, "설계상 사후 향상");
  assert.equal(pp.rule, "n≥30");
  assert.ok(res.prepost.domains.some(d => d.id === "ALL"));
  assert.equal(res.text.length, 1);
  assert.ok(res.text[0].types.positive > 0 && res.text[0].types.suggestion > 0);
  assert.deepEqual(res.items.map(i => i.label), ["프로그램 내용", "강사 전문성", "시설 환경", "전반적 만족도"], "사전·사후 짝 문항은 만족도 문항에서 제외");
  assert.equal(res.ipa.points.length, 3);
});

test("주관식 분류와 토큰화", () => {
  assert.equal(classify("정말 재미있고 유익했어요"), "positive");
  assert.equal(classify("시설이 좁고 불편했습니다"), "negative");
  assert.equal(classify("간식을 더 많이 주셨으면 좋겠어요"), "suggestion");
  assert.equal(classify("별로 안 좋았어요"), "negative");
  assert.equal(classify("없음"), "none");
  assert.ok(tokenize("강사님이 친절하셨습니다").includes("강사님"));
});
