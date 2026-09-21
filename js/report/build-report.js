// 분석 결과 → 보고서 블록 (규칙 기반 개조식 서술)
import { levelWord, f1, f2, f2b, signed, pText, statParen, statNum, sigPhrase, sigStar, DEFAULT_THRESHOLDS } from "../narrative/vocab.js";
import { josa } from "../narrative/josa.js";
import { DESIGN_LABELS } from "../model/codebook.js";
import { hasLogicModel, hasProgramInfo, LOGIC_STAGES } from "../evaluation/logic-model.js";
import { METRICS } from "../evaluation/kpi.js";
import { alphaLabel } from "../stats/effectsize.js";
import { koDate } from "../core/util.js";

const DEFAULT_LEVEL_LABELS = {
  4: ["전혀 그렇지 않다", "그렇지 않다", "그렇다", "매우 그렇다"],
  5: ["전혀 그렇지 않다", "그렇지 않다", "보통", "그렇다", "매우 그렇다"],
  7: ["전혀 아니다", "아니다", "약간 아니다", "보통", "약간 그렇다", "그렇다", "매우 그렇다"],
};
const q = s => `‘${s}’`;
const H = (level, text, extra = {}) => ({ type: "heading", level, text, ...extra });
const cellH = text => ({ text, shade: "header", bold: true });
/** alphaLabel(짧은 판정어) → 문장 속 서술어에 붙는 형태("다소 낮음" → "다소 낮은 수준") */
const ALPHA_LEVEL_PHRASE = { "매우 우수": "매우 우수한 수준", "양호": "양호한 수준", "수용 가능": "수용 가능한 수준", "다소 낮음": "다소 낮은 수준", "낮음": "낮은 수준" };

/** 척도 수준 라벨 (코드북 라벨 → 기본 라벨 → n점) */
export function levelLabels(col, min, max) {
  const k = max - min + 1;
  if (col?.labelMap) {
    const inv = {};
    Object.entries(col.labelMap).forEach(([raw, v]) => { if (!inv[v] || raw.length < inv[v].length) inv[v] = raw.replace(/^\s*\d+[.)]\s*/, ""); });
    const arr = Array.from({ length: k }, (_, i) => inv[min + i]);
    if (arr.every(Boolean)) return arr;
  }
  return DEFAULT_LEVEL_LABELS[k] || Array.from({ length: k }, (_, i) => `${min + i}점`);
}

function fmtKpi(v, metric, unit) {
  if (!Number.isFinite(v)) return "-";
  if (["mean", "prepostDiff", "effectSize", "score100", "postScore100", "prepostDiff100"].includes(metric)) return f2(v);
  if (Number.isInteger(v)) return v.toLocaleString("ko-KR");
  return f1(v);
}
const PCT_LIKE = new Set(["score100", "top2", "postScore100", "improvedRate", "prepostDiff100"]);

export function buildReport({ analysis: A, evaluation: E = null, lint = [], logicModel: LM = null, codebook: CB, settings: S = {} }) {
  const t = { ...DEFAULT_THRESHOLDS, ...(S.thresholds || {}) };
  const blocks = [];
  const push = b => blocks.push(b);
  const bullets = items => { const its = items.filter(Boolean); if (its.length) push({ type: "bullets", items: its }); };
  const B = (key, level, text, frag) => ({ key, level, text, frag });
  const colOf = key => CB.columns.find(c => c.key === key);
  const P = A.prepost, ALLP = P?.domains.find(d => d.id === "ALL") || (P?.items.length === 1 ? P.items[0] : null);
  const overall = A.overallItem, tot = A.total;
  const detailItems = A.items.filter(it => !it.isOverall).sort((a, b) => b.score100 - a.score100);
  const kpiOn = E && E.results?.length;

  // ───── 표지·요약 ─────
  const title = S.reportTitle || (LM?.programName ? `${LM.programName} 결과 분석 보고서` : "설문조사 결과 분석 보고서");
  push({ type: "title", text: title, subtitle: [S.orgName, S.author, S.date || koDate()].filter(Boolean).join(" · ") });
  const sum = [];
  sum.push(B("sum.survey", 1, `□ 조사 개요: ${DESIGN_LABELS[A.meta.design]}, 응답자 ${A.meta.n}명${P && !P.unpaired && A.meta.design === "prepost-sheets" ? `(사전·사후 매칭 ${P.matchedN}명)` : ""}`, true));
  if (kpiOn) {
    const s = E.summary;
    sum.push(B("sum.kpi", 1, `□ 성과지표: ${s.measured}개 중 **${s.achieved}개 달성**${s.mostly ? `, ${s.mostly}개 대체로 달성` : ""}${s.notAchieved ? `, ${s.notAchieved}개 미달성` : ""} (종합 **${s.grade}**)`, true));
  }
  if (ALLP) sum.push(B("sum.prepost", 1, `□ 성과 변화: 사전 ${f2(ALLP.mPre)}점 → 사후 ${f2(ALLP.mPost)}점(**${signed(ALLP.diff)}점**), ${sigPhrase(ALLP.primary.p)}`));
  if (overall) sum.push(B("sum.overall", 1, `□ 만족도: ${overall.label} 평균 ${f2(overall.mean)}점(100점 환산 **${f2(overall.score100)}점**)으로 ${levelWord(overall.score100, t)}임`));
  else if (tot && Number.isFinite(tot.score100)) sum.push(B("sum.total", 1, `□ 만족도: 척도 문항 전체 평균 100점 환산 **${f2(tot.score100)}점**으로 ${levelWord(tot.score100, t)}임`));
  if (A.nps.length) sum.push(B("sum.nps", 1, `□ 순추천지수(NPS): ${signed(A.nps[0].nps, 1)}점`, true));
  if (detailItems.length >= 2) sum.push(B("sum.items", 1, `□ 최고 문항 ${q(detailItems[0].label)}(${f2(detailItems[0].score100)}점), 최저 문항 ${q(detailItems.at(-1).label)}(${f2(detailItems.at(-1).score100)}점)`, true));
  const impTheme = A.text.flatMap(tx => tx.themes.filter(th => th.negative >= 2)).sort((a, b) => b.negative - a.negative)[0]?.name;
  if (impTheme) sum.push(B("sum.text", 1, `□ 주요 개선 요구: ${q(impTheme)} 관련 의견`, true));
  push({ type: "box", lines: sum.map(s => ({ key: s.key, text: s.text, frag: s.frag })) });

  // ───── Ⅰ. 사업 개요 ─────
  if (hasProgramInfo(LM) || hasLogicModel(LM)) {
    push(H(1, "사업 개요"));
    const info = [
      LM.programName && B("p.name", 1, `사업명: ${LM.programName}`, true),
      LM.period && B("p.period", 1, `사업기간: ${LM.period}`, true),
      LM.target && B("p.target", 1, `참여대상: ${LM.target}`, true),
      LM.budget && B("p.budget", 1, `사업예산: ${LM.budget}`, true),
      LM.department && B("p.dept", 1, `추진부서: ${LM.department}`, true),
      LM.background && B("p.bg", 1, `추진배경: ${LM.background}`, true),
      LM.purpose && B("p.purpose", 1, `사업목적: ${LM.purpose}`, true),
    ];
    if (LM.goals?.length) {
      info.push(B("p.goals", 1, "추진목표", true));
      LM.goals.forEach((g, i) => info.push(B(`p.goal.${g.id}`, 2, `목표${i + 1}: ${g.text}`, true)));
    }
    bullets(info);
    if (hasLogicModel(LM)) {
      push(H(2, "사업 논리모형"));
      const stages = LOGIC_STAGES.filter(s => LM[s.key]?.length);
      push({
        type: "table", caption: "사업 논리모형", compact: stages.length > 5,
        columns: stages.map(() => ({ weight: 1, align: "LEFT" })),
        rows: [stages.map(s => cellH(s.label)), stages.map(s => ({ text: LM[s.key].map(v => `· ${v}`).join("\n"), align: "LEFT" }))],
        notes: ["주: 투입→활동→산출→성과(단기·중기)→영향으로 이어지는 사업 논리 구조"],
      });
    }
  }

  // ───── Ⅱ. 조사 개요 ─────
  push(H(1, "조사 개요"));
  const scaleCols = A.items.map(it => colOf(it.key)).filter(Boolean);
  const scaleRange = scaleCols[0]?.scale || P?.items[0]?.scale;
  const parts = [
    A.items.length && `척도 문항 ${A.items.length}개`, P && `사전·사후 문항 ${P.items.length}쌍`,
    A.nps.length && `추천의향 ${A.nps.length}개`, A.multi.length && `복수응답 ${A.multi.length}개`, A.text.length && `주관식 ${A.text.length}개`,
  ].filter(Boolean);
  const ov = [
    B("s.design", 1, `조사 설계: ${DESIGN_LABELS[A.meta.design]}`, true),
    B("s.n", 1, `응답자: ${A.meta.n}명${S.excludedCount ? `(불성실 응답 ${S.excludedCount}명 제외 후)` : ""}`, true),
  ];
  if (P?.matching) ov.push(B("s.match", 2, `사전·사후 매칭 ${P.matching.pairs}명(사전만 응답 ${P.matching.preOnly}명, 사후만 응답 ${P.matching.postOnly}명) — 매칭 기준: ${P.matching.keyDesc}`, true));
  ov.push(B("s.items", 1, `조사 내용: ${parts.join(", ")}`, true));
  if (scaleRange) ov.push(B("s.scale", 1, `척도: ${scaleRange.min}~${scaleRange.max}점(점수가 높을수록 긍정)`, true), B("s.score100", 2, `100점 환산 점수 = (평균 − 최소점) ÷ (최대점 − 최소점) × 100${A.meta.scoreBasis === "rounded" ? "(표에 적힌 소수 둘째 자리 평균으로 계산)" : "(반올림 전 평균으로 계산)"}, 긍정응답률 = 상위 2개 척도 응답 비율`, true));
  if (A.reliability && Number.isFinite(A.reliability.alpha)) {
    const { alpha } = A.reliability;
    const [aLo, aHi] = A.reliability.alphaCi || [];
    const hasCi = Number.isFinite(aLo) && Number.isFinite(aHi);
    const phrase = ALPHA_LEVEL_PHRASE[alphaLabel(alpha)] || alphaLabel(alpha);
    const evidence = `Cronbach α=${f2b(alpha)}${hasCi ? `, 95% 신뢰구간 [${f2b(aLo)}, ${f2b(aHi)}]` : ""}`;
    // 신뢰구간 폭이 넓으면(문항 수·표본이 적어 추정이 불안정하면) 그 사실도 함께 판단해 줌
    const unstable = hasCi && (aHi - aLo) > 0.5;
    ov.push(B("s.alpha", 1, unstable
      ? `신뢰도는 ${phrase}이며(${evidence}), 신뢰도 추정의 안정성도 낮았음`
      : `신뢰도는 ${phrase}임(${evidence})`));
  }
  if (A.meta.straightLiners && !S.excludedCount) ov.push(B("s.clean", 1, `자료 점검: 모든 척도 문항에 같은 값으로 응답한 사례 ${A.meta.straightLiners}명 확인(분석에 포함)`, true));
  ov.push(B("s.method", 1, "분석 방법: 기술통계, 집단 간 차이 검정(Welch t검정·분산분석), 사전·사후 차이 검정(대응표본 t검정 또는 Wilcoxon 부호순위 검정), 유의수준 .05(다층모형·요인분석 등 고급 분석은 별도 통계 패키지 사용을 권장)", true));
  bullets(ov);

  if (A.respondents.length) {
    push(H(2, "응답자 특성"));
    const rows = [[cellH("구분"), cellH("항목"), cellH("응답자 수"), cellH("비율")]];
    const narr = [];
    A.respondents.forEach(r => {
      const levels = r.levels.slice(0, 12);
      const list = [...levels.map(l => [l.value, l.n, l.pct])];
      if (r.missing) list.push(["무응답", r.missing, r.missing / r.n * 100]);
      list.forEach((l, i) => {
        const row = [];
        if (i === 0) row.push({ text: r.label, rowSpan: list.length, bold: true });
        row.push(String(l[0]), l[1].toLocaleString("ko-KR"), f1(l[2]));
        rows.push(row);
      });
      const top = [...r.levels].sort((a, b) => b.n - a.n)[0];
      if (top) narr.push(B(`resp.${r.key}`, 1, `${josa(r.label, "은")} ${josa(q(top.value), "이")} ${f1(top.pct)}%(${top.n}명)로 가장 많음`));
    });
    rows.push([{ text: "전체", colSpan: 2, shade: "total", bold: true }, { text: A.meta.n.toLocaleString("ko-KR"), shade: "total", bold: true }, { text: "100.0", shade: "total", bold: true }]);
    push({ type: "table", caption: "응답자 일반 특성", unit: "(단위: 명, %)", columns: [{ weight: 1.4 }, { weight: 2 }, { weight: 1 }, { weight: 1 }], rows });
    bullets(narr);
  }

  // ───── Ⅲ. 성과지표 달성 현황 ─────
  if (kpiOn) {
    push(H(1, "성과지표 달성 현황"));
    const s = E.summary;
    const top = [B("kpi.summary", 1, `성과지표 ${s.total}개 중 **${s.achieved}개 달성**${s.mostly ? `, ${s.mostly}개 대체로 달성` : ""}${s.notAchieved ? `, ${s.notAchieved}개 미달성` : ""}${s.unmeasured ? `, ${s.unmeasured}개 측정 불가` : ""}으로 종합 평가는 **${s.grade}**임`)];
    s.byStage.forEach(st => top.push(B(`kpi.stage.${st.stage}`, 2, `${st.stage} 지표 ${st.total}개 중 ${st.achieved}개 달성`)));
    bullets(top);
    const rows = [["성과지표", "단계", "측정 방법", "목표", "실적", "달성률(%)", "판정"].map(cellH)];
    E.results.forEach(r => {
      const m = METRICS[r.metric] || METRICS.manual;
      const shade = r.judgment === "달성" ? "good" : r.judgment === "대체로 달성" ? "mid" : r.judgment === "미달성" ? "bad" : null;
      rows.push([
        { text: r.name, align: "LEFT" }, r.stage, { text: m.label + (r.targetRef && m.kind !== "manual" ? `\n(${r.targetRef})` : ""), align: "LEFT" },
        `${fmtKpi(r.targetValue, r.metric, r.unit)}${r.unit || ""}`, `${fmtKpi(r.actualValue, r.metric, r.unit)}${Number.isFinite(r.actualValue) ? r.unit || "" : ""}`,
        f1(r.rate), { text: r.judgment, shade, bold: true },
      ]);
    });
    push({
      type: "table", caption: "성과지표 달성 현황", columns: [{ weight: 2.6, align: "LEFT" }, { weight: 1.1 }, { weight: 2.3, align: "LEFT" }, { weight: 1 }, { weight: 1 }, { weight: 1 }, { weight: 1.1 }], rows,
      notes: [
        `주: 달성률 = 실적 ÷ 목표 × 100(하향 지표는 {1 − (실적 − 목표) ÷ |목표|} × 100). 판정: ${t.kpiAchieved}% 이상 달성, ${t.kpiMostly}~${t.kpiAchieved - 1}% 대체로 달성, ${t.kpiMostly}% 미만 미달성`,
        `종합 평가: (달성 지표 수 + 대체로 달성 지표 수 × 0.5) ÷ 측정 지표 수가 ${t.overallGood}% 이상 우수, ${t.overallFair}% 이상 보통, 그 미만 미흡`,
      ],
    });
    const measured = E.results.filter(r => Number.isFinite(r.rate));
    if (measured.length) push({ type: "figure", caption: "성과지표 달성률", chart: { kind: "kpiBullet", data: measured.map(r => ({ label: r.name, rate: r.rate })), opts: { mostly: t.kpiMostly } } });
    const det = [B("kpi.detail", 1, "지표별 결과", true)];
    E.results.forEach(r => {
      const tv = `${fmtKpi(r.targetValue, r.metric, r.unit)}${r.unit || ""}`, av = `${fmtKpi(r.actualValue, r.metric, r.unit)}${r.unit || ""}`;
      if (r.error && !Number.isFinite(r.rate)) det.push(B(`kpi.${r.id}`, 2, `${q(r.name)}: 측정 불가(${r.error})`));
      else if (r.judgment === "달성") det.push(B(`kpi.${r.id}`, 2, `${q(r.name)}: 목표 ${tv} 대비 실적 ${josa(av, "으로")} **${f1(r.rate)}% 달성**`));
      else det.push(B(`kpi.${r.id}`, 2, `${q(r.name)}: 목표 ${tv} 대비 실적 ${josa(av, "으로")} 달성률 ${f1(r.rate)}%(${r.judgment})`));
      if (r.facts && r.metric !== "manual") det.push(B(`kpi.${r.id}.facts`, 3, `산출 근거: ${r.facts}`));
    });
    bullets(det);
  }

  // ───── Ⅳ. 사전·사후 성과 변화 ─────
  if (P && P.items.length) {
    push(H(1, "사전·사후 성과 변화"));
    const pb = [];
    if (ALLP) {
      pb.push(B("pp.all", 1, `사업 참여 전후 성과 문항 평균이 ${f2(ALLP.mPre)}점에서 ${f2(ALLP.mPost)}점으로 **${signed(ALLP.diff)}점** 변화하였으며, ${sigPhrase(ALLP.primary.p)} ${statParen(ALLP.primary)}`));
      pb.push(B("pp.all.100", 2, `100점 환산 ${f2(ALLP.score100Pre)}점 → ${f2(ALLP.score100Post)}점(사전 대비 ${signed(ALLP.changePct, 1)}%)`));
      if (Number.isFinite(ALLP.improvedPct)) pb.push(B("pp.all.improved", 2, `참여자의 ${f1(ALLP.improvedPct)}%(${ALLP.improved}명)가 사전보다 점수가 향상됨`));
      if (Number.isFinite(ALLP.primary.effect)) pb.push(B("pp.all.effect", 2, `효과크기 ${ALLP.primary.effectName} = ${f2(ALLP.primary.effect)}(${ALLP.primary.effectLabel})`));
    }
    P.domains.filter(d => d.id !== "ALL").forEach(d => pb.push(B(`pp.dom.${d.id}`, 1, `${q(d.name)} 영역: ${f2(d.mPre)}점 → ${f2(d.mPost)}점(${signed(d.diff)}점), ${sigPhrase(d.primary.p)}${sigStar(d.primary.p)}`)));
    const sigUp = P.items.filter(i => i.primary.p < 0.05 && i.diff > 0), nonSig = P.items.filter(i => !(i.primary.p < 0.05));
    const sigDown = P.items.filter(i => i.primary.p < 0.05 && i.diff < 0);
    if (sigUp.length) pb.push(B("pp.sigup", 1, `유의한 향상을 보인 문항(${sigUp.length}개): ${sigUp.map(i => `${q(i.label)}(${signed(i.diff)}점)`).join(", ")}`));
    if (nonSig.length) pb.push(B("pp.nonsig", 1, `유의한 변화가 확인되지 않은 문항(${nonSig.length}개): ${nonSig.map(i => q(i.label)).join(", ")}`));
    if (sigDown.length) pb.push(B("pp.sigdown", 1, `유의하게 감소한 문항: ${sigDown.map(i => `${q(i.label)}(${signed(i.diff)}점)`).join(", ")} — 원인 점검 필요`));
    bullets(pb);
    const rows = [["구분", "n", "사전 M(SD)", "사후 M(SD)", "변화량", "검정", "p", "효과크기"].map(cellH)];
    const row = (r, isDom) => [
      { text: isDom ? `[${r.name}]` : r.label, align: "LEFT", bold: isDom, shade: isDom ? "sub" : null },
      { text: String(r.unpaired ? `${r.nPre}/${r.nPost}` : r.n), shade: isDom ? "sub" : null },
      { text: `${f2(r.mPre)}(${f2(r.sdPre)})`, shade: isDom ? "sub" : null }, { text: `${f2(r.mPost)}(${f2(r.sdPost)})`, shade: isDom ? "sub" : null },
      { text: signed(r.diff), bold: r.primary.p < 0.05, shade: isDom ? "sub" : null },
      { text: `${r.primary.statLabel}=${statNum(r.primary)}`, shade: isDom ? "sub" : null },
      { text: `${pText(r.primary.p).replace("p=", "").replace("p", "")}${sigStar(r.primary.p)}`, shade: isDom ? "sub" : null },
      { text: Number.isFinite(r.primary.effect) ? `${r.primary.effectName}=${f2(r.primary.effect)}` : "-", shade: isDom ? "sub" : null },
    ];
    P.domains.forEach(d => rows.push(row(d, true)));
    P.items.forEach(i => rows.push(row(i, false)));
    push({
      type: "table", caption: "사전·사후 점수 변화", unit: "(단위: 점)", compact: true,
      columns: [{ weight: 2.6, align: "LEFT" }, { weight: 0.7 }, { weight: 1.3 }, { weight: 1.3 }, { weight: 0.9 }, { weight: 1.1 }, { weight: 0.9 }, { weight: 1 }], rows,
      notes: [
        P.unpaired ? "주: 사전·사후 응답자가 매칭되지 않아 독립표본 Welch t검정 적용(n=사전/사후)" : "주: 매칭 n≥30은 대응표본 t검정, n<30이고 차이점수가 정규분포를 따르지 않으면(Shapiro-Wilk p<.05) Wilcoxon 부호순위 검정(V, 효과크기 r) 적용",
        "효과크기 d = 평균 변화 ÷ 차이점수 표준편차(0.2 작음, 0.5 중간, 0.8 큼), * p<.05, ** p<.01, *** p<.001",
      ],
    });
    const sc = P.items[0].scale;
    push({ type: "figure", caption: "사전·사후 점수 비교", chart: { kind: "dumbbell", data: P.items.slice(0, 15).map(i => ({ label: i.label, pre: i.mPre, post: i.mPost, sig: i.primary.p < 0.05 })), opts: { min: sc.min, max: sc.max } }, notes: ["○ 사전 ● 사후, * p<.05"] });
    const note = (key, text) => push({ type: "paragraph", style: "note", key, text });
    if (P.retrospective) note("pp.c.retro", "※ 회고식 사전검사(사후 시점에 참여 이전 상태를 회상하여 응답)로, 회상에 따른 응답 편향 가능성이 있음");
    if (P.unpaired) note("pp.c.unpaired", "※ 동일 응답자 비교가 아니므로 개인의 변화로 단정할 수 없음");
    else if (P.matchedN < t.minN) note("pp.c.small", `※ 분석 대상 ${P.matchedN}명으로 표본이 작아 결과 일반화에 유의 필요`);
  }

  // ───── Ⅴ. 만족도 분석 ─────
  if (A.items.length) {
    push(H(1, "만족도 분석"));
    push(H(2, "전반적 만족도"));
    const sb = [];
    if (overall) sb.push(B("sat.overall", 1, `${josa(q(overall.label), "은")} 평균 ${f2(overall.mean)}점(100점 환산 **${f2(overall.score100)}점**)으로 ${levelWord(overall.score100, t)}이며, 긍정응답률은 ${f1(overall.top2)}%임`));
    if (tot && Number.isFinite(tot.score100)) sb.push(B("sat.total", 1, `세부 문항 ${tot.nItems}개의 100점 환산 평균은 ${f2(tot.score100)}점으로 ${levelWord(tot.score100, t)}임`));
    if (A.domains.length) sb.push(B("sat.domains", 1, `영역별 점수: ${A.domains.map(d => `${d.name} ${f2(d.score100)}점`).join(", ")}`));
    bullets(sb);

    push(H(2, "문항별 만족도"));
    const ib = [];
    if (detailItems.length >= 2) {
      const hi = detailItems[0], lo = detailItems.at(-1);
      ib.push(B("sat.hilo", 1, `문항별로는 ${josa(q(hi.label), "이")} ${f2(hi.score100)}점으로 가장 높고, ${josa(q(lo.label), "이")} ${f2(lo.score100)}점으로 가장 낮음`));
      const high = detailItems.filter(i => i.score100 >= t.level[1]), low = detailItems.filter(i => i.score100 < t.level[2]);
      if (high.length) ib.push(B("sat.high", 2, `높은 수준(${t.level[1]}점 이상): ${high.map(i => q(i.label)).join(", ")}`));
      if (low.length) ib.push(B("sat.low", 2, `보통 이하(${t.level[2]}점 미만): ${low.map(i => q(i.label)).join(", ")} — 개선 검토 필요`));
      const neg = detailItems.filter(i => i.bottom2 >= 20);
      if (neg.length) ib.push(B("sat.neg", 2, `부정응답(하위 2개 척도)이 20% 이상인 문항: ${neg.map(i => `${q(i.label)}(${f1(i.bottom2)}%)`).join(", ")}`));
    }
    bullets(ib);
    const rows = [["문항", "n", "평균", "표준편차", "100점 환산", "긍정응답률(%)", "부정응답률(%)"].map(cellH)];
    const itemRow = (it, shade) => [{ text: it.label, align: "LEFT", shade, bold: !!shade }, { text: String(it.n), shade }, { text: f2(it.mean), shade }, { text: f2(it.sd), shade }, { text: f2(it.score100), shade, bold: true }, { text: f1(it.top2), shade }, { text: f1(it.bottom2), shade }];
    if (overall) rows.push(itemRow(overall, "sub"));
    detailItems.forEach(it => rows.push(itemRow(it, null)));
    if (tot && Number.isFinite(tot.score100)) rows.push([{ text: "세부 문항 전체", align: "LEFT", shade: "total", bold: true }, { text: String(tot.n), shade: "total" }, { text: f2(tot.mean), shade: "total" }, { text: "-", shade: "total" }, { text: f2(tot.score100), shade: "total", bold: true }, { text: f1(tot.top2), shade: "total" }, { text: "-", shade: "total" }]);
    push({ type: "table", caption: "문항별 만족도", unit: "(단위: 명, 점, %)", columns: [{ weight: 3.2, align: "LEFT" }, { weight: 0.8 }, { weight: 0.9 }, { weight: 1 }, { weight: 1.1 }, { weight: 1.2 }, { weight: 1.2 }], rows, notes: ["주: 문항은 100점 환산 점수가 높은 순으로 정렬, 긍정응답률은 상위 2개 척도, 부정응답률은 하위 2개 척도 응답 비율", A.meta.scoreBasis === "rounded" ? "주: 100점 환산은 표에 적힌 평균(소수 둘째 자리로 반올림한 값)으로 계산했으며, 정렬·수준 판정·성과지표 판정도 이 값을 기준으로 함" : "주: 100점 환산은 반올림 전 평균으로 계산하므로, 표의 평균(소수 둘째 자리)으로 직접 환산한 값과 ±0.1점 안팎 차이가 날 수 있음"] });
    if (detailItems.length) push({ type: "figure", caption: "문항별 만족도(100점 환산)", chart: { kind: "hbar", data: detailItems.map(i => ({ label: i.label, value: i.score100 })), opts: { max: 100, refValue: tot?.score100 ?? null, refLabel: "평균", unit: "점", valueFmt: f2 } } });
    // 분포 (가장 흔한 척도 범위)
    const rangeKey = it => `${it.min}-${it.max}`;
    const counts = {}; A.items.forEach(it => { counts[rangeKey(it)] = (counts[rangeKey(it)] || 0) + 1; });
    const common = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    const distItems = [overall, ...detailItems].filter(Boolean).filter(it => rangeKey(it) === common).slice(0, 15);
    if (distItems.length && distItems[0].max - distItems[0].min <= 6) {
      push({ type: "figure", caption: "문항별 응답 분포", chart: { kind: "likertDiverging", rows: distItems.map(it => ({ label: it.label, pct: it.freq.pct, n: it.n })), levelLabels: levelLabels(colOf(distItems[0].key), distItems[0].min, distItems[0].max) }, notes: ["단위: %, 가운데 선 기준 왼쪽은 부정, 오른쪽은 긍정 응답"] });
    }

    if (A.nps.length) {
      push(H(2, "추천의향(NPS)"));
      A.nps.forEach(n => {
        bullets([B(`nps.${n.key}`, 1, `${josa(q(n.label), "의")} 순추천지수(NPS)는 **${signed(n.nps, 1)}점**(추천 ${f1(n.promoters)}%, 중립 ${f1(n.passives)}%, 비추천 ${f1(n.detractors)}%)임`)].map(x => ({ ...x, text: x.text.replace("의의", "의") })));
        push({ type: "figure", caption: `${n.label} 응답 구성`, chart: { kind: "npsBar", data: n }, widthMm: 150 });
      });
    }
    if (A.multi.length) {
      push(H(2, "복수응답 문항"));
      A.multi.forEach(m => {
        const topO = m.options[0];
        if (topO) bullets([B(`multi.${m.key}`, 1, `${josa(q(m.label), "은")} ${josa(q(topO.option), "이")} ${f1(topO.pct)}%로 가장 많이 선택됨`)]);
        push({ type: "table", caption: `${m.label}(복수응답)`, unit: "(단위: 명, %)", columns: [{ weight: 3, align: "LEFT" }, { weight: 1 }, { weight: 1 }], rows: [[cellH("항목"), cellH("응답 수"), cellH("비율")], ...m.options.map(o => [{ text: o.option, align: "LEFT" }, String(o.n), f1(o.pct)])], notes: [`주: 비율의 분모는 해당 문항 응답자 ${m.answered}명(복수응답으로 합계가 100%를 넘을 수 있음)`] });
      });
    }
    if (A.ipa) {
      push(H(2, "중요도–만족도 분석(IPA)"));
      const focus = A.ipa.points.filter(p => p.quadrant === "집중 개선"), keep = A.ipa.points.filter(p => p.quadrant === "유지·강화");
      bullets([
        focus.length && B("ipa.focus", 1, `집중 개선 영역(중요도는 높으나 만족도가 낮음): ${focus.map(p => q(p.label)).join(", ")}`),
        keep.length && B("ipa.keep", 1, `유지·강화 영역(중요도와 만족도 모두 높음): ${keep.map(p => q(p.label)).join(", ")}`),
        B("ipa.method", 2, `중요도는 ${A.ipa.importanceMethod}로 산출함`),
      ]);
      push({ type: "figure", caption: "중요도–만족도 매트릭스", chart: { kind: "ipaScatter", data: A.ipa.points, opts: { meanI: A.ipa.meanImportance, meanP: A.ipa.meanPerformance } }, notes: ["점선: 평균, 음영: 집중 개선 영역"] });
    }
  }

  // ───── Ⅵ. 응답자 특성별 비교 ─────
  const crossUse = A.cross.filter(c => c.rows.length);
  if (crossUse.length) {
    push(H(1, "응답자 특성별 비교"));
    crossUse.forEach(c => {
      push(H(2, `${c.label}에 따른 비교`));
      const sigRows = c.rows.filter(r => r.test && r.test.p < 0.05);
      const others = c.rows.filter(r => !sigRows.includes(r));
      const shown = [...sigRows, ...others].slice(0, 5);
      const cols = [...(c.total ? [{ label: "문항 평균", r: c.total, isTotal: true }] : []), ...shown.map(r => ({ label: r.label, r }))];
      const header = [cellH("구분"), cellH("n"), ...cols.map(cl => cellH(cl.label))];
      const rows = [header];
      c.groups.forEach((g, gi) => {
        rows.push([{ text: g.name, bold: true }, String(g.n), ...cols.map(cl => { const st = cl.r.stats[gi]; const v = cl.isTotal ? st?.mean : st?.score100; return Number.isFinite(v) ? f2(v) : "-"; })]);
      });
      rows.push([{ text: "검정", bold: true, shade: "total" }, { text: "", shade: "total" }, ...cols.map(cl => ({ text: cl.r.test ? `${cl.r.test.statLabel}=${statNum(cl.r.test)}${sigStar(cl.r.test.p)}` : "-", shade: "total" }))]);
      push({ type: "table", caption: `${c.label}에 따른 만족도(100점 환산)`, unit: "(단위: 명, 점)", compact: cols.length > 4, columns: [{ weight: 1.4 }, { weight: 0.7 }, ...cols.map(() => ({ weight: 1.2 }))], rows,
        notes: [`주: 2집단은 Welch t검정, 3집단 이상은 Welch 분산분석(F). * p<.05, ** p<.01, *** p<.001${c.rows.length > shown.length ? ". 나머지 문항은 부록 참조" : ""}`] });
      const cb2 = [];
      if (c.total?.test) {
        const st = c.total.stats.filter(s => Number.isFinite(s.mean)).sort((a, b) => b.mean - a.mean);
        cb2.push(B(`cross.${c.key}.total`, 1, `${c.label}에 따른 문항 평균 점수의 차이는 ${c.total.test.p < 0.05 ? "통계적으로 유의함" : "통계적으로 유의하지 않음"} ${statParen(c.total.test)}${c.total.test.p < 0.05 && st.length >= 2 ? `, ${josa(q(st[0].group), "이")} ${f2(st[0].mean)}점으로 가장 높고 ${josa(q(st.at(-1).group), "이")} ${f2(st.at(-1).mean)}점으로 가장 낮음` : ""}`));
      }
      if (sigRows.length) {
        cb2.push(B(`cross.${c.key}.sig`, 1, `집단 간 유의한 차이가 있는 문항: ${sigRows.map(r => { const st = r.stats.filter(s => Number.isFinite(s.score100)).sort((a, b) => b.score100 - a.score100); return `${q(r.label)}(${st[0]?.group} 최고 ${f2(st[0]?.score100)}점)`; }).join(", ")}`));
      } else cb2.push(B(`cross.${c.key}.nosig`, 1, `모든 문항에서 ${c.label}에 따른 유의한 차이는 확인되지 않음`));
      bullets(cb2);
      if (sigRows.length) push({ type: "figure", caption: `${c.label}에 따른 차이가 있는 문항`, chart: { kind: "groupedHbar", categories: sigRows.slice(0, 6).map(r => r.label), series: c.groups.map((g, gi) => ({ name: g.name, values: sigRows.slice(0, 6).map(r => r.stats[gi]?.score100) })), opts: { max: 100, valueFmt: f2 } } });
    });
  }

  // ───── Ⅶ. 주관식 응답 분석 ─────
  const texts = A.text.filter(tx => tx.nSubstantive > 0);
  if (texts.length) {
    push(H(1, "주관식 응답 분석"));
    texts.forEach(tx => {
      push(H(2, tx.label));
      const ty = tx.types;
      const tb = [B(`text.${tx.key}.types`, 1, `유효 응답 ${tx.nSubstantive}건(무응답·‘없음’ 제외) 중 긍정 의견 ${ty.positive}건, 개선 요구·건의 ${ty.negative + ty.suggestion}건, 기타 ${ty.neutral}건`)];
      if (tx.themes.length) tb.push(B(`text.${tx.key}.themes`, 1, `주요 언급 주제: ${tx.themes.slice(0, 3).map(th => `${th.name}(${th.n}건)`).join(", ")}`));
      if (tx.keywords.length) tb.push(B(`text.${tx.key}.kw`, 1, `주요 키워드: ${tx.keywords.slice(0, 8).map(k => k.word).join(", ")}`));
      if (tx.quotes.positive.length) { tb.push(B(`text.${tx.key}.qp`, 1, "대표 의견(긍정)", true)); tx.quotes.positive.forEach((qt, i) => tb.push(B(`text.${tx.key}.qp${i}`, 3, `“${qt}”`))); }
      if (tx.quotes.improve.length) { tb.push(B(`text.${tx.key}.qi`, 1, "대표 의견(개선 요구)", true)); tx.quotes.improve.forEach((qt, i) => tb.push(B(`text.${tx.key}.qi${i}`, 3, `“${qt}”`))); }
      bullets(tb);
      if (tx.themes.length) push({
        type: "table", caption: `${tx.label} 주제별 분류`, unit: "(단위: 건, %)",
        columns: [{ weight: 2.2, align: "LEFT" }, { weight: 1 }, { weight: 1 }, { weight: 1 }, { weight: 1 }],
        rows: [["주제", "언급 건수", "비율", "긍정", "개선 요구"].map(cellH), ...tx.themes.map(th => [{ text: th.name, align: "LEFT" }, String(th.n), f1(th.pct), String(th.positive), String(th.negative)])],
        notes: [
          "주: 미리 정한 8개 주제의 키워드 일치로 분류하는 규칙 기반 자동 분류로, 사람이 직접 읽고 분류한 것보다 정확도가 낮을 수 있고 한 응답이 여러 주제에 포함될 수 있음 — 원문·대표 의견 검토를 권장함",
          tx.unclassified ? `주: 유효 응답 ${tx.nSubstantive}건 중 ${tx.unclassified}건(${f1(tx.unclassified / tx.nSubstantive * 100)}%)은 위 8개 주제 중 어느 것에도 해당하지 않아 표에서 빠짐` : null,
        ].filter(Boolean),
      });
    });
  }

  // ───── Ⅷ. 종합 평가 및 개선 방안 ─────
  push(H(1, "종합 평가 및 개선 방안"));
  push(H(2, "종합 평가"));
  const ev = [];
  if (kpiOn) {
    ev.push(B("ev.kpi", 1, `(성과지표) ${E.summary.total}개 지표 중 ${E.summary.achieved}개를 달성하여 종합 평가는 **${E.summary.grade}**임`));
    const notA = E.results.filter(r => r.judgment === "미달성");
    if (notA.length) ev.push(B("ev.kpi.not", 2, `미달성 지표: ${notA.map(r => `${q(r.name)}(${f1(r.rate)}%)`).join(", ")}`));
    (LM?.goals || []).forEach((g, i) => {
      const rs = E.results.filter(r => r.goalId === g.id);
      if (rs.length) ev.push(B(`ev.goal.${g.id}`, 2, `목표${i + 1} ${q(g.text)}: 연계 지표 ${rs.length}개 중 ${rs.filter(r => r.judgment === "달성").length}개 달성`));
    });
  }
  if (ALLP) ev.push(B("ev.pp", 1, `(성과 변화) 참여 후 성과 점수가 ${signed(ALLP.diff)}점 변화하여 ${ALLP.primary.p < 0.05 && ALLP.diff > 0 ? `사업 참여에 따른 긍정적 변화가 확인됨(${ALLP.primary.effectLabel})` : "통계적으로 유의한 변화는 확인되지 않음"}`));
  if (overall || tot) {
    const s100 = overall ? overall.score100 : tot.score100;
    ev.push(B("ev.sat", 1, `(만족도) ${overall ? "전반적 만족도" : "만족도"}는 100점 환산 ${f1(s100)}점으로 ${levelWord(s100, t)}임`));
  }
  bullets(ev);

  push(H(2, "개선 방안"));
  const imp = [];
  const used = new Set();
  if (kpiOn) E.results.filter(r => r.judgment === "미달성").forEach(r => imp.push(B(`imp.kpi.${r.id}`, 1, `${q(r.name)} 목표 미달성(달성률 ${f1(r.rate)}%): 원인 분석을 통한 운영 방식 보완 및 차년도 목표 재설정 검토`)));
  (A.ipa?.points || []).filter(p => p.quadrant === "집중 개선").forEach(p => { used.add(p.key); imp.push(B(`imp.ipa.${p.key}`, 1, `${q(p.label)}: 전반 만족도와의 관련성이 높으나 만족도(${f1(p.performance)}점)가 상대적으로 낮아 우선 개선 필요`)); });
  detailItems.filter(i => i.score100 < t.level[2] && !used.has(i.key)).forEach(i => imp.push(B(`imp.low.${i.key}`, 1, `${q(i.label)}(${f2(i.score100)}점): 만족도가 낮아 세부 원인 점검 및 개선 필요`)));
  A.text.forEach(tx => [...tx.themes].filter(th => th.negative >= 2).sort((a, b) => b.negative - a.negative).slice(0, 2).forEach(th => {
    imp.push(B(`imp.text.${tx.key}.${th.id}`, 1, `${q(th.name)} 관련 개선 요구 ${th.negative}건(주관식 ${q(tx.label)})`));
    const qt = tx.themeQuotes?.[th.id]?.[0];
    if (qt) imp.push(B(`imp.text.${tx.key}.${th.id}.q`, 3, `“${qt}”`));
  }));
  if (P) P.items.filter(i => !(i.primary.p < 0.05)).slice(0, 3).forEach(i => imp.push(B(`imp.pp.${i.pairKey}`, 1, `${q(i.label)}: 사전·사후 변화가 유의하지 않아 관련 활동 내용 보강 검토`)));
  if (!imp.length) imp.push(B("imp.none", 1, "전반적으로 양호한 수준으로, 현행 운영 방식을 유지하고 우수 요소를 타 사업에 확산하는 방안 검토"));
  bullets(imp);

  if (kpiOn && E.results.some(r => Number.isFinite(r.targetValue))) {
    push(H(2, "차년도 목표(안)"));
    const rows = [["성과지표", "당해 목표", "당해 실적", "판정", "차년도 목표(안)"].map(cellH)];
    E.results.forEach(r => {
      let next = r.targetValue;
      if (r.judgment === "달성" && Number.isFinite(r.actualValue)) {
        next = r.direction === "down" ? Math.min(r.targetValue, r.actualValue * 0.95) : Math.max(r.targetValue, r.actualValue * 1.05);
        if (PCT_LIKE.has(r.metric) || r.unit === "%") next = Math.min(100, next);
        next = Number.isInteger(r.targetValue) ? (r.direction === "down" ? Math.floor(next) : Math.ceil(next)) : Math.round(next * 100) / 100;
      }
      rows.push([{ text: r.name, align: "LEFT" }, `${fmtKpi(r.targetValue, r.metric)}${r.unit || ""}`, `${fmtKpi(r.actualValue, r.metric)}${Number.isFinite(r.actualValue) ? r.unit || "" : ""}`, r.judgment, { text: Number.isFinite(next) ? `${fmtKpi(next, r.metric)}${r.unit || ""}` : "-", bold: true }]);
    });
    push({ type: "table", caption: "차년도 성과지표 목표(안)", columns: [{ weight: 3, align: "LEFT" }, { weight: 1 }, { weight: 1 }, { weight: 1 }, { weight: 1.2 }], rows, notes: ["주: 달성 지표는 당해 실적의 105%(하향 지표 95%) 수준, 미달성 지표는 당해 목표 유지를 기계적으로 제안한 값으로, 사업 여건을 고려해 조정 필요"] });
  }

  const cau = [];
  if (A.meta.n < t.minN) cau.push(B("c.n", 1, `응답자 수(${A.meta.n}명)가 적어 결과 해석 및 일반화에 유의 필요`));
  if (A.reliability && A.reliability.alpha < t.lowAlpha) cau.push(B("c.alpha", 1, `척도 신뢰도(α=${f2(A.reliability.alpha)})가 낮아 문항 구성 검토 필요`));
  const hiMiss = A.items.filter(i => i.missing / Math.max(1, i.nTotal) * 100 > t.highMissing);
  if (hiMiss.length) cau.push(B("c.missing", 1, `무응답 비율이 ${t.highMissing}%를 넘는 문항: ${hiMiss.map(i => q(i.label)).join(", ")}`));
  if (crossUse.reduce((s, c) => s + c.rows.filter(r => r.test).length, 0) >= 4) cau.push(B("c.multi", 1, "응답자 특성별 비교는 여러 검정을 반복한 결과로, 유의확률이 경계 수준인 결과는 신중히 해석 필요(부록에 Holm·BH 보정값 제시)"));
  if (crossUse.some(c => c.rows.some(r => r.smallGroupN) || c.total?.smallGroupN)) cau.push(B("c.smalln", 1, "응답자 특성별 비교 중 일부는 집단 인원이 10명 미만으로 결과를 신중히 해석할 필요가 있음"));
  if (texts.length) cau.push(B("c.text", 1, "주관식 분류는 규칙 기반 자동 분류 결과이므로 원문 검토와 병행 필요"));
  if (P?.retrospective) cau.push(B("c.retro", 1, "회고식 사전검사 결과는 응답자의 회상에 의존함"));
  if (cau.length) { push(H(2, "해석 시 유의사항")); bullets(cau); }

  // ───── 부록 ─────
  push({ type: "pageBreak" });
  push(H(1, "[부록] 세부 분석표", { appendix: true }));
  const commonItems = A.items.filter(it => it.max - it.min <= 6);
  if (commonItems.length) {
    const byRange = {};
    commonItems.forEach(it => { (byRange[`${it.min}-${it.max}`] ||= []).push(it); });
    Object.values(byRange).forEach(list => {
      const labels = levelLabels(colOf(list[0].key), list[0].min, list[0].max);
      push({ type: "table", caption: `문항별 응답 분포(${list[0].min}~${list[0].max}점 척도)`, unit: "(단위: %)", compact: true,
        columns: [{ weight: 2.8, align: "LEFT" }, { weight: 0.7 }, ...labels.map(() => ({ weight: 1 })), { weight: 0.9 }],
        rows: [[cellH("문항"), cellH("n"), ...labels.map(l => cellH(l)), cellH("평균")], ...list.map(it => [{ text: it.label, align: "LEFT" }, String(it.n), ...it.freq.pct.map(p => f1(p)), f2(it.mean)])] });
    });
  }
  if (crossUse.length) {
    const rows = [["특성", "문항", "검정", "통계량", "p", "보정 p(Holm)", "보정 p(BH)", "효과크기"].map(cellH)];
    crossUse.forEach(c => c.rows.forEach((r, i) => rows.push([i === 0 ? { text: c.label, rowSpan: c.rows.length, bold: true } : null, { text: `${r.label}${r.smallGroupN ? " †" : ""}`, align: "LEFT" }, r.test?.name || "-", r.test ? statNum(r.test) : "-", r.test ? pText(r.test.p).replace(/^p=?/, "") : "-", Number.isFinite(r.pHolm) ? pText(r.pHolm).replace(/^p=?/, "") : "-", Number.isFinite(r.pBH) ? pText(r.pBH).replace(/^p=?/, "") : "-", r.test && Number.isFinite(r.test.effect) ? `${r.test.effectName}=${f2(r.test.effect)}` : "-"].filter(x => x !== null))));
    push({ type: "table", caption: "응답자 특성별 차이 검정 전체 결과", compact: true, columns: [{ weight: 1.2 }, { weight: 2.4, align: "LEFT" }, { weight: 1.1 }, { weight: 0.9 }, { weight: 0.8 }, { weight: 0.9 }, { weight: 0.9 }, { weight: 1 }], rows,
      notes: crossUse.some(c => c.rows.some(r => r.smallGroupN)) ? ["† 집단 인원 10명 미만 포함(신중히 해석)"] : undefined });
  }
  push({ type: "table", caption: "주요 산식 정의", compact: true, columns: [{ weight: 1.6, align: "LEFT" }, { weight: 4, align: "LEFT" }], rows: [
    [cellH("지표"), cellH("산식·기준")],
    ["100점 환산 점수", "(평균 − 척도 최소점) ÷ (척도 최대점 − 척도 최소점) × 100"],
    ["긍정응답률(Top2)", "상위 2개 척도 응답 수 ÷ 유효 응답 수 × 100"],
    ["순추천지수(NPS)", "추천(9~10점) 비율 − 비추천(0~6점) 비율"],
    ["달성률", "실적 ÷ 목표 × 100 (하향 지표: {1 − (실적 − 목표) ÷ |목표|} × 100)"],
    ["효과크기 d", "평균 차이 ÷ 표준편차 (0.2 작음, 0.5 중간, 0.8 큼)"],
    ["수준 구분(100점 환산)", `${t.level[0]}점 이상 매우 높음, ${t.level[1]}점 이상 높음, ${t.level[2]}점 이상 보통 이상, ${t.level[3]}점 이상 보통, 그 미만 낮음`],
    ["Cronbach α", "0.9 이상 매우 우수, 0.8 이상 양호, 0.7 이상 수용 가능, 0.6 미만 낮음"],
  ] });
  return blocks;
}
