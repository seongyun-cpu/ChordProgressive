import { describe, it, expect } from "vitest";
import { buildChordMap, voiceLead } from "./theory.js";

import { computeVoicings, displayName, voicingTransitionCost } from "./voicing.js";

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

const chord = (rootPc, kind, name = "C") => ({ id: `${rootPc}-${kind}`, rootPc, kind, name });
const c = chord(0, "maj", "C");
const iiVI = [chord(2, "min", "Dm"), chord(7, "dom7", "G7"), c];
const types = ["auto", "close", "shell", "drop2", "rootlessA", "rootlessB", "spread"];
const pitchClasses = v => v.upper.map(n => n % 12).sort((a, b) => a - b);


describe("타입별 보이싱", () => {
  it("명시적 기본 옵션도 기존 결과와 완전히 같다", () => {
    expect(computeVoicings(nodes, { type: "auto", neoSoul: false, locks: {} })).toEqual(legacy);
  });
  it("Cmaj7 drop2는 G3 C4 E4 B4이다", () => {
    expect(computeVoicings([c], { type: "drop2" })[0])
      .toEqual({ bass: 36, upper: [55, 60, 64, 71] });
    expect(computeVoicings([chord(0, "maj7")], { type: "drop2" })[0].upper)
      .toEqual([55, 60, 64, 71]);
  });
  it("Cmaj9 rootless A/B는 E G B D / B D E G이고 루트는 베이스만 친다", () => {
    expect(computeVoicings([c], { type: "rootlessA", neoSoul: true })[0])
      .toEqual({ bass: 36, upper: [64, 67, 71, 74] });
    expect(computeVoicings([chord(0, "maj9")], { type: "rootlessB" })[0])
      .toEqual({ bass: 36, upper: [71, 74, 76, 79] });
  });
  it("close, shell, spread가 서로 다른 배치를 만든다", () => {
    expect(computeVoicings([c], { type: "close" })[0].upper).toEqual([60, 64, 67, 71]);
    expect(computeVoicings([c], { type: "shell" })[0].upper).toEqual([64, 71]);
    expect(computeVoicings([c], { type: "spread" })[0].upper).toEqual([60, 64, 79, 83]);
    const extended = computeVoicings([c], { type: "close", neoSoul: true })[0].upper;
    expect(extended.at(-1) - extended[0]).toBeLessThan(12);
  });
  it.each(types)("%s: 12개 조 모든 화음에서 저음 간격·3음·7음 규칙을 지킨다", type => {
    for (const neoSoul of [false, true]) {
      if (type === "auto" && !neoSoul) continue; // 기본값은 기존 triad 호환 계약이다.
      for (let rootPc = 0; rootPc < 12; rootPc++) {
        for (const [kind, third, seventh] of [["maj", 4, 11], ["min", 3, 10], ["min7", 3, 10], ["dom7", 4, 10], ["dim7", 3, 9]]) {
          const node = chord(rootPc, kind);
          for (const target of [chord((rootPc + 5) % 12, "maj"), chord((rootPc + 5) % 12, "min")]) {
            const v = computeVoicings([node, target], { type, neoSoul })[0];
            const all = [v.bass, ...v.upper].sort((a, b) => a - b);
            for (let i = 1; i < all.length; i++)
              if (all[i - 1] < 52) expect(all[i] - all[i - 1]).toBeGreaterThan(4);
            expect(pitchClasses(v)).toContain((rootPc + third) % 12);
            expect(pitchClasses(v)).toContain((rootPc + seventh) % 12);
            expect(v.bass).toBe(36 + rootPc);
            if (type.startsWith("rootless")) expect(pitchClasses(v)).not.toContain(rootPc);
          }
        }
      }
    }
  });
});

describe("연주 시에만 적용하는 확장음", () => {
  it("Dm→G7→C를 Dm9→G13→Cmaj9로 표시하고 노드는 불변이다", () => {
    const before = structuredClone(iiVI);
    expect(iiVI.map((node, i) => displayName(node, { neoSoul: true }, iiVI[i + 1])))
      .toEqual(["Dm9", "G13", "Cmaj9"]);
    const result = computeVoicings(iiVI, { neoSoul: true });
    expect(pitchClasses(result[0])).toContain(4); // D의 9음 E
    expect(pitchClasses(result[1])).toContain(4); // G의 13음 E
    expect(pitchClasses(result[2])).toContain(2); // C의 9음 D
    expect(iiVI).toEqual(before);
    expect(displayName(c)).toBe("C");
  });
  it.each(["min", "min7", "min9"])("%s로 가는 도미넌트는 b9를 사용한다", kind => {
    const e = chord(4, "dom7", "E7"), a = chord(9, kind, "Am");
    expect(displayName(e, { neoSoul: true }, a)).toBe("E7(b9)");
    expect(pitchClasses(computeVoicings([e, a], { neoSoul: true })[0])).toContain(5);
  });
  it("감7은 확장되지 않고 장조의 자연 11은 사용하지 않는다", () => {
    const dim = chord(11, "dim7", "B°");
    expect(displayName(dim, { neoSoul: true })).toBe("B°");
    expect(pitchClasses(computeVoicings([dim], { neoSoul: true })[0])).toEqual([2, 5, 8, 11]);
    const sharp11 = { bass: 36, upper: [60, 64, 66, 71, 74] };
    expect(computeVoicings([c], { neoSoul: true, locks: { 0: sharp11 } })[0]).toEqual(sharp11);
    expect(() => computeVoicings([c], { neoSoul: true, locks: { 0: { ...sharp11, upper: [60, 64, 65, 71, 74] } } })).toThrow();
  });
});

describe("진행 전체 최적화와 잠금", () => {
  it("미래 잠금에 따라 첫 코드부터 바뀌며 잠금 객체를 공유하지 않는다", () => {
    const locked = { bass: 36, upper: [72, 74, 76, 79, 83] };
    const result = computeVoicings([c, c], { neoSoul: true, locks: { 1: locked } });
    expect(result[1]).toEqual(locked);
    expect(result[0]).toEqual(locked); // 전체 비용 0: 탐욕적으로 첫 코드를 먼저 고르면 실패한다.
    expect(result[1]).not.toBe(locked);
    expect(result[1].upper).not.toBe(locked.upper);
    expect(computeVoicings([c, c], { neoSoul: true })[0]).not.toEqual(locked);
  });
  it("ii–V–I를 모든 조로 옮겨도 맨 윗음 이동 대부분이 2반음 이내다", () => {
    let smooth = 0, total = 0;
    for (let offset = 0; offset < 12; offset++) {
      const progression = iiVI.map(n => ({ ...n, rootPc: (n.rootPc + offset) % 12 }));
      const result = computeVoicings([...progression, ...progression], { neoSoul: true });
      for (let i = 1; i < result.length; i++) {
        total++;
        if (Math.abs(result[i].upper.at(-1) - result[i - 1].upper.at(-1)) <= 2) smooth++;
      }
    }
    expect(smooth / total).toBeGreaterThan(0.7);
  });
  it("이동 합에 큰 소프라노 도약과 성부 교차 벌점이 더해진다", () => {
    const a = { bass: 36, upper: [60, 64, 67, 71] };
    expect(voicingTransitionCost(a, a)).toBe(0);
    expect(voicingTransitionCost(a, { ...a, upper: [60, 64, 67, 77] })).toBe(22);
    expect(voicingTransitionCost(a, { ...a, upper: [64, 60, 67, 71] })).toBe(32);
  });
  it("고정 타입에도 잠금은 적용하고, 위반하는 잠금은 거절한다", () => {
    const lock = { bass: 36, upper: [64, 67, 71, 74] };
    expect(computeVoicings([c], { type: "rootlessA", locks: { 0: lock } })[0]).toEqual(lock);
    for (const bad of [
      { bass: 36, upper: [48, 52, 59] }, // 낮은 3도
      { bass: 36, upper: [60, 67, 71] }, // 3음 누락
      { bass: 36, upper: [60, 64, 67] }, // 7음 누락
      { bass: 37, upper: [60, 64, 71] }, // 다른 근음
      { bass: 36, upper: [64, 60, 71] }, // 성부 교차
      { bass: 36, upper: [60, 64, 128] },
    ]) expect(() => computeVoicings([c], { locks: { 0: bad } })).toThrow();
    expect(() => computeVoicings([c], { type: "rootlessA", locks: { 0: { bass: 36, upper: [60, 64, 71] } } })).toThrow();
    expect(() => computeVoicings([c], { locks: { 1: lock } })).toThrow();
    expect(() => computeVoicings([c], { type: "unknown" })).toThrow();
    expect(() => computeVoicings([c], { neoSoul: "true" })).toThrow();
    expect(computeVoicings([], { neoSoul: true })).toEqual([]);
  });
});
