// 아이콘 도안: 아이소메트릭 3D 막대 3개 (설문 분석 · 결과 평가). 순수 SVG 문자열 생성기 — 브라우저·Node 모두에서 동작.
//
//  · 막대 3개가 왼쪽 앞(낮음) → 오른쪽 뒤(높음)로 오르는 모양. 위 = 밝은 윗면, 왼쪽 = 브랜드 청색 앞면, 오른쪽 = 짙은 남색 옆면.
//  · 가장 높은 막대의 윗면만 강조색(#2a78d6 계열 하늘색)으로 빛나는 포인트.
//  · 도형만 사용(선형 그라디언트·불투명도·둥근 선 모서리). 필터를 쓰지 않아 어떤 렌더러에서도 동일하게 그려진다.
//  · variant "full"  : 512 전용. 접지 그림자 + 테두리 하이라이트 + 글린트.
//    variant "small" : 16~48px 파비콘·상단바 로고용. 막대를 굵게, 틈을 좁게, 면 3개 톤 위주로 단순화.

const A = Math.atan(0.5), C = Math.cos(A), S = Math.sin(A); // 2:1 다이메트릭 축(≈26.57°) — 픽셀 격자에 잘 맞아 작은 크기에서 모서리가 또렷하다
/** (u,v,z) → 화면 좌표. u: 오른쪽 위 방향(막대가 늘어선 축), v: 오른쪽 아래 방향(막대 폭), z: 높이 */
const P = (u, v, z) => [(u + v) * C, (v - u) * S - z];
const f = n => +n.toFixed(2);
const pts = arr => arr.map(([x, y]) => `${f(x)},${f(y)}`).join(" ");

const VARIANTS = {
  full: { w: 104, dpt: 104, pitch: 140, heights: [118, 196, 278], ro: 8, shadow: true, rim: true, glint: true },
  small: { w: 116, dpt: 116, pitch: 126, heights: [84, 148, 214], ro: 6, shadow: false, rim: false, glint: false },
};

/** 팔레트 (어두운·밝은 배경 양쪽에서 읽히도록 윗면은 밝게, 옆면은 너무 어둡지 않게) */
const PAL = {
  top: ["#DCEAF8", "#A9C6E3"],
  left: ["#94B6D6", "#48698D"],
  right: ["#3B5A7A", "#22394F"],
  accentTop: ["#B6F0FF", "#3E9BEA"],
  accentEdge: "#2A78D6",
};

/**
 * @param {{variant?:"full"|"small", id?:string, box:[number,number,number,number], shadowBox?:boolean}} o
 *   box = [x, y, w, h] 도안(막대)이 들어갈 영역(캔버스 좌표). 영역 안에 비율을 유지해 가운데 맞춤.
 * @returns {{defs:string, body:string}} <defs> 안쪽 내용과 그리기 내용
 */
export function markParts({ variant = "full", id = "m", box }) {
  const V = VARIANTS[variant];
  const { w, dpt, pitch, heights, ro } = V;
  const n = heights.length;
  const uEnd = (n - 1) * pitch + dpt;

  // 모델 경계 (막대 실루엣 꼭짓점)
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (let i = 0; i < n; i++) for (const [u, v, z] of [[i * pitch, 0, 0], [i * pitch, w, 0], [i * pitch + dpt, w, 0], [i * pitch + dpt, 0, heights[i]], [i * pitch, 0, heights[i]], [i * pitch, w, heights[i]], [i * pitch + dpt, w, heights[i]]]) {
    const [x, y] = P(u, v, z); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const mw = maxX - minX, mh = maxY - minY;
  const k = Math.min(box[2] / mw, box[3] / mh);
  const tx = box[0] + (box[2] - mw * k) / 2 - minX * k, ty = box[1] + (box[3] - mh * k) / 2 - minY * k;

  const g = (name, [a, b], x2 = 0, y2 = 1) => `<linearGradient id="${id}-${name}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  let defs = g("top", PAL.top, 1, 1) + g("left", PAL.left) + g("right", PAL.right) + g("atop", PAL.accentTop, 1, 1);
  if (V.shadow) defs += `<radialGradient id="${id}-sh"><stop offset="0" stop-color="#0E2036" stop-opacity=".42"/><stop offset=".55" stop-color="#0E2036" stop-opacity=".2"/><stop offset="1" stop-color="#0E2036" stop-opacity="0"/></radialGradient>`;
  if (V.glint) defs += `<radialGradient id="${id}-gl"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".4" stop-color="#CFF3FF" stop-opacity=".55"/><stop offset="1" stop-color="#7FD3FF" stop-opacity="0"/></radialGradient>`;

  let body = "";
  if (V.shadow) {
    // 바닥 그림자: 발자국(u×v 평면) 위 타원을 아이소 행렬로 옮김 — 오른쪽 아래로 약간 치우침
    const cu = uEnd / 2 + 8, cv = w / 2 + 26;
    const [ex, ey] = P(cu, cv, 0);
    body += `<ellipse cx="0" cy="0" rx="${f(uEnd * .62)}" ry="${f(w * .92)}" fill="url(#${id}-sh)" transform="matrix(${f(C)} ${f(-S)} ${f(C)} ${f(S)} ${f(ex)} ${f(ey)})"/>`;
  }

  // 뒤(높은 막대)에서 앞(낮은 막대) 순으로 그린다. 각 막대는 ro 만큼 안쪽으로 줄인 상자를 둥근 선(2·ro)으로 부풀려 모서리를 둥글게 만든다.
  const sw = f(ro * 2);
  for (let i = n - 1; i >= 0; i--) {
    const u0 = i * pitch + ro, u1 = i * pitch + dpt - ro, v0 = ro, v1 = w - ro, z0 = ro, z1 = heights[i] - ro;
    const top = i === n - 1;
    const left = pts([P(u0, v0, z0), P(u0, v1, z0), P(u0, v1, z1), P(u0, v0, z1)]);
    const right = pts([P(u0, v1, z0), P(u1, v1, z0), P(u1, v1, z1), P(u0, v1, z1)]);
    const cap = pts([P(u0, v0, z1), P(u0, v1, z1), P(u1, v1, z1), P(u1, v0, z1)]);
    const face = (poly, fill) => `<polygon points="${poly}" fill="url(#${id}-${fill})" stroke="url(#${id}-${fill})" stroke-width="${sw}" stroke-linejoin="round"/>`;
    body += `<g>${face(left, "left")}${face(right, "right")}${face(cap, top ? "atop" : "top")}`;
    if (V.rim) {
      // 윗면 가장자리 하이라이트 + 앞쪽 모서리(왼·오른 면 경계)의 빛 선
      const [ax, ay] = P(u0, v0, z1), [bx, by] = P(u0, v1, z1), [cx, cy] = P(u1, v1, z1);
      body += `<polyline points="${f(ax)},${f(ay)} ${f(bx)},${f(by)} ${f(cx)},${f(cy)}" fill="none" stroke="#fff" stroke-opacity="${top ? .8 : .6}" stroke-width="${f(ro * .34)}" stroke-linecap="round" stroke-linejoin="round" transform="translate(${f(-ro * .05)} ${f(-ro * .55)})"/>`;
      const [dx, dy] = P(u0, v1, z0 + ro * .5), [ex2, ey2] = P(u0, v1, z1 - ro * .5);
      body += `<line x1="${f(dx)}" y1="${f(dy)}" x2="${f(ex2)}" y2="${f(ey2)}" stroke="#fff" stroke-opacity=".28" stroke-width="${f(ro * .3)}" stroke-linecap="round" transform="translate(${f(ro * .25)} 0)"/>`;
    }
    body += `</g>`;
    if (V.glint && top) {
      // 강조 막대 윗면 위 반짝임
      const [gx, gy] = P((u0 + u1) / 2, (v0 + v1) / 2, z1);
      const r = w * .5;
      body += `<circle cx="${f(gx)}" cy="${f(gy)}" r="${f(r)}" fill="url(#${id}-gl)"/>`;
      const a = w * .62, b = w * .07;
      body += `<path d="M${f(gx)} ${f(gy - a)}L${f(gx + b)} ${f(gy - b)}L${f(gx + a)} ${f(gy)}L${f(gx + b)} ${f(gy + b)}L${f(gx)} ${f(gy + a)}L${f(gx - b)} ${f(gy + b)}L${f(gx - a)} ${f(gy)}L${f(gx - b)} ${f(gy - b)}Z" fill="#fff" fill-opacity=".92"/>`;
    }
  }
  return { defs, body: `<g transform="translate(${f(tx)} ${f(ty)}) scale(${f(k)})">${body}</g>` };
}

const wrap = (size, defs, body, extra = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${defs ? `<defs>${defs}</defs>` : ""}${extra}${body}</svg>\n`;

/** 투명 배경 본 아이콘 (purpose any) */
export function iconSvg() {
  const { defs, body } = markParts({ variant: "full", id: "i", box: [36, 40, 440, 420] });
  return wrap(512, defs, body);
}

/** 투명 배경 소형(파비콘·상단바 로고) */
export function smallSvg(id = "s") {
  const { defs, body } = markParts({ variant: "small", id, box: [1, 1, 30, 30] });
  return wrap(32, defs, body);
}

/** 불투명 배경 + 안전영역(중앙 지름 80% 원) 안의 도안 — 마스커블 / iOS 홈 화면용 */
export function tileSvg({ mark = 0.64, corner = 0, bg: withBg = true } = {}) {
  const box = 512 * mark;
  const { defs, body } = markParts({ variant: "full", id: "t", box: [(512 - box) / 2, (512 - box) / 2 - 4, box, box] });
  const bgDefs = `<linearGradient id="t-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3F7FB"/><stop offset=".55" stop-color="#DCE7F2"/><stop offset="1" stop-color="#BBCFE2"/></linearGradient><radialGradient id="t-glow" cx=".3" cy=".22" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
  const bg = `<rect width="512" height="512"${corner ? ` rx="${corner}"` : ""} fill="url(#t-bg)"/><rect width="512" height="512"${corner ? ` rx="${corner}"` : ""} fill="url(#t-glow)"/>`;
  return withBg ? wrap(512, bgDefs + defs, body, bg) : wrap(512, defs, body); // bg:false 는 안전영역 검사용(도안만)
}
