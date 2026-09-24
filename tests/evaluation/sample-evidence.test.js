import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { parseKpiSheet } from "../../js/evaluation/business-sheet.js";
import { METRICS } from "../../js/evaluation/kpi.js";
import { validateKpiEvidence } from "../../js/evaluation/reference-evidence.js";

const require = createRequire(import.meta.url);
const XLSX = require("../../vendor/xlsx-0.20.3.full.min.js");

const CASES = [
  ["2026_진로탐색_사전사후.xlsx", 5, "K6"],
  ["2026_참여위원회_회고식.xlsx", 5, "K6"],
  ["2026_리더십캠프_사전사후_한시트.xlsx", 5, "K6"],
  ["2026_생태탐험_7점척도_NPS.xlsx", 5, null],
];

test("근거가 적합한 XLSX 샘플만 검토 완료 상태로 제공한다", async () => {
  for (const [file, validCount, intentionallyBlank] of CASES) {
    const wb = XLSX.read(await readFile(new URL(`../../samples/${file}`, import.meta.url)), { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets["성과지표"], { header: 1, defval: "" });
    const kpis = parseKpiSheet({ headers: rows[0], rows: rows.slice(1) }, { goals: [] });
    const valid = kpis.filter(kpi => validateKpiEvidence(kpi, METRICS[kpi.metric].kind).valid);
    assert.equal(valid.length, validCount, `${file}: 검증된 근거 수`);
    if (intentionallyBlank) {
      const kpi = kpis.find(item => item.id === intentionallyBlank);
      assert.equal(kpi.evidenceRef, "", `${file}: 단순 만족도에는 근거를 강제하지 않음`);
      assert.equal(kpi.evidenceReviewed, false);
    }
  }
});
