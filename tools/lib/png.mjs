// 최소 PNG 인코더 (Node 전용, 테스트 이미지 생성용)
import { deflateSync } from "node:zlib";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xFFFFFFFF; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** @param {(x:number,y:number)=>[number,number,number,number]} pixel */
export function encodePng(w, h, pixel) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (w * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

/** 막대 5개가 그려진 테스트 이미지 */
export function testBarsPng(w = 600, h = 300) {
  const colors = [[33, 102, 172], [67, 147, 195], [146, 197, 222], [244, 165, 130], [214, 96, 77]];
  return encodePng(w, h, (x, y) => {
    if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) return [80, 80, 80, 255];
    const band = Math.floor((x - 20) / ((w - 40) / 5));
    const top = [60, 110, 150, 90, 180][band];
    if (x > 20 && x < w - 20 && band >= 0 && band < 5 && (x - 20) % ((w - 40) / 5) > 12 && y > top && y < h - 20) return [...colors[band], 255];
    return [255, 255, 255, 255];
  });
}
