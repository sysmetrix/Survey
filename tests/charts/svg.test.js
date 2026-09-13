import test from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "@xmldom/xmldom";
import * as C from "../../js/charts/svg.js";

const wellFormed = svg => {
  let err = null;
  new DOMParser({ onError: (l, m) => { if (l !== "warning") err = m; } }).parseFromString(svg, "image/svg+xml");
  assert.equal(err, null, String(err));
};

test("SVG 차트들이 올바른 XML을 생성", () => {
  const charts = [
    C.hbar([{ label: "강사 전문성 <R&D>", value: 88.2 }, { label: "아주 긴 문항 이름이 들어가서 두 줄로 줄바꿈 되어야 하는 경우", value: 61 }], { max: 100, refValue: 75, refLabel: "평균", unit: "점" }),
    C.likertDiverging([{ label: "내용", pct: [5, 10, 20, 40, 25], n: 80 }], ["전혀 아니다", "아니다", "보통", "그렇다", "매우 그렇다"]),
    C.dumbbell([{ label: "자기효능감", pre: 3.1, post: 3.9, sig: true }, { label: "관계", pre: 3.5, post: 3.4 }]),
    C.kpiBullet([{ label: "참여인원", rate: 115 }, { label: "역량", rate: 83.3 }, { label: "측정불가", rate: NaN }]),
    C.ipaScatter([{ label: "a", importance: 0.5, performance: 80 }, { label: "b", importance: 0.7, performance: 60 }, { label: "c", importance: 0.3, performance: 70 }], { meanI: 0.5, meanP: 70 }),
    C.npsBar({ detractors: 20, passives: 30, promoters: 50, nps: 30, n: 100 }),
    C.groupedHbar(["내용", "강사"], [{ name: "남", values: [80, 70] }, { name: "여", values: [85, NaN] }]),
  ];
  charts.forEach(c => { wellFormed(c.svg); assert.ok(c.width > 0 && c.height > 0); });
  assert.ok(C.wrap("아주 긴 문항 이름이 들어가서 두 줄로 줄바꿈 되어야 하는 경우", 120, 13).length <= 2);
});

test("다크 테마·툴팁·데이터 끝 둥근 막대", async () => {
  const { THEMES, contrast } = await import("../../js/charts/theme.js");
  const d = C.hbar([{ label: "<문항> & 'x'", value: 70 }], { max: 100, theme: "dark" });
  wellFormed(d.svg);
  assert.ok(d.svg.includes(THEMES.dark.surface) && d.svg.includes("data-tip=") && /<path class="m" d="M/.test(d.svg));
  assert.ok(!d.svg.includes("<문항>"), "라벨 이스케이프");
  for (const T of Object.values(THEMES)) {
    assert.ok(contrast(T.ink, T.surface) >= 4.5 && contrast(T.sub, T.surface) >= 4.5 && contrast(T.muted, T.surface) >= 3, `${T.name} 텍스트 대비`);
  }
});
