// 분석 총괄: Survey → AnalysisResult (보고서·대시보드 공통 입력)
import { itemStats, numericStats, domainStats, npsStats, multiStats, respondentProfile } from "./items.js";
import { crossAnalysis, numericCrossAnalysis, demographicAssociations } from "./cross.js";
import { prepostAnalysis } from "./prepost.js";
import { textAnalysis } from "./text.js";
import { pearson } from "../stats/correlation.js";
import { ols } from "../stats/regression.js";
import { cronbachAlpha } from "../stats/reliability.js";
import { mean } from "../stats/descriptive.js";

/** scoreBasis: "exact"(반올림 전 평균으로 환산) | "rounded"(반올림 후 평균으로 환산) — 정렬·수준 판정·성과지표 판정은 여기서 정해진 환산 점수를 그대로 따른다 */
export function analyzeSurvey(survey, { textGroupKey = null, scoreBasis = "exact" } = {}) {
  const basis = { scoreBasis };
  const items = survey.scales.map(c => itemStats(survey, c, basis));
  const domainsRes = domainStats(survey, items, basis);
  const overallItem = items.find(it => it.isOverall) || null;
  const nonOverall = items.filter(it => !it.isOverall);

  // 전체 신뢰도 (전반 만족 문항 제외)
  const relCols = survey.scales.filter(c => !c.isOverall);
  const reliability = relCols.length >= 2 ? cronbachAlpha(relCols.map(c => ({ name: c.label, values: survey.values(c.key) }))) : null;

  // 상관 (최대 20문항)
  const corrCols = survey.scales.slice(0, 20);
  const correlation = corrCols.length >= 2 ? {
    keys: corrCols.map(c => c.key), labels: corrCols.map(c => c.label),
    matrix: corrCols.map(a => corrCols.map(b => (a === b ? { r: 1, p: 0, n: survey.values(a.key).filter(x => x !== null).length } : pearson(survey.values(a.key), survey.values(b.key))))),
  } : null;

  // 전반 만족도 영향요인 (회귀) + IPA
  let regression = null, ipa = null;
  if (overallItem && nonOverall.length >= 2) {
    const reg = ols(survey.values(overallItem.key), nonOverall.map(it => ({ name: it.label, values: survey.values(it.key) })));
    if (reg && reg.n >= nonOverall.length + 10) regression = { dependent: overallItem.label, ...reg };
    const pts = nonOverall.map(it => {
      const r = pearson(survey.values(it.key), survey.values(overallItem.key));
      return { key: it.key, label: it.label, performance: it.score100, importance: r ? r.r : NaN };
    }).filter(p => Number.isFinite(p.importance) && Number.isFinite(p.performance));
    if (pts.length >= 3) {
      const mP = mean(pts.map(p => p.performance)), mI = mean(pts.map(p => p.importance));
      pts.forEach(p => {
        p.quadrant = p.importance >= mI ? (p.performance >= mP ? "유지·강화" : "집중 개선") : (p.performance >= mP ? "과잉 투자 점검" : "점진 개선");
      });
      ipa = { points: pts, meanPerformance: mP, meanImportance: mI, importanceMethod: `'${overallItem.label}'과의 상관계수(도출 중요도)` };
    }
  }

  const groups = textGroupKey ? survey.values(textGroupKey) : null;
  return {
    meta: { n: survey.n, scoreBasis, design: survey.design, fileName: survey.dataset.fileName, source: survey.dataset.source, straightLiners: survey.straightLiners.length },
    respondents: survey.demographics.map(c => respondentProfile(survey, c)),
    items, numerics: survey.numerics.map(c => numericStats(survey, c)), overallItem, domains: domainsRes.domains, total: domainsRes.total, reliability,
    nps: survey.nps.map(c => npsStats(survey, c)),
    multi: survey.multis.map(c => multiStats(survey, c)),
    cross: crossAnalysis(survey, items, domainsRes, basis),
    numericCross: numericCrossAnalysis(survey, survey.numerics, basis),
    associations: demographicAssociations(survey),
    prepost: prepostAnalysis(survey, basis),
    text: survey.texts.map(c => ({ key: c.key, label: c.label, ...textAnalysis(survey.values(c.key), { groups }) })),
    correlation, regression, ipa,
  };
}
