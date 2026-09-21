// PWA 아이콘·파비콘 생성기 — 실행: npm run icons  (= node tools/make-icons.mjs)
//
// 도안: 아이소메트릭 3D 막대 3개(투명 배경). 도안 코드는 tools/lib/icon-art.mjs, 래스터화는 tools/lib/rasterize-cdp.mjs
// (설치된 Edge/Chrome 헤드리스 + 투명 배경 스크린샷). 같은 입력이면 항상 같은 출력이 나온다(멱등).
//
// 생성물 (모두 icons/ 아래):
//   icon.svg                 투명 배경 본 아이콘 (manifest purpose any)
//   favicon.svg              투명 배경 소형 단순화판 (탭 아이콘 · 상단바 로고 · 16~48px)
//   icon-maskable.svg        불투명 배경 + 안전영역(중앙 지름 80% 원) 안의 도안
//   icon-192.png / icon-512.png            icon.svg 의 투명 PNG
//   icon-maskable-512.png    icon-maskable.svg (불투명, 전체 채움)
//   apple-touch-icon.png     180×180 불투명 — iOS 는 투명 영역을 검정으로 채우므로 옅은 배경을 깔고 도안을 더 크게(모서리는 iOS 가 자름)
//   favicon-16.png / favicon-32.png / favicon-48.png   favicon.svg 를 각 크기로 직접 래스터화(투명)
//   favicon.ico              16·32·48 PNG 를 담은 ICO
//
// 투명이어야 하는 파일(icon-192/512, favicon-*)은 생성 직후 IHDR 색상 유형 6(RGBA)과 네 모서리 알파 0 을 검사하고,
// 불투명이어야 하는 파일(maskable, apple-touch)은 알파가 없는 RGB PNG(유형 2)이거나 알파 255 여야 한다. 어긋나면 오류로 종료한다.
import { writeFile } from "node:fs/promises";
import { iconSvg, smallSvg, tileSvg } from "./lib/icon-art.mjs";
import { rasterizeTransparent } from "./lib/rasterize-cdp.mjs";
import { pngAlphaInfo } from "./lib/png-read.mjs";

const sized = (svg, px) => svg.replace("<svg ", `<svg width="${px}" height="${px}" `);

const MASK_MARK = 0.66; // 마스커블 도안 크기(캔버스 대비). 안전영역(중앙 지름 80% 원)을 넘으면 아래 검사에서 실패한다
const SVGS = {
  "icons/icon.svg": iconSvg(),
  "icons/favicon.svg": smallSvg(),
  "icons/icon-maskable.svg": tileSvg({ mark: MASK_MARK }),
};
const APPLE = tileSvg({ mark: 0.7 });

// [출력 경로, SVG, 픽셀, 알파 기대값("transparent"|"opaque")]
const PNGS = [
  ["icons/icon-192.png", SVGS["icons/icon.svg"], 192, "transparent"],
  ["icons/icon-512.png", SVGS["icons/icon.svg"], 512, "transparent"],
  ["icons/icon-maskable-512.png", SVGS["icons/icon-maskable.svg"], 512, "opaque"],
  ["icons/apple-touch-icon.png", APPLE, 180, "opaque"],
  ["icons/favicon-16.png", SVGS["icons/favicon.svg"], 16, "transparent"],
  ["icons/favicon-32.png", SVGS["icons/favicon.svg"], 32, "transparent"],
  ["icons/favicon-48.png", SVGS["icons/favicon.svg"], 48, "transparent"],
];

/** PNG 여러 장을 담은 ICO (Vista+ PNG-in-ICO) */
function buildIco(entries) {
  const head = Buffer.alloc(6); head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4);
  let offset = 6 + entries.length * 16;
  const dir = entries.map(({ size, png }) => {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size; e[1] = size >= 256 ? 0 : size; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(png.length, 8); e.writeUInt32LE(offset, 12);
    offset += png.length; return e;
  });
  return Buffer.concat([head, ...dir, ...entries.map(e => e.png)]);
}

for (const [path, svg] of Object.entries(SVGS)) { await writeFile(path, svg, "utf8"); console.log(`OK ${path}`); }

const shots = await rasterizeTransparent([
  ...PNGS.map(([, svg, px]) => ({ svg: sized(svg, px), width: px, height: px, scale: 1 })),
  { svg: sized(tileSvg({ mark: MASK_MARK, bg: false }), 512), width: 512, height: 512, scale: 1 }, // 마스커블 안전영역 검사용(배경 없는 도안)
]);

// 마스커블: 도안의 보이는 픽셀이 모두 중앙 지름 80% 원(반지름 204.8px) 안에 있어야 한다
{
  const { pixels, w } = pngAlphaInfo(shots[PNGS.length]);
  let far = 0;
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) if (pixels[(y * w + x) * 4 + 3] > 8) far = Math.max(far, Math.hypot(x + 0.5 - w / 2, y + 0.5 - w / 2));
  if (far > w * 0.4) throw new Error(`마스커블 도안이 안전영역을 벗어남: 최대 반지름 ${far.toFixed(1)}px > ${w * 0.4}px`);
  console.log(`OK 마스커블 안전영역: 도안 최대 반지름 ${far.toFixed(1)}px ≤ ${w * 0.4}px`);
}

const bySize = {};
for (const [i, [path, , px, expect]] of PNGS.entries()) {
  const png = shots[i];
  const info = pngAlphaInfo(png);
  if (info.w !== px || info.h !== px) throw new Error(`${path}: ${info.w}×${info.h} (기대 ${px})`);
  if (expect === "transparent") {
    if (info.colorType !== 6 || !info.corners) throw new Error(`${path}: RGBA(색상 유형 6) PNG 가 아닙니다 (유형 ${info.colorType})`);
    if (!info.corners.every(c => c[3] === 0)) throw new Error(`${path}: 모서리 알파가 0 이 아닙니다 ${JSON.stringify(info.corners)}`);
  } else if (info.colorType === 6) { // 불투명: 알파가 있으면 전부 255, 알파 없는 RGB(유형 2)면 그대로 통과
    if (!info.corners.every(c => c[3] === 255)) throw new Error(`${path}: 모서리 알파가 255 가 아닙니다 ${JSON.stringify(info.corners)}`);
  } else if (info.colorType !== 2) throw new Error(`${path}: 예상 밖 색상 유형 ${info.colorType}`);
  await writeFile(path, png);
  if (path.includes("favicon-")) bySize[px] = png;
  console.log(`OK ${path} ${px}×${px} ${expect === "transparent" ? "RGBA, 네 모서리 알파 0" : `불투명 (PNG 색상 유형 ${info.colorType})`}`);
}
await writeFile("icons/favicon.ico", buildIco([16, 32, 48].map(size => ({ size, png: bySize[size] }))));
console.log("OK icons/favicon.ico 16·32·48");
