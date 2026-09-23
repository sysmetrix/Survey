import { safeJsonParse } from "../io/project.js";
export function instrumentFromSheet(sheet) {
  if (!sheet || !Array.isArray(sheet.headers) || !Array.isArray(sheet.rows)) throw new Error("문항정보 시트가 필요합니다.");
  const index = label => sheet.headers.findIndex(h=>String(h).replace(/\s/g,"") === label);
  for (const label of ["문항ID","문항명","최소값","최대값"]) if(index(label)<0) throw new Error(`문항정보 시트에 '${label}' 열이 필요합니다.`);
  const value = (row,label) => row[index(label)] ?? "";
  const items = sheet.rows.filter(row=>String(value(row,"문항ID")).trim()).map(row=>{
    const time = String(value(row,"시점")).trim();
    const reverse = String(value(row,"역채점")).trim();
    if(!["","사전","사후","pre","post"].includes(time)) throw new Error("시점은 사전·사후 또는 빈칸이어야 합니다.");
    if(!String(value(row,"문항명")).trim()) throw new Error("문항명은 비워 둘 수 없습니다.");
    if(!["","예","아니오","true","false","1","0"].includes(reverse)) throw new Error("역채점은 예·아니오로 입력하세요.");
    const min=value(row,"최소값"), max=value(row,"최대값");
    if(min==="" || max==="") throw new Error("모든 문항의 척도 최소·최대값이 필요합니다.");
    const scale={min:Number(min),max:Number(max)};
    if(!Number.isFinite(scale.min)||!Number.isFinite(scale.max)||scale.max<=scale.min) throw new Error("척도 최소·최대값을 확인하세요.");
    return {id:String(value(row,"문항ID")),label:String(value(row,"문항명")).trim(),domain:String(value(row,"영역")).trim(),time:time==="사전"?"pre":time==="사후"?"post":time,scale,reverse:["예","true","1"].includes(reverse)};
  });
  return parseInstrument(JSON.stringify({app:"survey-instrument",schema:1,metadata:{origin:"user"},items}));
}
export function instrumentFromCodebook(cb) {
  if (!cb || !Array.isArray(cb.columns) || !Array.isArray(cb.domains)) throw new Error("코드북이 필요합니다.");
  return { app: "survey-instrument", schema: 1, metadata: { ...cb.instrument, origin: "user" }, items: cb.columns.filter(c => c.role === "likert").map(c => ({ id: c.itemId || c.pairKey || c.key, label: c.label, time: c.time || "", domain: cb.domains.find(d => d.id === c.domain)?.name || "", scale: c.scale, reverse: !!c.reverse })) };
}
export function parseInstrument(text) {
  const obj = safeJsonParse(text, 2 * 1024 * 1024);
  if (!obj || obj.app !== "survey-instrument" || obj.schema !== 1 || !Array.isArray(obj.items) || !obj.items.length || obj.items.length > 1000) throw new Error("지원하는 측정도구 JSON 파일이 아닙니다.");
  const seen = new Set();
  for (const item of obj.items) {
    if (!item || typeof item.id !== "string" || !item.id || typeof item.label !== "string" || !["", "pre", "post"].includes(item.time) || !Number.isFinite(item.scale?.min) || !Number.isFinite(item.scale?.max) || item.scale.max <= item.scale.min) throw new Error("문항 ID·문구·시점·척도를 확인하세요.");
    const key = `${item.id}|${item.time}`;
    if (seen.has(key)) throw new Error("중복된 문항 ID·시점입니다.");
    seen.add(key);
  }
  return { ...obj, metadata: { ...obj.metadata, origin: "user" } };
}
export function instrumentMapping(instrument, cb) {
  return instrument.items.map(item => {
    const hits = cb.columns.filter(c => c.role === "likert" && c.label === item.label && (c.time || "") === item.time);
    return { item, key: hits.length === 1 ? hits[0].key : null, status: hits.length === 1 ? "연결 가능" : hits.length ? "중복 후보" : "문항 없음" };
  });
}
export function applyInstrument(instrument, cb) {
  const mapping = instrumentMapping(instrument, cb);
  if (mapping.some(m => !m.key)) throw new Error("모든 문항을 유일하게 연결한 뒤 적용하세요.");
  const next = structuredClone(cb);
  next.instrument = { ...instrument.metadata, origin: "user", scoring: "paired-common-half-v2", definition: structuredClone(instrument.items) };
  for (const m of mapping) {
    const c = next.columns.find(c => c.key === m.key);
    if (c.labelMap && Object.values(c.labelMap).some(v=>!Number.isFinite(v) || v<m.item.scale.min || v>m.item.scale.max)) throw new Error(`${c.label}: 기존 보기 점수와 새 척도가 다릅니다. 데이터 설정에서 점수 연결을 먼저 확인하세요.`);
    let domain = next.domains.find(d => d.name === m.item.domain);
    if (m.item.domain && !domain) { domain = { id: `I${next.domains.length + 1}`, name: m.item.domain }; next.domains.push(domain); }
    Object.assign(c, { itemId: m.item.id, instrumentVersion: next.instrument.version || "", scale: { ...m.item.scale }, reverse: !!m.item.reverse, domain: domain?.id || null });
  }
  return next;
}
export function comparisonCompatibility(a, b) {
  const reasons = [];
  for (const field of ["name", "version", "ageGroup", "scoring", "measurementTime"]) {
    if (!a.instrument?.[field] || !b.instrument?.[field]) reasons.push(`${field}: 정보 미확인`);
    else if (a.instrument[field] !== b.instrument[field]) reasons.push(`${field}: 서로 다름`);
  }
  if (a.design !== b.design) reasons.push("조사 설계가 다름");
  const signature = cb => JSON.stringify(instrumentFromCodebook(cb).items.map((i,index) => { const column=cb.columns.filter(c=>c.role==="likert")[index]; return [i.id,i.label,i.time,i.domain,i.scale?.min,i.scale?.max,i.reverse,Object.entries(column.labelMap||{}).sort(),column.missingCodes||[]]; }).sort((x,y) => JSON.stringify(x).localeCompare(JSON.stringify(y))));
  if (signature(a) !== signature(b)) reasons.push("문항·영역·척도·역채점 구성이 다름");
  return { compatible: reasons.length === 0, reasons };
}
