// 되돌리기/다시 실행 스택 — 순수 모듈. 상태는 문자열(stableStringify 결과)로 저장해 비교 비용을 줄인다.
export function createUndoStack({ limit = 80 } = {}) {
  let past = [], future = [], current = null;
  return {
    /** 기준 상태 지정 (파일을 새로 불러왔을 때 등) */
    reset(snapshot = null) { past = []; future = []; current = snapshot; },
    /** 변경 기록 — 이전과 같으면 무시 */
    record(snapshot) {
      if (snapshot === current) return false;
      if (current !== null) { past.push(current); if (past.length > limit) past.shift(); }
      current = snapshot;
      future = [];
      return true;
    },
    undo() {
      if (!past.length) return null;
      future.push(current);
      current = past.pop();
      return current;
    },
    redo() {
      if (!future.length) return null;
      past.push(current);
      current = future.pop();
      return current;
    },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    get depth() { return { undo: past.length, redo: future.length }; },
  };
}
