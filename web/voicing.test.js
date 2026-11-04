import { describe, it, expect } from "vitest";
import { buildChordMap, voiceLead } from "./theory.js";

import { computeVoicings, displayName, voicingTransitionCost, voicingClusterCost, voicingRegisterCost } from "./voicing.js";

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
const types = ["auto", "close", "shell", "drop2", "rootlessA", "rootlessB", "rootless", "spread"];
const pitchClasses = v => v.upper.map(n => n % 12).sort((a, b) => a - b);


describe("타입별 보이싱", () => {
  it("명시적 기본 옵션도 기존 결과와 완전히 같다", () => {
    expect(computeVoicings(nodes, { type: "auto", neoSoul: false, locks: {} })).toEqual(legacy);
  });
  it("Cmaj7 drop2는 G3 C4 E4 B4이다", () => {
    expect(computeVoicings([c], { type: "drop2" })[0])
      .toEqual({ bass: 36, upper: [55, 64, 72] });
    expect(displayName(c, { type: "drop2" })).toBe("C");
    expect(computeVoicings([chord(0, "maj7")], { type: "drop2" })[0].upper)
      .toEqual([55, 60, 64, 71]);
  });
  it("Cmaj9 rootless A/B는 E G B D / B D E G이고 루트는 베이스만 친다", () => {
    expect(computeVoicings([c], { type: "rootlessA", neoSoul: true })[0])
      .toEqual({ bass: 36, upper: [64, 67, 71, 74] });
    expect(computeVoicings([chord(0, "maj9")], { type: "rootlessB" })[0])
      .toEqual({ bass: 36, upper: [59, 62, 64, 67] });
  });
  it("close, shell, spread가 서로 다른 배치를 만든다", () => {
    expect(computeVoicings([c], { type: "close" })[0].upper).toEqual([60, 64, 67]);
    expect(computeVoicings([c], { type: "shell" })[0].upper).toEqual([60, 64, 67]);
    expect(computeVoicings([c], { type: "spread" })[0].upper).toEqual([55, 60, 76]);
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
            if (neoSoul || type.startsWith("rootless") || !["maj", "min"].includes(kind))
              expect(pitchClasses(v)).toContain((rootPc + seventh) % 12);
            else expect(pitchClasses(v)).toEqual([rootPc, (rootPc + third) % 12, (rootPc + 7) % 12].sort((a, b) => a - b));
            expect(v.bass).toBe(36 + rootPc);
            if (neoSoul || type.startsWith("rootless")) expect(pitchClasses(v)).not.toContain(rootPc);
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
    expect(pitchClasses(computeVoicings([dim], { neoSoul: true })[0])).toEqual([2, 5, 8]);
    const sharp11 = { bass: 36, upper: [60, 64, 66, 71, 74] };
    expect(computeVoicings([c], { neoSoul: true, locks: { 0: sharp11 } })[0]).toEqual(sharp11);
    expect(() => computeVoicings([c], { neoSoul: true, locks: { 0: { ...sharp11, upper: [60, 64, 65, 71, 74] } } })).toThrow();
  });
});

describe("진행 전체 최적화와 잠금", () => {
  it("미래 잠금에 따라 첫 코드부터 바뀌며 잠금 객체를 공유하지 않는다", () => {
    const locked = { bass: 36, upper: [64, 67, 71, 74] };
    const result = computeVoicings([c, c], { neoSoul: true, locks: { 1: locked } });
    expect(result[1]).toEqual(locked);
    expect(result[0]).toEqual(locked); // 미래 잠금이 초기 선택에도 영향을 준다.
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
    ]) expect(() => computeVoicings([c], { neoSoul: true, locks: { 0: bad } })).toThrow();
    expect(() => computeVoicings([c], { type: "rootlessA", locks: { 0: { bass: 36, upper: [60, 64, 71] } } })).toThrow();
    expect(() => computeVoicings([c], { locks: { 1: lock } })).toThrow();
    expect(() => computeVoicings([c], { type: "unknown" })).toThrow();
    expect(() => computeVoicings([c], { neoSoul: "true" })).toThrow();
    expect(computeVoicings([], { neoSoul: true })).toEqual([]);
  });
});

describe("화성과 타입·잠금 분리 회귀", () => {
  it.each(types.filter(type => !type.startsWith("rootless")))("%s: neoSoul:false의 장·단3화음은 잠금과 무관하다", type => {
    const before = structuredClone(nodes);
    const result = computeVoicings(nodes, { type, locks: { 1: legacy[1] } });
    result.forEach((v, i) => {
      if (["maj", "min"].includes(nodes[i].kind)) {
        const third = nodes[i].kind === "maj" ? 4 : 3;
        expect(pitchClasses(v)).toEqual([0, third, 7].map(n => (n + nodes[i].rootPc) % 12).sort((a, b) => a - b));
        expect(displayName(nodes[i], { type, locks: { 1: legacy[1] } })).toBe(nodes[i].name);
      }
    });
    expect(nodes).toEqual(before);
  });
  it.each(["rootlessA", "rootlessB", "rootless"])("%s만 neoSoul:false에도 7음·9음을 보충하고 이름에 표시한다", type => {
    expect(displayName(c, { type })).toBe("Cmaj9");
    expect(displayName(iiVI[0], { type })).toBe("Dm9");
    expect(displayName(iiVI[1], { type }, c)).toBe("G9");
    const result = computeVoicings([c], { type })[0];
    expect(pitchClasses(result)).toEqual([2, 4, 7, 11]);
  });
  it("기본 결과 전체를 잠그면 오류 없이 같은 결과가 나온다", () => {
    for (const progression of [nodes, map.nodes]) {
      const baseline = computeVoicings(progression);
      const locks = Object.fromEntries(baseline.map((v, index) => [index, v]));
      const result = computeVoicings(progression, { locks });
      expect(result).toEqual(baseline);
      expect(result[0].upper).not.toBe(baseline[0].upper);
    }
  });
  it("기본 결과 하나를 잠가도 그 코드는 그대로 보존한다", () => {
    legacy.forEach((v, index) => {
      expect(computeVoicings(nodes, { locks: { [index]: v } })[index]).toEqual(v);
    });
  });
  it.each(["auto", "close", "shell", "drop2", "spread"])("%s: 부분 잠금 앞의 코드는 전체 경로로 최적화한다", type => {
    const fixed = computeVoicings([c], { type })[0];
    const high = { bass: fixed.bass, upper: type === "spread" ? [64, 67, 84] : fixed.upper.map(n => n + 12) };
    const result = computeVoicings([c, c, c], { type, locks: { 2: high } });
    expect(result[2]).toEqual(high);
    const pathCost = path => path.reduce((sum, v, i) => sum + voicingRegisterCost(v) +
      voicingClusterCost(v) + (i ? voicingTransitionCost(path[i - 1], v) : 0), 0);
    // 음역 벌점을 포함한 전체 비용이 같은 첫 보이싱을 고집할 때보다 작다.
    expect(pathCost(result)).toBeLessThan(pathCost([fixed, fixed, high]));
    expect(result[0]).not.toEqual(fixed);
  });
  it("drop2의 C는 3음만 포함하고 명시적 Cmaj7만 7음을 유지한다", () => {
    expect(pitchClasses(computeVoicings([c], { type: "drop2" })[0])).toEqual([0, 4, 7]);
    expect(displayName(c, { type: "drop2" })).toBe("C");
    expect(displayName(chord(0, "maj7"), { type: "drop2" })).toBe("Cmaj7");
  });
});

describe("선율과 뭉침 최적화", () => {
  it.each(types.filter(type => !["rootlessA", "rootlessB"].includes(type)))("%s: 예시 진행의 최상성부 이동 대부분이 4반음 이하이다", type => {
    for (const neoSoul of [false, true]) {
      const result = computeVoicings(nodes, { type, neoSoul });
      const leaps = result.slice(1).map((v, i) => Math.abs(v.upper.at(-1) - result[i].upper.at(-1)));
      expect(leaps.filter(n => n <= 4).length).toBeGreaterThanOrEqual(5);
    }
  });
  it("neoSoul auto는 루트를 상성부에서 빼고 단2도 뭉침을 제한한다", () => {
    const result = computeVoicings(nodes, { neoSoul: true });
    let semitones = 0;
    result.forEach((v, index) => {
      expect(pitchClasses(v)).not.toContain(nodes[index].rootPc);
      semitones += v.upper.slice(1).filter((n, i) => n - v.upper[i] === 1).length;
      expect(voicingClusterCost(v)).toBeLessThan(30); // 연속 2도 3개가 없다.
    });
    expect(semitones).toBeLessThanOrEqual(2);
  });
  it("단2도별 벌점과 연속 2도 3개 벌점을 별도로 적용한다", () => {
    expect(voicingClusterCost({ upper: [60, 64, 67, 71] })).toBe(0);
    expect(voicingClusterCost({ upper: [60, 61, 65, 66] })).toBe(12);
    expect(voicingClusterCost({ upper: [60, 62, 64, 66] })).toBe(30);
    expect(voicingClusterCost({ upper: [60, 61, 63, 65] })).toBe(36);
  });
  it("명시적 잠금에서도 루트와 b9는 단9도 이상 떨어져야 한다", () => {
    const e = chord(4, "dom7", "E7"), a = chord(9, "min", "Am");
    const spaced = { bass: 40, upper: [52, 56, 59, 62, 65] };
    expect(computeVoicings([e, a], { neoSoul: true, locks: { 0: spaced } })[0]).toEqual(spaced);
    const clustered = { bass: 40, upper: [56, 59, 62, 64, 65] };
    expect(() => computeVoicings([e, a], { neoSoul: true, locks: { 0: clustered } })).toThrow();
  });
  it("rootless는 진행에 맞춰 A와 B 최저음을 함께 선택한다", () => {
    const result = computeVoicings(iiVI, { type: "rootless", neoSoul: true });
    const bottoms = result.map((v, i) => (v.upper[0] - iiVI[i].rootPc + 120) % 12);
    expect(bottoms.every((n, i) => [i === 0 ? 3 : 4, i === 2 ? 11 : 10].includes(n))).toBe(true);
    expect(new Set(bottoms.map((n, i) => n === (i === 0 ? 3 : 4) ? "A" : "B")).size).toBe(2);
  });
});


describe("음역과 고정 루트리스 순서", () => {
  it("평균 60~67 밖의 거리에 비례하고 C6 초과에 큰 벌점을 준다", () => {
    expect(voicingRegisterCost({ upper: [60, 64, 67] })).toBe(0);
    expect(voicingRegisterCost({ upper: [56, 59, 62] })).toBe(2);
    expect(voicingRegisterCost({ upper: [65, 68, 71] })).toBe(2);
    expect(voicingRegisterCost({ upper: [56, 64, 84] })).toBe(2);
    expect(voicingRegisterCost({ upper: [55, 64, 85] })).toBe(142);
  });
  it.each(["rootlessA", "rootlessB", "rootless"])("%s 결과는 모든 조와 확장음 설정에서 C6 이하에 머문다", type => {
    for (const neoSoul of [false, true]) {
      for (let transpose = 0; transpose < 12; transpose++) {
        const progression = nodes.map(node => ({ ...node, rootPc: (node.rootPc + transpose) % 12 }));
        const result = computeVoicings(progression, { type, neoSoul });
        for (const voicing of result) expect(voicing.upper.at(-1)).toBeLessThanOrEqual(84);
      }
      for (const voicing of computeVoicings(map.nodes, { type, neoSoul }))
        expect(voicing.upper.at(-1)).toBeLessThanOrEqual(84);
    }
  });
  it.each([["rootlessA", [4, 7, 11, 2], [3, 4, 3]], ["rootlessB", [11, 2, 4, 7], [3, 2, 3]]])(
    "%s는 Cmaj9의 성부 순서와 간격을 유지하고 전체 옥타브만 옮긴다", (type, order, gaps) => {
      for (const neoSoul of [false, true]) {
        for (let transpose = 0; transpose < 12; transpose++) {
          const progression = [chord(7, "dom7", "G7"), { ...c, rootPc: transpose }, chord(9, "min", "Am")];
          const upper = computeVoicings(progression, { type, neoSoul })[1].upper;
          expect(upper.map(n => (n - transpose + 120) % 12)).toEqual(order);
          expect(upper.slice(1).map((n, i) => n - upper[i])).toEqual(gaps);
        }
      }
    },
  );
  it.each(["rootlessA", "rootlessB", "rootless"])("%s는 neoSoul:false여도 단조행 dom7에 b9를 쓴다", type => {
    const e = chord(4, "dom7", "E7"), a = chord(9, "min", "Am");
    expect(displayName(e, { type }, a)).toBe("E7(b9)");
    const result = computeVoicings([e, a], { type });
    expect(pitchClasses(result[0])).toContain(5);
    expect(pitchClasses(result[0])).not.toContain(6);
    expect(e.kind).toBe("dom7");
  });
  it("음역 벌점은 명시적인 높은 잠금 음을 바꾸지 않는다", () => {
    const locked = { bass: 36, upper: [76, 79, 83, 86] };
    expect(computeVoicings([c], { type: "rootlessA", neoSoul: true, locks: { 0: locked } })[0]).toEqual(locked);
  });
});
