// 공급망 무결성: 로컬 사본 라이브러리가 검증한 공식 배포본과 같은지 (줄바꿈 LF 기준 SHA-256)
// 라이브러리를 올릴 때는 공식 배포본을 받아 이 값을 함께 갱신한다.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const PINNED = {
  "vendor/papaparse-5.4.1.min.js": "b8e870c5d2b29772f10c9fa9a693c8b896aac8540ed6701e3cc6304c683febdb",
  "vendor/xlsx-0.20.3.full.min.js": "cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41",
  "vendor/jszip-3.10.1.min.js": "acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e",
};

test("vendor 라이브러리 해시 고정", async () => {
  for (const [file, hash] of Object.entries(PINNED)) {
    const text = (await readFile(file, "utf8")).replace(/\r\n/g, "\n");
    assert.equal(createHash("sha256").update(text).digest("hex"), hash, `${file} 내용이 바뀌었습니다`);
  }
});
