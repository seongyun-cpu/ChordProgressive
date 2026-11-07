import { describe, it, expect } from "vitest";
import { SnapshotHistory } from "./history.js";
const state = ids => ({ ids, settings: { type: "auto", locks: {} } });
describe("진행 스냅샷 기록", () => {
  it("비우기·자르기·산책을 한 번씩 되돌리고 다시 한다", () => {
    const history = new SnapshotHistory();
    const stages = [state(["C", "E7>Am", "Am"]), state([]), state(["C", "G", "Em", "Am"]), state(["C", "G"])];
    for (let i = 1; i < stages.length; i++) history.record(stages[i - 1], stages[i]);
    let current = stages.at(-1);
    for (let i = stages.length - 2; i >= 0; i--) {
      current = history.undo(current);
      expect(current).toEqual(stages[i]);
    }
    expect(history.undo(current)).toBeNull();
    for (let i = 1; i < stages.length; i++) {
      current = history.redo(current);
      expect(current).toEqual(stages[i]);
    }
    expect(history.redo(current)).toBeNull();
  });
  it("잠금 음을 깊게 복사하고 새 편집에서 다시하기를 비운다", () => {
    const h = new SnapshotHistory();
    const before = state(["C"]);
    before.settings.locks[0] = { bass: 36, upper: [60, 64, 67] };
    h.record(before, state([]));
    before.settings.locks[0].upper[0] = 80;
    const restored = h.undo(state([]));
    expect(restored.settings.locks[0].upper[0]).toBe(60);
    expect(h.canRedo).toBe(true);
    h.record(restored, state(["C", "C"]));
    expect(h.canRedo).toBe(false);
  });
  it("같은 스냅샷은 기록하지 않고 기록 개수를 제한한다", () => {
    const h = new SnapshotHistory(2);
    expect(h.record(state([]), state([]))).toBe(false);
    for (let i = 0; i < 4; i++) h.record(state(Array(i).fill("C")), state(Array(i + 1).fill("C")));
    expect(h.past).toHaveLength(2);
    expect(h.canUndo).toBe(true);
  });
});
