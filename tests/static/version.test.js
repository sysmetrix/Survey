// 버전 문자열 동기화: package.json 버전이 유일한 기준이며, 아래 각 위치는 이와 반드시 일치해야 함
// (README "버전을 올릴 때" 절차의 수동 단계를 사람이 잊어도 여기서 잡힘)
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("버전 문자열이 모든 위치에서 package.json 과 일치", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  const version = pkg.version;
  assert.ok(/^\d+\.\d+\.\d+$/.test(version), `package.json version 형식: ${version}`);

  assert.equal(lock.version, version, "package-lock.json 최상위 version");
  assert.equal(lock.packages?.[""]?.version, version, "package-lock.json packages[\"\"] version");

  const main = await readFile("js/main.js", "utf8");
  const mainVer = main.match(/export const APP_VERSION = "([^"]+)"/)?.[1];
  assert.equal(mainVer, version, "js/main.js APP_VERSION");

  const versionHistory = await readFile("js/ui/history/version.js", "utf8");
  const historyVer = versionHistory.match(/export const APP_VERSION_HISTORY = "([^"]+)"/)?.[1];
  assert.equal(historyVer, version, "js/ui/history/version.js APP_VERSION_HISTORY");

  const releases = await readFile("js/admin/releases.js", "utf8");
  const firstReleaseVer = releases.match(/version:\s*"([^"]+)"/)?.[1];
  assert.equal(firstReleaseVer, version, "js/admin/releases.js RELEASES 최신 항목(version, CURRENT_VERSION)");

  const html = await readFile("index.html", "utf8");
  const cacheBusted = [...html.matchAll(/\?v=([\d.]+)/g)].map(m => m[1]);
  assert.ok(cacheBusted.length > 0, "index.html 에 ?v= 캐시버스팅 링크가 없음");
  for (const v of cacheBusted) assert.equal(v, version, `index.html ?v=${v}`);
});
