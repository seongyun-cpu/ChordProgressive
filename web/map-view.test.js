import { describe, it, expect } from "vitest";
import { buildChordMap, randomWalk } from "./theory.js";
import { canPickChord, isEdgeVisible } from "./map-view.js";
describe("코드 반복과 화살표 표시", () => {
  it("strict 반복 선택을 허용하면서 그래프·자동 산책은 바꾸지 않는다", () => {
    const map = buildChordMap(), c = map.nodes.find(n => n.id === "C").idx;
    const before = structuredClone(map.edges);
    const walk = randomWalk(map, c, 8, () => 0.4);
    expect(canPickChord(map, [c], c, true)).toBe(true);
    expect(canPickChord(map, [c, c], c, true)).toBe(true);
    expect(map.edges).toEqual(before);
    expect(randomWalk(map, c, 8, () => 0.4)).toEqual(walk);
    expect(map.edges.some(e => e.from === c && e.to === c)).toBe(false);
    const invalid = map.nodes.find(n => n.idx !== c && !map.edges.some(e => e.from === c && e.to === n.idx)).idx;
    expect(canPickChord(map, [c], invalid, true)).toBe(false);
    expect(canPickChord(map, [c], invalid, false)).toBe(true);
  });
  it("빈 진행에는 화살표가 없고 현재·hover 출발점만 나타난다", () => {
    const edge = { from: 2, to: 4 };
    expect(isEdgeVisible(edge, {})).toBe(false);
    expect(isEdgeVisible(edge, { current: 2 })).toBe(true);
    expect(isEdgeVisible(edge, { current: 4 })).toBe(false);
    expect(isEdgeVisible(edge, { hovered: 2 })).toBe(true);
    expect(isEdgeVisible(edge, { allArrows: true })).toBe(true);
    expect(isEdgeVisible(edge, { allArrows: true, categoryVisible: false })).toBe(false);
  });
});
