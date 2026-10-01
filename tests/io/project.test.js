// 프로젝트 파일 읽기: 성과지표 숫자 칸 검증·잘못된 형식 거부
import test from "node:test";
import assert from "node:assert/strict";
import { parseProject } from "../../js/io/project.js";

const proj = kpis => JSON.stringify({ app: "survey-v5", schema: 2, kpis });

test("성과지표 target/actual/prevActual/sourceThreshold: 유한 숫자·숫자 문자열·null·빈칸만 유지, 나머지는 null", () => {
  const p = parseProject(proj([
    { id: "K1", target: 80, actual: "75.5", prevActual: null, sourceThreshold: "" },
    { id: "K2", target: { $gt: 1 }, actual: [1, 2], prevActual: true, sourceThreshold: "4점 이상" },
    { id: "K3", target: "  ", actual: "1e3", prevActual: -2, sourceThreshold: "<img src=x>" },
    { id: "K4", name: "숫자 칸 없음" },
  ]));
  assert.deepEqual(p.kpis[0], { id: "K1", target: 80, actual: "75.5", prevActual: null, sourceThreshold: "" });
  assert.deepEqual(p.kpis[1], { id: "K2", target: null, actual: null, prevActual: null, sourceThreshold: null });
  assert.deepEqual(p.kpis[2], { id: "K3", target: null, actual: "1e3", prevActual: -2, sourceThreshold: null });
  assert.deepEqual(p.kpis[3], { id: "K4", name: "숫자 칸 없음" }, "없는 칸은 새로 만들지 않음");
});

test("성과지표 배열 안의 객체가 아닌 항목은 버리고, 배열이 아니면 형식 오류", () => {
  assert.deepEqual(parseProject(proj([null, 3, "x", [1], { id: "K1", target: 1 }])).kpis, [{ id: "K1", target: 1 }]);
  assert.throws(() => parseProject(proj({ id: "K1" })), /kpis/);
});
