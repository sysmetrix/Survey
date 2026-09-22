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

// 카톡 대화창에서 이 카드는 폭 250px 남짓으로 줄어 보인다(1200px → 약 1/5).
// 그래서 글자는 크게, 줄 수는 적게 둔다 — 작게 넣은 설명줄은 대화창에서 아예 읽히지 않는다.
// 가운데 정렬로 둔 것도 같은 이유: 카드가 정사각형으로 잘려 보이는 목록에서도 도안과 제목이 남는다.
const FONT = "'Pretendard GOV Variable','Pretendard GOV',Pretendard,'맑은 고딕','Malgun Gothic',sans-serif";

const TITLE = "설문 분석 · 평가 도구";
const SUB = "엑셀 설문 → 통계 분석 · HWPX 결과보고서";

const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function ogSvg() {
  const MARK = 250;
  const { defs, body } = markParts({ variant: "full", id: "og", box: [(W - MARK) / 2, 72, MARK, MARK] });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs>` +
      `<linearGradient id="og-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3F7FB"/><stop offset=".55" stop-color="#DCE7F2"/><stop offset="1" stop-color="#BBCFE2"/></linearGradient>` +
      `<radialGradient id="og-glow" cx=".5" cy=".16" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
      defs +
    `</defs>` +
    `<rect width="${W}" height="${H}" fill="url(#og-bg)"/>` +
    `<rect width="${W}" height="${H}" fill="url(#og-glow)"/>` +
    `<rect x="0" y="${H - 12}" width="${W}" height="12" fill="#3B5A7A"/>` +
    body +
    `<g font-family="${FONT}" text-anchor="middle">` +
      `<text x="${W / 2}" y="440" font-size="90" font-weight="800" letter-spacing="-3" fill="#14283A">${esc(TITLE)}</text>` +
      `<text x="${W / 2}" y="516" font-size="42" font-weight="500" fill="#3B5A7A">${esc(SUB)}</text>` +
    `</g></svg>\n`;
}

const [png] = await rasterizeTransparent([{ svg: ogSvg(), width: W, height: H, scale: 1 }]);
const info = pngAlphaInfo(png);
if (info.w !== W || info.h !== H) throw new Error(`크기가 ${info.w}×${info.h} 로 나왔습니다(${W}×${H} 이어야 함)`);
// corners 가 null 이면 알파 없는 PNG(이미 불투명), 있으면 네 모서리 알파가 255 여야 한다
if (info.corners?.some(([, , , a]) => a !== 255)) throw new Error("배경이 비쳐 보입니다 — 공유 카드는 불투명해야 합니다");
await writeFile(OUT, png);
console.log(`OK ${OUT}  ${W}×${H}  ${(png.length / 1024).toFixed(0)}KB`);
