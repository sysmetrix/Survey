import test from "node:test";
import assert from "node:assert/strict";
import { filterUsageRows, operationalKpis, operationalFunnel, distributionKpis, csvForStats } from "../../js/ui/views/admin/stats-advanced.js";

const rows = [
  { day: "2026-09-01", view: "load", event: "view_enter", count: 10, distinct_sessions: 10, org: "A", src: "mail", app_version: "5.47.0", device: "PC", browser: "Chrome" },
  { day: "2026-09-01", view: "dash", event: "analysis_complete", count: 6, distinct_sessions: 6, org: "A", src: "mail", app_version: "5.47.0", device: "PC", browser: "Chrome" },
  { day: "2026-09-01", view: "report", event: "export_error", count: 1, distinct_sessions: 1, org: "A", src: "mail", app_version: "5.47.0", device: "PC", browser: "Chrome" },
];

test("stats filters keep only the requested dimensions", () => {
  assert.equal(filterUsageRows(rows, { org: "A", device: "PC" }).length, 3);
  assert.equal(filterUsageRows(rows, { event: "analysis_complete" }).length, 1);
});

test("operational KPIs calculate analysis completion and error rate", () => {
  const k = Object.fromEntries(operationalKpis(rows).map(x => [x.key, x]));
  assert.equal(k.visits.value, 10);
  assert.equal(k.analysis.value, 6);
  assert.equal(k.completion.value, 60);
  assert.equal(k.errors.value, 1);
  assert.equal(k.errorRate.value, 10);
});

test("CSV export excludes anonymous identifiers and escapes cells", () => {
  const csv = csvForStats([{ ...rows[0], org: 'A,"B', anon_id: "secret" }]);
  assert.match(csv, /"A,""B/);
  assert.doesNotMatch(csv, /anon_id|secret/);
});

test("operational funnel reports step conversion", () => {
  const funnel = operationalFunnel([
    rows[0], { ...rows[0], event: "file_load", count: 8, distinct_sessions: 8 },
    rows[1], { ...rows[1], view: "report", event: "report_complete", count: 3, distinct_sessions: 3 },
  ]);
  assert.deepEqual(funnel.map(x => x.value), [10, 8, 6, 3]);
  assert.equal(funnel[1].rate, 80);
  assert.equal(funnel[3].rate, 50);
});

test("distribution KPIs report active organizations and latest-version share", () => {
  const k = Object.fromEntries(distributionKpis([{ org: "A" }, { org: "B" }, { org: "(미상)" }], [{ version: "5.47.0", distinct_sessions: 8 }, { version: "5.46.0", distinct_sessions: 2 }], "5.47.0").map(x => [x.key, x]));
  assert.equal(k.activeOrgs.value, 2);
  assert.equal(k.latestVersion.value, 80);
});
