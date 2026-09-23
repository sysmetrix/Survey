/** 문항 짝 검증은 권한과 무관한 계산 정책이다. */
export function pairQuality(columns) {
  const groups = new Map(), issues = [];
  const add = (code, msg, items) => issues.push({ level: "error", code, msg, keys: items.map(c => c.key) });
  for (const c of columns.filter(c => ["likert", "nps", "numeric"].includes(c.role) && ["pre", "post"].includes(c.time))) {
    if (!c.pairKey) { add("pair-key-missing", "문항 연결 ID가 없습니다.", [c]); continue; }
    if (!groups.has(c.pairKey)) groups.set(c.pairKey, []);
    groups.get(c.pairKey).push(c);
  }
  for (const items of groups.values()) {
    const a = items.filter(c => c.time === "pre"), b = items.filter(c => c.time === "post");
    if (!a.length || !b.length) { add("pair-missing", "사전 또는 사후 문항이 누락되었습니다.", items); continue; }
    if (a.length !== 1 || b.length !== 1) { add("pair-duplicate", "문항 연결 ID가 중복되었습니다.", items); continue; }
    if (items.some(c => c.role === "likert" && (!Number.isFinite(c.scale?.min) || !Number.isFinite(c.scale?.max) || c.scale.max <= c.scale.min))) add("scale-invalid", "척도 범위를 확인할 수 없습니다.", items);
    if (a[0].scale?.min !== b[0].scale?.min || a[0].scale?.max !== b[0].scale?.max) add("scale-mismatch", "사전·사후 척도 범위가 다릅니다.", items);
    if (!!a[0].reverse !== !!b[0].reverse) add("reverse-mismatch", "사전·사후 역채점 설정이 다릅니다.", items);
    if (a[0].instrumentVersion !== b[0].instrumentVersion) add("version-mismatch", "사전·사후 측정도구 버전이 다릅니다.", items);
    if (a[0].itemId !== b[0].itemId) add("item-mismatch", "사전·사후 원본 문항 ID가 다릅니다.", items);
  }
  return issues;
}
