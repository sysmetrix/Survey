import test from "node:test";
import assert from "node:assert/strict";
import { instrumentFromCodebook, instrumentFromSheet, parseInstrument, instrumentMapping, applyInstrument, comparisonCompatibility } from "../../js/evaluation/instrument.js";
const cb = () => ({ design:"single", instrument:{name:"협업",version:"2026",ageGroup:"중기",scoring:"paired-common-half-v2",measurementTime:"종료 직후"},domains:[{id:"D",name:"협업"}],columns:[{key:"Q",label:"함께 계획한다",role:"likert",scale:{min:1,max:5},domain:"D"}] });
test("XLSX 문항정보 계약: 명시적 척도·시점·역채점만 불러오며 누락은 거부", () => {
  const sheet={headers:["문항ID","문항명","시점","영역","최소값","최대값","역채점"],rows:[["q1","협업한다","사전","협업",1,5,"아니오"],["q1","협업한다","사후","협업",1,5,"아니오"]]};
  const result=instrumentFromSheet(sheet);
  assert.equal(result.items[0].time,"pre");
  assert.equal(result.items[1].time,"post");
  assert.equal(result.items[0].reverse,false);
  sheet.rows[0][4]="";
  assert.throws(()=>instrumentFromSheet(sheet),/최소/);
  assert.throws(()=>parseInstrument("null"),/지원/);
  assert.throws(()=>instrumentFromCodebook(null),/코드북/);
});
test("문항 세트 저장·검증·미리보기·적용은 원본을 변경하지 않는다", () => {
  const source=cb(), serialized=JSON.stringify(source);
  const instrument=parseInstrument(JSON.stringify(instrumentFromCodebook(source)));
  assert.equal(instrumentMapping(instrument,source)[0].key,"Q");
  const applied=applyInstrument(instrument,source);
  assert.equal(applied.columns[0].instrumentVersion,"2026");
  assert.equal(applied.instrument.origin,"user");
  assert.equal(JSON.stringify(source),serialized);
});
test("모호한 문항 연결은 적용을 막는다", () => {
  const source=cb(), instrument=instrumentFromCodebook(source);
  source.columns.push({...source.columns[0],key:"R"});
  assert.throws(()=>applyInstrument(instrument,source),/유일/);
});
test("비교는 버전·대상·문항 내용 변경 또는 정보 누락 시 거부한다", () => {
  assert.equal(comparisonCompatibility(cb(),cb()).compatible,true);
  for(const field of ["version","ageGroup","scoring","measurementTime"]) {
    const other=cb(); other.instrument[field]="";
    assert.equal(comparisonCompatibility(cb(),other).compatible,false);
  }
  const other=cb(); other.columns[0].scale.max=7;
  assert.equal(comparisonCompatibility(cb(),other).compatible,false);
});
