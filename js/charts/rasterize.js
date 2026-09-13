// SVG → PNG (브라우저): 오프스크린 canvas 에 그려 PNG 바이트 반환
/** @returns {Promise<{png:Uint8Array, wPx:number, hPx:number}>} */
export function svgToPng(svg, width, height, scale = 2.5) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = Math.round(width * scale); c.height = Math.round(height * scale);
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => {
        if (!b) { reject(new Error("PNG 변환 실패")); return; }
        b.arrayBuffer().then(ab => resolve({ png: new Uint8Array(ab), wPx: c.width, hPx: c.height }));
      }, "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("SVG 이미지 로드 실패")); };
    img.src = url;
  });
}
