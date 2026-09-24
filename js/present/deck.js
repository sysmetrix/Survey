// 발표 슬라이드 구성 (순수 모듈): 분석 결과 → 슬라이드 배열
// 원칙(데이터 스토리텔링): 슬라이드당 하나의 메시지, 결론을 말하는 제목(행동형 제목), 핵심 수치 1개 강조,
//   차트는 메시지에 맞는 형태 1개, 근거(n·검정)는 각주·발표자 노트로
import { levelWord, f1, f2, signed, pText, statParen, DEFAULT_THRESHOLDS } from "../narrative/vocab.js";
import { josa } from "../narrative/josa.js";
import { DESIGN_LABELS } from "../model/codebook.js";
import { levelLabels } from "../report/build-report.js";
import { koDate } from "../core/util.js";
import { isFeatureOn } from "../admin/flags-client.js";
import { measurementResults } from "../evaluation/measurement-results.js";
import { validateKpiEvidence } from "../evaluation/reference-evidence.js";
import { METRICS } from "../evaluation/kpi.js";

const q = s => `‘${s}’`;
const short = (s, n = 18) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));

/**
 * @returns {{id:string, type:'cover'|'stats'|'chart'|'hero'|'voice'|'columns'|'end', section:string, title:string,
 *   subtitle?:string, chart?:object, stats?:object[], hero?:object, aside?:object, quotes?:object, columns?:object[],
 *   chips?:string[], notes:string[], source?:string}[]}
 */
export function buildDeck({ analysis: A, evaluation: E = null, logicModel: LM = null, codebook: CB, settings: S = {} }) {
  const t = { ...DEFAULT_THRESHOLDS, ...(S.thresholds || {}) };
  const slides = [];
  const add = s => slides.push({ notes: [], ...s });
  const P = A.prepost;
  const ALLP = P?.domains.find(d => d.id === "ALL") || (P?.items.length === 1 ? P.items[0] : null);
  const overall = A.overallItem, tot = A.total;
  const detail = A.items.filter(it => !it.isOverall).sort((a, b) => b.score100 - a.score100);
  const sat = overall ? overall.score100 : tot?.score100;
  const n = A.meta.n;
  const title = S.reportTitle || (LM?.programName ? LM.programName : "설문조사 결과");
  const colOf = key => CB?.columns.find(c => c.key === key);

  // 1. 표지
  add({ id: "cover",
    type: "cover", section: "결과 보고", title,
    subtitle: [S.orgName, S.author, S.date || koDate()].filter(Boolean).join(" · "),
    chips: [LM?.period, LM?.target, `응답자 ${n}명`, DESIGN_LABELS[A.meta.design]].filter(Boolean),
    notes: [LM?.purpose ? `사업목적: ${LM.purpose}` : "", `분석 대상 ${n}명, ${DESIGN_LABELS[A.meta.design]}`].filter(Boolean),
  });

  // 2. 한눈에 보기 (핵심 수치 타일)
  const stats = [{ label: "응답자", value: String(n), unit: "명", sub: P?.matching ? `사전·사후 매칭 ${P.matchedN}명` : DESIGN_LABELS[A.meta.design] }];
  if (E?.results.length) stats.push({ label: "성과지표 달성", value: `${E.summary.achieved}/${E.summary.measured}`, unit: "개", sub: "설정한 목표의 달성 요약", tone: "neutral" });
  if (ALLP) stats.push({ label: "참여 전후 변화", value: signed(ALLP.diff), unit: "점", sub: `${f2(ALLP.mPre)} → ${f2(ALLP.mPost)} · ${pText(ALLP.primary.p)}`, tone: ALLP.primary.p < 0.05 && ALLP.diff > 0 ? "good" : "neutral" });
  if (Number.isFinite(sat)) stats.push({ label: overall ? "전반적 만족도" : "만족도", value: f1(sat), unit: "점", sub: `100점 환산 · ${levelWord(sat, t)}` });
  if (A.nps[0]) stats.push({ label: "순추천지수(NPS)", value: signed(A.nps[0].nps, 1), unit: "", sub: `추천 ${f1(A.nps[0].promoters)}% · 비추천 ${f1(A.nps[0].detractors)}%` });
  const head = [];
  if (E?.results.length) head.push(`성과지표 ${E.summary.measured}개 중 ${E.summary.achieved}개 달성`);
  if (ALLP && ALLP.primary.p < 0.05 && ALLP.diff > 0) head.push(`참여 후 성과 점수 ${signed(ALLP.diff)}점 향상`);
  if (head.length < 2 && Number.isFinite(sat)) head.push(`만족도 ${f1(sat)}점(${levelWord(sat, t)})`);
  add({ id: "summary", type: "stats", section: "한눈에 보기", title: head.slice(0, 2).join(", ") || "조사 결과 요약", stats: stats.slice(0, 5), notes: stats.map(s => `${s.label}: ${s.value}${s.unit} (${s.sub})`) });

  // 3. 성과지표
  if (E?.results.length) {
    const s = E.summary;
    const measured = E.results.filter(r => Number.isFinite(r.rate));
    const miss = E.results.filter(r => r.judgment === "미달성");
    add({ id: "kpi",
      type: "chart", section: "성과지표",
      title: `성과지표 ${s.total}개 중 ${s.achieved}개 달성${s.mostly ? `, ${s.mostly}개 대체로 달성` : ""}`,
      subtitle: `종합 평가 ${s.grade} · 평균 달성률 ${f1(s.avgRate)}%`,
      chart: measured.length ? { kind: "kpiBullet", data: measured.map(r => ({ label: r.name, rate: r.rate })), opts: { mostly: t.kpiMostly, width: 900 } } : null,
      aside: miss.length ? { title: "미달성 지표", items: miss.map(r => `${r.name} ${f1(r.rate)}%`) } : { title: "모든 지표 목표 근접", items: E.results.map(r => `${r.name} ${f1(r.rate)}%`).slice(0, 4) },
      notes: E.results.map(r => { const validation = isFeatureOn("referenceEvidence") ? validateKpiEvidence(r, (METRICS[r.metric] || METRICS.manual).kind) : { valid:false }; const evidence = validation.valid ? validation.evidence : null; return `${r.name}: 목표 ${r.targetValue}${r.unit || ""}, 실적 ${Number.isFinite(r.actualValue) ? r.actualValue.toFixed(2).replace(/\.00$/, "") : "-"}${r.unit || ""}, ${r.judgment}${r.facts ? ` (${r.facts})` : ""}${evidence ? ` · 해석 근거 [${evidence.id}] ${evidence.title}: ${evidence.principle} · 적용 사유 ${r.evidenceRationale}` : ""}`; }),
      source: `달성률 = 실적 ÷ 목표 × 100 · 판정: ${t.kpiAchieved}% 이상 달성, ${t.kpiMostly}% 이상 대체로 달성${isFeatureOn("referenceEvidence") ? ` · 검토 완료 근거 ${E.results.filter(r => validateKpiEvidence(r, (METRICS[r.metric] || METRICS.manual).kind).valid).length}건` : ""}`,
    });
  }

  // 4. 사전·사후 (핵심 수치 + 영역/문항 덤벨)
  if (ALLP) {
    const sig = ALLP.primary.p < 0.05;
    const doms = P.domains.filter(d => d.id !== "ALL");
    const rowsFrom = list => list.slice(0, 8).map(d => ({ label: d.name || d.label, pre: d.mPre, post: d.mPost, sig: d.primary.p < 0.05 }));
    const scale = P.items[0].scale;
    // 발표용: 변화가 보이도록 가로축을 값 범위(정수 단위)로 확대 — 각주에 명시
    const zoom = rows => {
      const v = rows.flatMap(r => [r.pre, r.post]).filter(Number.isFinite);
      return v.length ? { min: Math.max(scale.min, Math.floor(Math.min(...v) - 0.2)), max: Math.min(scale.max, Math.ceil(Math.max(...v) + 0.2)) } : { min: scale.min, max: scale.max };
    };
    add({ id: "prepost",
      type: "hero", section: "성과 변화",
      title: sig && ALLP.diff > 0 ? `참여 후 성과 점수가 ${signed(ALLP.diff)}점 향상됐습니다` : `참여 전후 성과 점수 변화는 ${signed(ALLP.diff)}점입니다`,
      subtitle: sig ? `통계적으로 유의한 변화 · 효과 ${ALLP.primary.effectLabel}` : "통계적으로 유의한 변화는 확인되지 않음",
      hero: {
        value: signed(ALLP.diff), unit: "점", caption: `사전 ${f2(ALLP.mPre)} → 사후 ${f2(ALLP.mPost)}`,
        facts: [`${ALLP.primary.name} ${statParen(ALLP.primary)}`, Number.isFinite(ALLP.improvedPct) ? `참여자 ${f1(ALLP.improvedPct)}% 향상` : "", `100점 환산 ${f2(ALLP.score100Pre)} → ${f2(ALLP.score100Post)}`].filter(Boolean),
      },
      chart: { kind: "dumbbell", data: rowsFrom(doms.length >= 2 ? doms : P.items), opts: { ...zoom(rowsFrom(doms.length >= 2 ? doms : P.items)), width: 620, labelWidth: 130 } },
      notes: [...P.domains.map(d => `${d.name}: ${f2(d.mPre)} → ${f2(d.mPost)} ${statParen(d.primary)}`), P.retrospective ? "회고식 사전검사(회상 응답)임을 함께 설명" : "", P.matchedN < t.minN ? `매칭 ${P.matchedN}명으로 표본이 작음` : ""].filter(Boolean),
      source: `매칭 n=${P.matchedN} · * p<.05 · 가로축은 값이 있는 구간만 확대`,
    });
    if (doms.length >= 2 && P.items.length >= 2) {
      const up = P.items.filter(i => i.primary.p < 0.05 && i.diff > 0).sort((a, b) => b.diff - a.diff);
      const flat = P.items.filter(i => !(i.primary.p < 0.05));
      add({ id: "prepost-items",
        type: "chart", section: "성과 변화",
        title: up.length ? `${q(short(up[0].label, 20))} 문항이 가장 크게 올랐습니다(${signed(up[0].diff)}점)` : "문항별 변화가 크지 않습니다",
        subtitle: flat.length ? `변화가 유의하지 않은 문항 ${flat.length}개` : "모든 문항에서 유의한 향상",
        chart: { kind: "dumbbell", data: rowsFrom(P.items.slice(0, 10)), opts: { ...zoom(rowsFrom(P.items.slice(0, 10))), width: 900, labelWidth: 280 } },
        notes: P.items.map(i => `${i.label}: ${f2(i.mPre)} → ${f2(i.mPost)} ${statParen(i.primary)}`),
        source: `매칭 n=${P.matchedN} · * p<.05 · 가로축은 값이 있는 구간만 확대`,
      });
    }
  }

  // 5. 만족도 순위
  if (detail.length >= 2) {
    const hi = detail[0], lo = detail.at(-1);
    add({ id: "ranking",
      type: "chart", section: "만족도",
      title: `${q(short(hi.label, 16))} ${f2(hi.score100)}점으로 가장 높고, ${q(short(lo.label, 16))} ${f2(lo.score100)}점으로 가장 낮습니다`,
      subtitle: tot && Number.isFinite(tot.score100) ? `세부 문항 평균 ${f2(tot.score100)}점(100점 환산, ${levelWord(tot.score100, t)})` : "",
      chart: { kind: "hbar", data: detail.slice(0, 12).map(i => ({ label: i.label, value: i.score100 })), opts: { max: 100, refValue: tot?.score100 ?? null, refLabel: "평균", unit: "점", width: 900, labelWidth: 280, valueFmt: f2 } },
      notes: detail.map(i => `${i.label}: ${f2(i.mean)}점(100점 ${f2(i.score100)}, 긍정 ${f1(i.top2)}%, 부정 ${f1(i.bottom2)}%)`),
      source: `100점 환산 = (평균 - 최소) ÷ (최대 - 최소) × 100${A.meta.scoreBasis === "rounded" ? "(표시된 소수 둘째 자리 평균 기준)" : "(반올림 전 평균 기준)"} · n=${Math.min(...detail.map(i => i.n))}`,
    });
  }

  // 6. 응답 분포
  const rangeKey = it => `${it.min}-${it.max}`;
  const withOverall = [overall, ...detail].filter(Boolean);
  if (withOverall.length) {
    const counts = {};
    withOverall.forEach(it => { counts[rangeKey(it)] = (counts[rangeKey(it)] || 0) + 1; });
    const common = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    const dist = withOverall.filter(it => rangeKey(it) === common && it.max - it.min <= 6).slice(0, 10);
    if (dist.length) {
      const worst = [...dist].sort((a, b) => b.bottom2 - a.bottom2)[0];
      const minTop = Math.min(...dist.map(i => i.top2));
      add({ id: "dist",
        type: "chart", section: "응답 분포",
        title: worst.bottom2 >= 10 ? `${q(short(worst.label, 18))} 부정응답이 ${f1(worst.bottom2)}%로 가장 많습니다` : `모든 문항의 긍정응답률이 ${f1(minTop)}% 이상입니다`,
        subtitle: "가운데 선 왼쪽은 부정, 오른쪽은 긍정 응답(%)",
        chart: { kind: "likertDiverging", rows: dist.map(it => ({ label: it.label, pct: it.freq.pct, n: it.n })), levelLabels: levelLabels(colOf(dist[0].key), dist[0].min, dist[0].max), opts: { width: 900, labelWidth: 260 } },
        notes: dist.map(i => `${i.label}: 긍정 ${f1(i.top2)}%, 부정 ${f1(i.bottom2)}%`),
      });
    }
  }

  // 7. 추천의향
  if (A.nps[0]) {
    const s = A.nps[0];
    add({ id: "nps",
      type: "chart", section: "추천의향",
      title: `순추천지수(NPS)는 ${signed(s.nps, 1)}점입니다`,
      subtitle: `추천 ${f1(s.promoters)}% · 중립 ${f1(s.passives)}% · 비추천 ${f1(s.detractors)}%`,
      chart: { kind: "npsBar", data: s, opts: { width: 900 } },
      notes: ["NPS = 추천(9~10점) 비율 - 비추천(0~6점) 비율, 범위 -100~+100"],
      source: `n=${s.n}`,
    });
  }

  // 8. 중요도–만족도
  if (A.ipa) {
    const focus = A.ipa.points.filter(p => p.quadrant === "집중 개선");
    add({ id: "ipa",
      type: "chart", section: "개선 우선순위",
      title: focus.length ? `우선 개선 대상은 ${focus.slice(0, 2).map(p => q(short(p.label, 14))).join(", ")}입니다` : "중요한 항목의 만족도가 모두 평균 이상입니다",
      subtitle: "중요도(전반 만족도와의 관련성)는 높은데 만족도가 낮은 항목 = 집중 개선",
      chart: { kind: "ipaScatter", data: A.ipa.points, opts: { meanI: A.ipa.meanImportance, meanP: A.ipa.meanPerformance, width: 900, height: 470 } },
      notes: A.ipa.points.map(p => `${p.label}: ${p.quadrant} (만족도 ${f1(p.performance)}, 중요도 ${p.importance.toFixed(2)})`),
      source: A.ipa.importanceMethod,
    });
  }

  // 9. 집단 차이 (유의한 경우만, 최대 2장)
  A.cross.filter(c => c.rows.some(r => r.test && r.test.p < 0.05)).slice(0, 2).forEach(c => {
    const sigRows = c.rows.filter(r => r.test && r.test.p < 0.05).slice(0, 5);
    const r0 = sigRows[0];
    const st = r0.stats.filter(s => Number.isFinite(s.score100)).sort((a, b) => b.score100 - a.score100);
    add({ id: `cross-${c.label}`,
      type: "chart", section: "집단 비교",
      title: `${josa(c.label, "에")} 따라 ${q(short(r0.label, 16))} 만족도가 다릅니다(${st[0].group} ${f2(st[0].score100)} > ${st.at(-1).group} ${f2(st.at(-1).score100)})`,
      subtitle: `통계적으로 유의한 차이가 있는 문항 ${sigRows.length}개`,
      chart: { kind: "groupedHbar", categories: sigRows.map(r => r.label), series: c.groups.slice(0, 4).map((g, gi) => ({ name: g.name, values: sigRows.map(r => r.stats[gi]?.score100) })), opts: { max: 100, width: 900, labelWidth: 240, valueFmt: f2 } },
      notes: sigRows.map(r => `${r.label}: ${statParen(r.test)}`),
      source: `100점 환산 · ${c.groups.map(g => `${g.name} n=${g.n}`).join(", ")}`,
    });
  });

  // 10. 참여자 목소리
  const texts = A.text.filter(tx => tx.nSubstantive > 0);
  if (texts.length) {
    const improveTx = [...texts].sort((a, b) => (b.types.negative + b.types.suggestion) - (a.types.negative + a.types.suggestion))[0];
    const positiveTx = [...texts].sort((a, b) => b.types.positive - a.types.positive)[0];
    const themes = [...improveTx.themes].sort((a, b) => b.negative - a.negative).filter(th => th.negative > 0).slice(0, 6);
    const topTheme = themes[0];
    add({ id: "voice",
      type: "voice", section: "참여자 목소리",
      title: topTheme ? `개선 의견은 ${q(topTheme.name)} 관련이 가장 많습니다(${topTheme.negative}건)` : `긍정 의견이 ${positiveTx.types.positive}건 모였습니다`,
      subtitle: `${q(improveTx.label)} 응답 ${improveTx.nSubstantive}건 자동 분류`,
      chart: themes.length ? { kind: "hbar", data: themes.map(th => ({ label: th.name, value: th.negative })), opts: { width: 560, labelWidth: 150, unit: "건", valueFmt: v => String(Math.round(v)) } } : null,
      quotes: { positive: positiveTx.quotes.positive.slice(0, 2), improve: improveTx.quotes.improve.slice(0, 2) },
      notes: texts.map(tx => `${tx.label}: 긍정 ${tx.types.positive}, 개선·건의 ${tx.types.negative + tx.types.suggestion}, 주요 키워드 ${tx.keywords.slice(0, 6).map(k => k.word).join(", ")}`),
      source: "키워드 규칙 기반 자동 분류 · 원문 검토 권장",
    });
  }

  // 11. 종합: 잘된 점 / 개선할 점 / 다음 단계
  const good = [], improve = [], next = [];
  if (E) E.results.filter(r => r.judgment === "달성").slice(0, 2).forEach(r => good.push(`${r.name} 목표 달성${Number.isFinite(r.rate) ? `(${f1(r.rate)}%)` : "(기준 충족)"}`));
  if (ALLP && ALLP.primary.p < 0.05 && ALLP.diff > 0) good.push(`참여 후 성과 점수 ${signed(ALLP.diff)}점 향상(${ALLP.primary.effectLabel})`);
  detail.filter(i => i.score100 >= t.level[1]).slice(0, 2).forEach(i => good.push(`${short(i.label, 20)} ${f2(i.score100)}점`));
  if (E) E.results.filter(r => r.judgment === "미달성").slice(0, 2).forEach(r => { improve.push(`${r.name} 미달성${Number.isFinite(r.rate) ? `(${f1(r.rate)}%)` : "(기준 미충족)"}`); next.push(`${r.name}: 원인 검토·운영 방식 보완`); });
  (A.ipa?.points || []).filter(p => p.quadrant === "집중 개선").slice(0, 2).forEach(p => { improve.push(`${short(p.label, 20)} 만족도 ${f2(p.performance)}점`); next.push(`${short(p.label, 20)} 개선 과제 수립`); });
  texts.forEach(tx => tx.themes.filter(th => th.negative >= 3).slice(0, 1).forEach(th => improve.push(`주관식 ${th.name} 개선 요구 ${th.negative}건`)));
  if (P) P.items.filter(i => !(i.primary.p < 0.05)).slice(0, 1).forEach(i => next.push(`${short(i.label, 18)} 관련 활동 보강`));
  if (E) next.push("차년도 성과지표 목표(안) 검토");
  if (good.length || improve.length) {
    add({ id: "wrap",
      type: "columns", section: "종합 평가",
      title: E ? "설정한 목표의 달성 요약과 검토 과제" : "관찰된 결과와 검토 과제",
      columns: [
        { title: "잘된 점", tone: "good", items: good.slice(0, 4) },
        { title: "개선할 점", tone: "critical", items: improve.slice(0, 4) },
        { title: "다음 단계", tone: "neutral", items: (next.length ? next : ["현행 운영 유지 및 우수 요소 확산"]).slice(0, 4) },
      ],
      notes: ["보고서 Ⅷ장(종합 평가 및 개선 방안)과 같은 근거"],
    });
  }

  if (isFeatureOn("competencyProfile")) {
    const measurement = measurementResults(A, CB);
    for (let i = 0; i < measurement.domains.length; i += 6) {
      const domains = measurement.domains.slice(i, i+6);
      add({ id: `measurement-${i}`, type:"chart", section:"측정 영역", title:"영역별 관찰된 변화", subtitle:measurement.limitation,
        chart:{kind:"hbar",data:domains.map(d=>({label:d.name,value:d.diff})),opts:{width:560,labelWidth:150,unit:"점"}},
        notes:[measurement.scoring,...domains.map(d=>`${d.name}: ${d.nItems}문항, n=${d.n}, ${f2(d.pre)} → ${f2(d.post)}, 변화 ${f2(d.diff)}, d=${f2(d.effect)}`)],source:"계산 규칙 v2"});
    }
    for (let i = 0; i < measurement.improvements.length; i += 3) add({id:`improvements-${i}`,type:"columns",section:"사업 개선",title:"담당자가 작성한 개선 과제",columns:measurement.improvements.slice(i,i+3).map(task=>({title:task.action || "과제 미입력",tone:"neutral",items:[`근거: ${task.evidence || "미입력"}`,`담당: ${task.owner || "미정"}`,`확인: ${task.reviewDate || "미정"}`]})),notes:["담당자가 해석하고 작성한 내용이며 시스템의 원인 판정이 아님"]});
  }
  add({ id: "end", type: "end", section: "", title: "감사합니다", subtitle: [S.orgName, title].filter(Boolean).join(" · "), notes: ["질의응답"] });
  return slides;
}
