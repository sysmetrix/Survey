// 파일 → Dataset {fileName, source, sheets:[{name, headers, rows}]}
// XLSX(SheetJS)·Papa(PapaParse)는 인자로 주입 (브라우저 전역 / Node require)
import { isBlank } from "../core/util.js";

/** 바이트 → 문자열 (BOM → UTF-8 → EUC-KR 순) */
export function decodeText(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) return new TextDecoder("utf-8").decode(u8.subarray(3));
  if (u8[0] === 0xFF && u8[1] === 0xFE) return new TextDecoder("utf-16le").decode(u8.subarray(2));
  try { return new TextDecoder("utf-8", { fatal: true }).decode(u8); }
  catch { return new TextDecoder("euc-kr").decode(u8); }
}

const HEADER_HINT = /타임스탬프|timestamp|응답\s*일시|제출\s*일시|번호|성별|학년|no\.?$/i;

/** 제목·안내 행을 건너뛰고 헤더 행 찾기 (앞 10행 중 비어있지 않은 문자열이 가장 많은 행) */
export function findHeaderRow(matrix) {
  let best = 0, bestScore = -1;
  const limit = Math.min(10, matrix.length);
  for (let i = 0; i < limit; i++) {
    const row = matrix[i] || [];
    const filled = row.filter(v => !isBlank(v));
    const strings = filled.filter(v => typeof v === "string" && !/^\d+(\.\d+)?$/.test(v.trim())).length;
    let score = strings * 2 + filled.length;
    if (row.some(v => HEADER_HINT.test(String(v ?? "")))) score += 5;
    // 다음 행이 채워져 있어야 헤더
    const next = matrix[i + 1] || [];
    if (next.filter(v => !isBlank(v)).length < Math.max(1, filled.length * 0.3)) score -= 10;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

/** 2차원 배열 → 시트 (헤더 정리, 빈 행 제거, 중복 헤더 번호 부여) */
export function matrixToSheet(name, matrix) {
  const m = matrix.filter(r => Array.isArray(r));
  if (!m.length) return { name, headers: [], rows: [] };
  const h = findHeaderRow(m);
  const rawHeaders = m[h].map(v => (isBlank(v) ? "" : String(v).replace(/\s+/g, " ").trim()));
  // 뒤쪽 완전 빈 열 제거
  const body = m.slice(h + 1).filter(r => r.some(v => !isBlank(v)));
  let width = rawHeaders.length;
  while (width > 0 && !rawHeaders[width - 1] && body.every(r => isBlank(r[width - 1]))) width--;
  const seen = new Map();
  const headers = rawHeaders.slice(0, width).map((hd, i) => {
    const base = hd || `열${i + 1}`;
    const k = (seen.get(base) || 0) + 1;
    seen.set(base, k);
    return k > 1 ? `${base} (${k})` : base;
  });
  const rows = body.map(r => headers.map((_, i) => {
    const v = r[i];
    if (isBlank(v)) return null;
    return typeof v === "string" ? v.trim() : v;
  }));
  return { name, headers, rows };
}

export function detectSource(sheets) {
  const hs = sheets.flatMap(s => s.headers.slice(0, 3)).join(" ");
  if (/타임스탬프|Timestamp/.test(hs)) return "google";
  if (/응답\s*일시|제출\s*일시|응답\s*시작/.test(hs)) return "naver";
  return "file";
}

/** CSV/TSV 바이트 파싱 */
export function parseCsv(bytes, fileName, Papa) {
  const text = decodeText(bytes);
  const res = Papa.parse(text, { header: false, skipEmptyLines: "greedy", dynamicTyping: false });
  const sheet = matrixToSheet(fileName.replace(/\.[^.]+$/, ""), res.data);
  return { fileName, source: detectSource([sheet]), sheets: [sheet] };
}

/** XLSX/XLS 바이트 파싱 (모든 시트) */
export function parseWorkbook(bytes, fileName, XLSX) {
  const wb = XLSX.read(bytes, { type: "array", cellDates: true, dense: false });
  const sheets = wb.SheetNames.map(name => {
    const ws = wb.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true, blankrows: false });
    return matrixToSheet(name, matrix);
  }).filter(s => s.headers.length);
  return { fileName, source: detectSource(sheets), sheets };
}

/** 확장자만으로 SheetJS(XLSX)가 필요한 파일인지 (미리 받아올지 결정하는 쪽에서 씀) */
export const isWorkbookExt = fileName => ["xlsx", "xls", "xlsm"].includes(fileName.split(".").pop().toLowerCase());

/** 확장자에 따라 파싱 */
export function parseFile(bytes, fileName, { XLSX, Papa }) {
  const ext = fileName.split(".").pop().toLowerCase();
  if (ext === "csv" || ext === "tsv" || ext === "txt") return parseCsv(bytes, fileName, Papa);
  if (ext === "xlsx" || ext === "xls" || ext === "xlsm") return parseWorkbook(bytes, fileName, XLSX);
  throw new Error("지원하지 않는 파일 형식입니다 (.xlsx .xls .csv .tsv)");
}
