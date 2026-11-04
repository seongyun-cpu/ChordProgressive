import { describe, it, expect } from "vitest";
import { buildChordMap, voiceLead } from "./theory.js";

import { computeVoicings } from "./voicing.js";

const map = buildChordMap();
const ids = ["C", "E7>Am", "Am", "D7>G", "G", "B7>Em", "Em"];
const nodes = ids.map(id => map.nodes.find(node => node.id === id));
const legacy = [
  { bass: 36, upper: [60, 64, 67] },
  { bass: 40, upper: [59, 62, 64, 68] },
  { bass: 45, upper: [57, 60, 64] },
  { bass: 38, upper: [57, 60, 62, 66] },
  { bass: 43, upper: [55, 59, 62] },
  { bass: 47, upper: [59, 63, 66, 69] },
  { bass: 40, upper: [59, 64, 67] },
];

describe("기존 보이싱 회귀", () => {
  it("기존 연쇄 보이싱과 베이스의 실제 음을 고정한다", () => {
    let previous = null;
    expect(nodes.map(node => {
      previous = voiceLead(previous, node);
      return { bass: 36 + node.rootPc, upper: previous };
    })).toEqual(legacy);
  });
});

describe("공통 보이싱 계산", () => {
  it("기존 음과 일치하며 호출마다 독립적이다", () => {
    const original = structuredClone(nodes);
    expect(computeVoicings(nodes)).toEqual(legacy);
    expect(computeVoicings([])).toEqual([]);
    expect(computeVoicings(nodes, {})).toEqual(legacy);
    expect(nodes).toEqual(original);
    for (let length = 1; length <= nodes.length; length++)
      expect(computeVoicings(nodes.slice(0, length)).at(-1)).toEqual(legacy[length - 1]);
  });
  it("전체 코드에서 기존 voiceLead 연쇄 결과를 유지한다", () => {
    let previous = null;
    const expected = map.nodes.map(node => {
      previous = voiceLead(previous, node);
      return { bass: 36 + node.rootPc, upper: previous };
    });
    expect(computeVoicings(map.nodes)).toEqual(expected);
  });
});
