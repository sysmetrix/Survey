// 원자료 암호화 보관 — Web Crypto (브라우저·Node 공통 globalThis.crypto.subtle)
// AES-GCM 256bit, 키는 비밀번호에서 PBKDF2-SHA256(310,000회, OWASP 2023 권고)로 유도. 비밀번호는 저장하지 않는다.
const te = new TextEncoder(), td = new TextDecoder();
export const KDF_ITERATIONS = 310000;
export const MIN_PASSPHRASE = 8;

const b64 = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriveKey(passphrase, salt, iterations) {
  const base = await crypto.subtle.importKey("raw", te.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** 객체 → 암호문 상자 {v, alg, kdf, iter, salt, iv, data} */
export async function encryptJson(obj, passphrase) {
  if (!passphrase || String(passphrase).length < MIN_PASSPHRASE) throw new Error(`비밀번호는 ${MIN_PASSPHRASE}자 이상이어야 합니다`);
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(String(passphrase), salt, KDF_ITERATIONS);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, te.encode(JSON.stringify(obj))));
  return { v: 1, alg: "AES-GCM-256", kdf: "PBKDF2-SHA256", iter: KDF_ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(ct) };
}

/** 암호문 상자 → 객체 (비밀번호 오류·변조 시 예외) */
export async function decryptJson(box, passphrase) {
  if (!box || box.v !== 1 || !box.data) throw new Error("암호화된 자료 형식이 아닙니다");
  try {
    const key = await deriveKey(String(passphrase ?? ""), unb64(box.salt), Number(box.iter) || KDF_ITERATIONS);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, key, unb64(box.data));
    return JSON.parse(td.decode(pt));
  } catch {
    throw new Error("비밀번호가 맞지 않거나 자료가 손상되었습니다");
  }
}
