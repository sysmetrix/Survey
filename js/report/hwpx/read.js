// HWPX(zip) 본문 읽기 — 순수 모듈. JSZip·DOMParser 구현을 주입받는다 (브라우저: window.JSZip/window.DOMParser, Node: 벤더 JSZip + @xmldom/xmldom)
const MAX_SECTIONS = 20;

/** el 하위 텍스트(hp:t)를 모두 이어붙이되, 표(hp:tbl) 안쪽으로는 내려가지 않음(표는 별도로 처리) */
function textOf(el) {
  let s = "";
  const walk = node => {
    if (node.nodeName === "hp:tbl") return;
    if (node.nodeName === "hp:t") { s += node.textContent || ""; return; }
    const kids = node.childNodes || [];
    for (let i = 0; i < kids.length; i++) walk(kids[i]);
  };
  walk(el);
  return s;
}

function cellText(tc) {
  const paras = [];
  const ps = tc.getElementsByTagName("hp:p");
  for (let i = 0; i < ps.length; i++) {
    const s = textOf(ps[i]);
    if (s) paras.push(s);
  }
  return paras.join("\n");
}

function readTable(tbl) {
  const rowCnt = +tbl.getAttribute("rowCnt"), colCnt = +tbl.getAttribute("colCnt");
  if (!rowCnt || !colCnt) return null;
  const grid = Array.from({ length: rowCnt }, () => new Array(colCnt).fill(""));
  const tcs = tbl.getElementsByTagName("hp:tc");
  for (let i = 0; i < tcs.length; i++) {
    const tc = tcs[i];
    if (tc.parentNode?.parentNode !== tbl) continue; // 중첩 표(다른 표의 셀) 제외
    const addr = tc.getElementsByTagName("hp:cellAddr")[0], span = tc.getElementsByTagName("hp:cellSpan")[0];
    if (!addr || !span) continue;
    const c = +addr.getAttribute("colAddr"), r = +addr.getAttribute("rowAddr");
    const cs = +span.getAttribute("colSpan") || 1, rs = +span.getAttribute("rowSpan") || 1;
    const text = cellText(tc);
    for (let y = r; y < r + rs && y < rowCnt; y++) for (let x = c; x < c + cs && x < colCnt; x++) grid[y][x] = text;
  }
  return { headers: grid[0], rows: grid.slice(1) };
}

function hasTableAncestor(node) {
  for (let n = node.parentNode; n; n = n.parentNode) if (n.nodeName === "hp:tbl") return true;
  return false;
}

function readSection(doc) {
  const paragraphs = [];
  const tables = [];
  const tbls = doc.getElementsByTagName("hp:tbl");
  for (let i = 0; i < tbls.length; i++) {
    if (hasTableAncestor(tbls[i])) continue; // 중첩 표는 상위 표의 셀 텍스트에 포함되므로 별도 취급 안 함
    const t = readTable(tbls[i]);
    if (t) tables.push(t);
  }
  const ps = doc.getElementsByTagName("hp:p");
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (hasTableAncestor(p)) continue; // 표 안 문단은 위에서 표로 처리됨
    const s = textOf(p).trim();
    if (s) paragraphs.push(s);
  }
  return { paragraphs, tables };
}

/**
 * @param {Uint8Array} bytes
 * @param {{JSZip: any, DOMParser: new (opts?:object) => DOMParser}} deps
 * @returns {Promise<{paragraphs: string[], tables: {headers:string[], rows:string[][]}[]}>}
 */
export async function readHwpxText(bytes, { JSZip, DOMParser }) {
  let zip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error("NOT_HWPX");
  }
  const mimetype = zip.file("mimetype");
  if (!mimetype || (await mimetype.async("string")).trim() !== "application/hwp+zip") throw new Error("NOT_HWPX");

  const paragraphs = [];
  const tables = [];
  for (let i = 0; i < MAX_SECTIONS; i++) {
    const entry = zip.file(`Contents/section${i}.xml`);
    if (!entry) break;
    let xml;
    try {
      xml = await entry.async("string");
    } catch {
      continue;
    }
    let doc;
    try {
      doc = new DOMParser().parseFromString(xml, "application/xml");
      if (doc.getElementsByTagName("parsererror").length) continue;
    } catch {
      continue;
    }
    const sec = readSection(doc);
    paragraphs.push(...sec.paragraphs);
    tables.push(...sec.tables);
  }
  return { paragraphs, tables };
}
