// 기기 키(원자료 자동 복원용): IndexedDB 의 추출 불가 CryptoKey, 예전 localStorage 원시 키 이전, IndexedDB 없을 때 대체 경로
import test from "node:test";
import assert from "node:assert/strict";

const DEVICE_KEY = "survey-v5-device-key";
let seq = 0;
/** 모듈 안 키 캐시를 비우기 위해 매번 새로 불러온다 */
const freshCrypto = () => import(`../../js/history/crypto.js?case=${++seq}`);

function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _map: m };
}

/** 이 테스트에 필요한 만큼만 흉내 낸 IndexedDB (open·transaction·get·put) */
function fakeIndexedDB() {
  const stores = new Map();
  const later = fn => setTimeout(fn, 0);
  const db = {
    objectStoreNames: { contains: n => stores.has(n) },
    createObjectStore: n => { stores.set(n, new Map()); },
    close() {},
    transaction(name) {
      const st = stores.get(name), t = {};
      let pending = 0;
      const done = () => { if (--pending === 0) later(() => t.oncomplete?.()); };
      t.objectStore = () => ({
        get(k) { const r = {}; pending++; later(() => { r.result = st.get(k); r.onsuccess?.(); done(); }); return r; },
        put(v, k) { st.set(k, v); },
      });
      return t;
    },
  };
  return {
    stores,
    open() {
      const req = {};
      later(() => { req.result = db; if (!stores.size) req.onupgradeneeded?.(); req.onsuccess?.(); });
      return req;
    },
  };
}

function withGlobals(g, fn) {
  return async () => {
    const prev = { localStorage: globalThis.localStorage, indexedDB: globalThis.indexedDB };
    Object.assign(globalThis, g);
    try { await fn(); } finally {
      for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; }
    }
  };
}

const ls1 = memoryStorage();
test("IndexedDB 없음: localStorage 원시 키로 대체해 왕복·같은 키 재사용", withGlobals({ localStorage: ls1, indexedDB: undefined }, async () => {
  delete globalThis.indexedDB;
  const c = await freshCrypto();
  const box = await c.encryptLocalJson({ a: [1, "가"] });
  assert.equal(box.v, 2);
  const raw = ls1.getItem(DEVICE_KEY);
  assert.ok(raw && atob(raw).length === 32);
  assert.deepEqual(await c.decryptLocalJson(box), { a: [1, "가"] });
  // 새로 불러와도(새 창) 같은 키로 복호화된다
  const c2 = await freshCrypto();
  assert.deepEqual(await c2.decryptLocalJson(box), { a: [1, "가"] });
  assert.equal(ls1.getItem(DEVICE_KEY), raw);
  await assert.rejects(c2.decryptLocalJson({ ...box, data: box.data.slice(0, -4) + "AAAA" }), /손상/);
}));

test("IndexedDB 있음: 예전 원시 키를 추출 불가 CryptoKey 로 옮기고 localStorage 에서 지움", async () => {
  // 1) 예전 방식으로 만든 상자
  const ls = memoryStorage();
  let oldBox;
  await withGlobals({ localStorage: ls }, async () => {
    delete globalThis.indexedDB;
    oldBox = await (await freshCrypto()).encryptLocalJson({ legacy: true });
  })();
  assert.ok(ls.getItem(DEVICE_KEY));
  // 2) IndexedDB 가 있는 환경에서 처음 열면 이전된다
  const idb = fakeIndexedDB();
  await withGlobals({ localStorage: ls, indexedDB: idb }, async () => {
    const c = await freshCrypto();
    assert.deepEqual(await c.decryptLocalJson(oldBox), { legacy: true });
    assert.equal(ls.getItem(DEVICE_KEY), null);
    const key = idb.stores.get("keys").get(DEVICE_KEY);
    assert.ok(key && key.type === "secret" && key.extractable === false);
    const box = await c.encryptLocalJson({ fresh: 1 });
    // 새 창: localStorage 없이 IndexedDB 키만으로 옛 상자·새 상자 모두 복호화
    const c2 = await freshCrypto();
    assert.deepEqual(await c2.decryptLocalJson(oldBox), { legacy: true });
    assert.deepEqual(await c2.decryptLocalJson(box), { fresh: 1 });
  })();
});

test("IndexedDB 있음·예전 키 없음: 새 추출 불가 키를 만들고 localStorage 는 쓰지 않음", async () => {
  const ls = memoryStorage(), idb = fakeIndexedDB();
  await withGlobals({ localStorage: ls, indexedDB: idb }, async () => {
    const c = await freshCrypto();
    const box = await c.encryptLocalJson({ x: 1 });
    assert.equal(ls._map.size, 0);
    assert.equal(idb.stores.get("keys").get(DEVICE_KEY).extractable, false);
    assert.deepEqual(await (await freshCrypto()).decryptLocalJson(box), { x: 1 });
  })();
});
