// 진행·설정·잠금을 복사해서 기록한다. 새 편집은 다시하기 분기를 지운다.
export class SnapshotHistory {
  constructor(limit = 100) {
    this.limit = limit;
    this.past = [];
    this.future = [];
  }
  record(before, after) {
    if (JSON.stringify(before) === JSON.stringify(after)) return false;
    this.past.push(structuredClone(before));
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
    return true;
  }
  undo(current) {
    if (!this.past.length) return null;
    this.future.push(structuredClone(current));
    return this.past.pop();
  }
  redo(current) {
    if (!this.future.length) return null;
    this.past.push(structuredClone(current));
    return this.future.pop();
  }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
}
