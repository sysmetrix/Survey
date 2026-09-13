// 작업 내역 저장소 (브라우저 IndexedDB) — 서버 전송 없음
// stores: projects{id}, snapshots{id, projectId, createdAt}, meta{key}
const DB_NAME = "survey-v5-history";
const DB_VERSION = 1;
let dbPromise = null;

export const idbAvailable = () => typeof indexedDB !== "undefined";

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" }).createIndex("updatedAt", "updatedAt");
      if (!db.objectStoreNames.contains("snapshots")) {
        const s = db.createObjectStore("snapshots", { keyPath: "id" });
        s.createIndex("projectId", "projectId");
        s.createIndex("createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => reject(new Error("다른 창에서 저장소를 사용 중입니다. 다른 창을 닫고 다시 시도하세요."));
  });
  return dbPromise;
}

/** 트랜잭션: fn 은 요청만 만들고 결과를 돌려줄 함수를 반환 (트랜잭션 안에서 다른 비동기 대기 금지) */
async function tx(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let getter;
    try { getter = fn(t); } catch (e) { t.abort(); reject(e); return; }
    t.oncomplete = () => resolve(typeof getter === "function" ? getter() : getter);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("저장이 취소되었습니다"));
  });
}
const result = req => { let v; req.onsuccess = () => { v = req.result; }; return () => v; };

export const historyDb = {
  listProjects: () => tx(["projects"], "readonly", t => { const g = result(t.objectStore("projects").getAll()); return () => (g() || []).sort((a, b) => b.updatedAt - a.updatedAt); }),
  getProject: id => tx(["projects"], "readonly", t => result(t.objectStore("projects").get(id))),
  putProject: p => tx(["projects"], "readwrite", t => { t.objectStore("projects").put(p); }),
  putSnapshotAndProject: (snap, project) => tx(["snapshots", "projects"], "readwrite", t => { t.objectStore("snapshots").put(snap); t.objectStore("projects").put(project); }),
  listSnapshots: projectId => tx(["snapshots"], "readonly", t => { const g = result(t.objectStore("snapshots").index("projectId").getAll(projectId)); return () => (g() || []).sort((a, b) => b.createdAt - a.createdAt); }),
  getSnapshot: id => tx(["snapshots"], "readonly", t => result(t.objectStore("snapshots").get(id))),
  putSnapshot: s => tx(["snapshots"], "readwrite", t => { t.objectStore("snapshots").put(s); }),
  deleteSnapshots: ids => tx(["snapshots"], "readwrite", t => { const st = t.objectStore("snapshots"); ids.forEach(id => st.delete(id)); }),
  deleteProject: id => tx(["snapshots", "projects"], "readwrite", t => {
    t.objectStore("projects").delete(id);
    const req = t.objectStore("snapshots").index("projectId").openKeyCursor(IDBKeyRange.only(id));
    req.onsuccess = () => { const c = req.result; if (c) { t.objectStore("snapshots").delete(c.primaryKey); c.continue(); } };
  }),
  getMeta: key => tx(["meta"], "readonly", t => { const g = result(t.objectStore("meta").get(key)); return () => g()?.value; }),
  setMeta: (key, value) => tx(["meta"], "readwrite", t => { t.objectStore("meta").put({ key, value }); }),
  exportAll: () => tx(["projects", "snapshots"], "readonly", t => {
    const p = result(t.objectStore("projects").getAll()), s = result(t.objectStore("snapshots").getAll());
    return () => ({ projects: p() || [], snapshots: s() || [] });
  }),
  importAll: ({ projects, snapshots }) => tx(["projects", "snapshots"], "readwrite", t => {
    projects.forEach(p => t.objectStore("projects").put(p));
    snapshots.forEach(s => t.objectStore("snapshots").put(s));
  }),
  clearAll: () => tx(["projects", "snapshots", "meta"], "readwrite", t => { ["projects", "snapshots", "meta"].forEach(n => t.objectStore(n).clear()); }),
};
