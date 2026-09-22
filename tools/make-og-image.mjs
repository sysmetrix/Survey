// 공유 썸네일(Open Graph) 이미지 생성기 — 실행: npm run og  (= node tools/make-og-image.mjs)
//
// 카카오톡·슬랙·페이스북 등에 주소를 붙여 넣었을 때 보이는 1200×630 카드 이미지를 만든다.
// 결과: icons/og-image.png  (index.html 의 og:image 가 가리키는 파일)
//
// 아이콘 생성기(tools/make-icons.mjs)와 따로 두는 이유: 이 카드에는 글자가 들어가서 결과 PNG 가
// 그 PC에 깔린 글꼴에 따라 조금씩 달라진다. 아이콘 쪽은 "같은 입력이면 같은 출력"을 지키고 있으므로
// 섞지 않는다 — 이 파일은 도안·문구를 바꿀 때만 다시 실행하면 된다.
import { writeFile } from "node:fs/promises";
import { markParts } from "./lib/icon-art.mjs";
import { rasterizeTransparent } from "./lib/rasterize-cdp.mjs";
import { pngAlphaInfo } from "./lib/png-read.mjs";

const W = 1200, H = 630;
const OUT = "icons/og-image.png";

// 카카오톡 등은 카드 가장자리를 조금 잘라 보여줄 수 있어, 글자는 안쪽 여백 안에만 둔다
const PAD = 72;
const FONT = "'Pretendard GOV Variable','Pretendard GOV',Pretendard,'맑은 고딕','Malgun Gothic',sans-serif";

const TITLE = "설문 분석 · 평가 도구";
const LINES = [
  "엑셀 설문 → 통계 분석 · 성과지표 평가",
  "한글(HWPX) 결과보고서 · 발표 슬라이드까지",
];
const FOOT = "브라우저에서 바로 · 설치 없이 · 자료는 이 컴퓨터를 벗어나지 않습니다";

const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function ogSvg() {
  const { defs, body } = markParts({ variant: "full", id: "og", box: [PAD, 168, 300, 300] });
  const textX = PAD + 300 + 64;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs>` +
      `<linearGradient id="og-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3F7FB"/><stop offset=".55" stop-color="#DCE7F2"/><stop offset="1" stop-color="#BBCFE2"/></linearGradient>` +
      `<radialGradient id="og-glow" cx=".26" cy=".18" r=".85"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
      defs +
    `</defs>` +
    `<rect width="${W}" height="${H}" fill="url(#og-bg)"/>` +
    `<rect width="${W}" height="${H}" fill="url(#og-glow)"/>` +
    `<rect x="0" y="${H - 10}" width="${W}" height="10" fill="#3B5A7A"/>` +
    body +
    `<g font-family="${FONT}" fill="#14283A">` +
      `<text x="${textX}" y="252" font-size="66" font-weight="800" letter-spacing="-2">${esc(TITLE)}</text>` +
      LINES.map((t, i) => `<text x="${textX}" y="${330 + i * 54}" font-size="36" font-weight="500" fill="#33506E">${esc(t)}</text>`).join("") +
      `<text x="${textX}" y="${330 + LINES.length * 54 + 26}" font-size="26" font-weight="400" fill="#5C748C">${esc(FOOT)}</text>` +
    `</g></svg>\n`;
}

const [png] = await rasterizeTransparent([{ svg: ogSvg(), width: W, height: H, scale: 1 }]);
const info = pngAlphaInfo(png);
if (info.w !== W || info.h !== H) throw new Error(`크기가 ${info.w}×${info.h} 로 나왔습니다(${W}×${H} 이어야 함)`);
// corners 가 null 이면 알파 없는 PNG(이미 불투명), 있으면 네 모서리 알파가 255 여야 한다
if (info.corners?.some(([, , , a]) => a !== 255)) throw new Error("배경이 비쳐 보입니다 — 공유 카드는 불투명해야 합니다");
await writeFile(OUT, png);
console.log(`OK ${OUT}  ${W}×${H}  ${(png.length / 1024).toFixed(0)}KB`);
