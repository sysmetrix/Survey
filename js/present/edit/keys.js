// 슬라이드 요소 편집 키("deck:...") 파싱/생성 — 순수 문자열 처리(main.js 의 focusout 처리와
// render-custom.js 의 편집용 마크업 생성이 이 형식을 공유함).
// 형식: "deck:<슬라이드id>.<필드>"(자동 슬라이드 문구, 기존) | "deck:<슬라이드id>.el:<요소id>"(요소 전체 텍스트)
//      | "deck:<슬라이드id>.el:<요소id>.b<문단순번>"(richtext 문단·글머리) | "...el:<요소id>.td<행>-<열>"(표 칸)

export function parseDeckKey(key) {
  const rest = key.slice(5); // "deck:" 제거
  const [slideId, field = ""] = rest.split(/\.(.+)/);
  if (!field.startsWith("el:")) return { slideId, scope: "field", field };
  const elField = field.slice(3);
  const [elId, sub] = elField.split(/\.(.+)/);
  if (!sub) return { slideId, scope: "element", elId };
  let m;
  if ((m = /^b(\d+)$/.exec(sub))) return { slideId, scope: "block", elId, blockIdx: +m[1] };
  if ((m = /^td(\d+)-(\d+)$/.exec(sub))) return { slideId, scope: "cell", elId, row: +m[1], col: +m[2] };
  return { slideId, scope: "element", elId };
}

export const fieldKey = (slideId, field) => `deck:${slideId}.${field}`;
export const elKey = (slideId, elId) => `deck:${slideId}.el:${elId}`;
export const blockKey = (slideId, elId, blockIdx) => `deck:${slideId}.el:${elId}.b${blockIdx}`;
export const cellKey = (slideId, elId, row, col) => `deck:${slideId}.el:${elId}.td${row}-${col}`;
