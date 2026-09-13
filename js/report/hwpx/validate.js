// HWPX 구조 검증 (순수 모듈). DOMParser 구현을 주입받는다 (브라우저: window.DOMParser, Node: @xmldom/xmldom)
/**
 * @param {{path:string, data:Uint8Array|string, store?:boolean}[]} entries  (zip 순서대로)
 * @param {new () => DOMParser} DOMParserImpl
 * @returns {string[]} 오류 목록 (비어 있으면 통과)
 */
export function validateHwpx(entries, DOMParserImpl) {
  const errors = [];
  const dec = new TextDecoder();
  const text = p => { const e = entries.find(x => x.path === p); return e ? (typeof e.data === "string" ? e.data : dec.decode(e.data)) : null; };

  if (entries[0]?.path !== "mimetype") errors.push("mimetype 이 첫 항목이 아님");
  else if (entries[0].store === false) errors.push("mimetype 이 압축됨");
  if (text("mimetype") !== "application/hwp+zip") errors.push("mimetype 내용 오류");
  for (const req of ["version.xml", "Contents/header.xml", "Contents/section0.xml", "Contents/content.hpf", "META-INF/container.xml"]) {
    if (!text(req)) errors.push(`필수 항목 없음: ${req}`);
  }

  // XML 정합성
  const docs = {};
  for (const e of entries) {
    if (!/\.(xml|hpf|rdf)$/.test(e.path)) continue;
    const src = text(e.path);
    let parseErr = null;
    const parser = new DOMParserImpl({ onError: (lvl, msg) => { if (lvl !== "warning") parseErr = msg; }, errorHandler: { error: m => { parseErr = m; }, fatalError: m => { parseErr = m; } } });
    try {
      const doc = parser.parseFromString(src, "application/xml");
      const pe = doc.getElementsByTagName("parsererror");
      if (pe && pe.length) parseErr = pe[0].textContent;
      docs[e.path] = doc;
    } catch (ex) { parseErr = ex.message; }
    if (parseErr) errors.push(`XML 파싱 오류 (${e.path}): ${String(parseErr).slice(0, 200)}`);
  }

  const header = text("Contents/header.xml") || "";
  const section = text("Contents/section0.xml") || "";
  const hpf = text("Contents/content.hpf") || "";

  // itemCnt 일치
  const lists = [["borderFills", "borderFill"], ["charProperties", "charPr"], ["paraProperties", "paraPr"], ["styles", "style"]];
  const ids = {};
  for (const [list, item] of lists) {
    const block = header.match(new RegExp(`<hh:${list} itemCnt="(\\d+)">([\\s\\S]*?)</hh:${list}>`));
    if (!block) { errors.push(`header: ${list} 없음`); continue; }
    const found = [...block[2].matchAll(new RegExp(`<hh:${item} id="(\\d+)"`, "g"))].map(m => m[1]);
    ids[item] = new Set(found);
    if (+block[1] !== found.length) errors.push(`header: ${list} itemCnt=${block[1]} 실제=${found.length}`);
    if (ids[item].size !== found.length) errors.push(`header: ${item} id 중복`);
  }

  // ID 참조 존재
  const refCheck = (attr, item, src, where) => {
    for (const m of src.matchAll(new RegExp(`\\b${attr}="(\\d+)"`, "g"))) {
      if (ids[item] && !ids[item].has(m[1])) { errors.push(`${where}: ${attr}=${m[1]} 가 header 에 없음`); break; }
    }
  };
  refCheck("paraPrIDRef", "paraPr", section, "section0");
  refCheck("charPrIDRef", "charPr", section, "section0");
  refCheck("styleIDRef", "style", section, "section0");
  refCheck("borderFillIDRef", "borderFill", section, "section0");
  refCheck("borderFillIDRef", "borderFill", header, "header");

  // 그림 참조
  const items = new Set([...hpf.matchAll(/<opf:item id="([^"]+)" href="([^"]+)"/g)].map(m => { if (m[1].startsWith("image") && !entries.some(e => e.path === m[2])) errors.push(`content.hpf: ${m[2]} 파일 없음`); return m[1]; }));
  for (const m of section.matchAll(/binaryItemIDRef="([^"]+)"/g)) {
    if (!items.has(m[1])) errors.push(`section0: binaryItemIDRef=${m[1]} 가 content.hpf 에 없음`);
  }

  // linesegarray 금지 (오래된 줄배치 정보는 손상 경고 유발)
  if (/<hp:linesegarray/.test(section)) errors.push("section0: linesegarray 포함");

  // 표 격자 검증
  const sec = docs["Contents/section0.xml"];
  if (sec) {
    const tbls = sec.getElementsByTagName("hp:tbl");
    for (let t = 0; t < tbls.length; t++) {
      const tbl = tbls[t];
      const rowCnt = +tbl.getAttribute("rowCnt"), colCnt = +tbl.getAttribute("colCnt");
      const grid = Array.from({ length: rowCnt }, () => new Array(colCnt).fill(0));
      const trs = Array.from({ length: tbl.childNodes.length }, (_, i) => tbl.childNodes[i]).filter(n => n.nodeName === "hp:tr");
      if (trs.length !== rowCnt) errors.push(`표${t + 1}: rowCnt=${rowCnt} 실제 tr=${trs.length}`);
      const tcs = tbl.getElementsByTagName("hp:tc");
      for (let i = 0; i < tcs.length; i++) {
        const tc = tcs[i];
        if (tc.parentNode?.parentNode !== tbl) continue; // 중첩 표 제외
        const addr = tc.getElementsByTagName("hp:cellAddr")[0], span = tc.getElementsByTagName("hp:cellSpan")[0];
        const c = +addr.getAttribute("colAddr"), r = +addr.getAttribute("rowAddr");
        const cs = +span.getAttribute("colSpan"), rs = +span.getAttribute("rowSpan");
        for (let y = r; y < r + rs; y++) for (let x = c; x < c + cs; x++) {
          if (y >= rowCnt || x >= colCnt) { errors.push(`표${t + 1}: 셀 범위 초과 (${r},${c})`); continue; }
          grid[y][x]++;
        }
      }
      if (grid.some(row => row.some(v => v !== 1))) errors.push(`표${t + 1}: 셀 격자가 겹치거나 비어 있음`);
    }
  }
  return errors;
}
