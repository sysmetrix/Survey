// 자동 생성 슬라이드 → 자유배치 요소 배열(첫 전환 시 초깃값). css/present.css 의 그리드 비율(예: hero
// 33%/67% 분할, .slide 안쪽 여백 4.2%/5.2%)을 그대로 옮겨 적어 두었으므로, 그 CSS 값이 바뀌면 여기도
// 함께 손봐야 함(tests/present/detach.test.js 가 대표 값을 고정해 드리프트를 잡아냄).
// 좌표는 모두 슬라이드 폭/높이에 대한 백분율(0~100) — 화면·인쇄·내보내기·PPTX가 같은 숫자를 그대로 씀.

let seq = 0;
const newId = () => `el${Date.now().toString(36)}${(seq++).toString(36)}`;

const PAD_X = 5.2, PAD_Y = 4.2; // .slide { padding: 4.2% 5.2% 0 } (present.css)
const FULL_W = 100 - PAD_X * 2;

const textEl = ({ x, y, w, h, markup, fontSize = 2.2, align = "left", weight = null, color = null }) =>
  ({ id: newId(), kind: "text", x, y, w, h, rot: 0, z: 1, markup: markup || "", fontSize, align, weight, color });
const chartEl = ({ x, y, w, h, chart }) => ({ id: newId(), kind: "chart", x, y, w, h, rot: 0, z: 1, chart });

function head(s, top = PAD_Y) {
  const out = [textEl({ x: PAD_X, y: top, w: FULL_W, h: 9, markup: s.title, fontSize: 2.7, weight: "bold" })];
  if (s.subtitle) out.push(textEl({ x: PAD_X, y: top + 10, w: FULL_W, h: 5, markup: s.subtitle, fontSize: 1.4, color: "#6f6d68" }));
  return out;
}

/** @param {ReturnType<typeof import("../deck.js").buildDeck>[number]} s */
export function elementsFromAutoSlide(s) {
  switch (s.type) {
    case "cover": {
      const out = [
        textEl({ x: PAD_X, y: 30, w: 70, h: 14, markup: s.title, fontSize: 4, weight: "bold" }),
      ];
      if (s.subtitle) out.push(textEl({ x: PAD_X, y: 46, w: 70, h: 6, markup: s.subtitle, fontSize: 1.6, color: "#6f6d68" }));
      if (s.chips?.length) out.push(textEl({ x: PAD_X, y: 54, w: 80, h: 6, markup: s.chips.join("   ·   "), fontSize: 1.3, color: "#6f6d68" }));
      return out;
    }
    case "stats": {
      const n = s.stats.length || 1;
      const gap = 1.8, colW = (FULL_W - gap * (n - 1)) / n;
      const out = head(s);
      s.stats.forEach((st, i) => {
        const x = PAD_X + i * (colW + gap);
        out.push(textEl({ x, y: 22, w: colW, h: 5, markup: st.label, fontSize: 1.1, color: "#6f6d68" }));
        out.push(textEl({ x, y: 28, w: colW, h: 10, markup: `${st.value}${st.unit || ""}`, fontSize: 2.6, weight: "bold" }));
        if (st.sub) out.push(textEl({ x, y: 40, w: colW, h: 8, markup: st.sub, fontSize: 1.05, color: "#6f6d68" }));
      });
      return out;
    }
    case "hero": {
      const leftW = FULL_W * 0.33 - 1.3, rightX = PAD_X + FULL_W * 0.33 + 1.3, rightW = FULL_W * 0.67 - 1.3;
      const out = head(s);
      out.push(textEl({ x: PAD_X, y: 26, w: leftW, h: 12, markup: `${s.hero.value}${s.hero.unit || ""}`, fontSize: 3.6, weight: "bold" }));
      out.push(textEl({ x: PAD_X, y: 40, w: leftW, h: 10, markup: s.hero.caption, fontSize: 1.4 }));
      if (s.hero.facts?.length) out.push(textEl({ x: PAD_X, y: 52, w: leftW, h: 30, markup: s.hero.facts.join("\n"), fontSize: 1.2, color: "#6f6d68" }));
      if (s.chart) out.push(chartEl({ x: rightX, y: 22, w: rightW, h: 62, chart: s.chart }));
      return out;
    }
    case "voice": {
      const hasChart = !!s.chart;
      const leftW = hasChart ? FULL_W * 0.4 - 1.3 : 0, rightX = hasChart ? PAD_X + FULL_W * 0.4 + 1.3 : PAD_X, rightW = hasChart ? FULL_W * 0.6 - 1.3 : FULL_W;
      const out = head(s);
      if (hasChart) out.push(chartEl({ x: PAD_X, y: 22, w: leftW, h: 62, chart: s.chart }));
      const good = (s.quotes?.positive || []).map(q => (typeof q === "string" ? q : q?.text ?? "")).join("\n");
      const bad = (s.quotes?.improve || []).map(q => (typeof q === "string" ? q : q?.text ?? "")).join("\n");
      let y = 22;
      if (good) { out.push(textEl({ x: rightX, y, w: rightW, h: 30, markup: `좋았던 점\n${good}`, fontSize: 1.2 })); y += 32; }
      if (bad) out.push(textEl({ x: rightX, y, w: rightW, h: 30, markup: `개선이 필요한 점\n${bad}`, fontSize: 1.2 }));
      return out;
    }
    case "columns": {
      const n = s.columns.length || 1;
      const gap = 1.8, colW = (FULL_W - gap * (n - 1)) / n;
      const out = head(s);
      s.columns.forEach((c, i) => {
        const x = PAD_X + i * (colW + gap);
        out.push(textEl({ x, y: 30, w: colW, h: 6, markup: c.title, fontSize: 1.5, weight: "bold" }));
        out.push(textEl({ x, y: 38, w: colW, h: 40, markup: (c.items?.length ? c.items : ["해당 없음"]).map(v => `· ${v}`).join("\n"), fontSize: 1.15 }));
      });
      return out;
    }
    case "end": {
      const out = [textEl({ x: PAD_X, y: 42, w: FULL_W, h: 14, markup: s.title, fontSize: 5.2, weight: "bold", align: "center" })];
      if (s.subtitle) out.push(textEl({ x: PAD_X, y: 58, w: FULL_W, h: 6, markup: s.subtitle, fontSize: 1.6, align: "center", color: "#6f6d68" }));
      return out;
    }
    default: { // 차트 + 곁다리(아side)
      const hasAside = !!s.aside;
      const chartW = hasAside ? FULL_W * 0.73 - 1.3 : FULL_W;
      const out = head(s);
      if (s.chart) out.push(chartEl({ x: PAD_X, y: 22, w: chartW, h: 66, chart: s.chart }));
      if (hasAside) {
        const asideX = PAD_X + chartW + 1.8, asideW = FULL_W * 0.27 - 0.5;
        out.push(textEl({ x: asideX, y: 22, w: asideW, h: 6, markup: s.aside.title, fontSize: 1.3, weight: "bold" }));
        out.push(textEl({ x: asideX, y: 29, w: asideW, h: 55, markup: (s.aside.items || []).map(v => `· ${v}`).join("\n"), fontSize: 1.1 }));
      }
      return out;
    }
  }
}
