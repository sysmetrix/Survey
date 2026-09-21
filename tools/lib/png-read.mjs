// 최소 PNG 디코더 (Node 전용): 8비트 RGBA 비인터레이스 PNG 의 픽셀·모서리 알파를 읽는다 — 아이콘 투명도 검사용
import { inflateSync } from "node:zlib";

/** PNG(8비트 RGBA, 비인터레이스) 네 모서리 픽셀 알파 + 색상 유형 읽기 */
export function pngAlphaInfo(buf) {
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20), depth = buf[24], colorType = buf[25], interlace = buf[28];
  if (depth !== 8 || interlace !== 0 || colorType !== 6) return { w, h, colorType, corners: null };
  const idat = []; let o = 8;
  while (o < buf.length) { const len = buf.readUInt32BE(o), type = buf.toString("ascii", o + 4, o + 8); if (type === "IDAT") idat.push(buf.subarray(o + 8, o + 8 + len)); o += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat)), bpp = 4, stride = w * bpp;
  const out = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[dst + x - bpp] : 0, b = y ? out[dst - stride + x] : 0, c = x >= bpp && y ? out[dst - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[dst + x] = v & 255;
    }
  }
  const px = (x, y) => Array.from(out.subarray(y * stride + x * 4, y * stride + x * 4 + 4));
  return { w, h, colorType, corners: [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)], pixels: out };
}
