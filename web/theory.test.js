import { describe, expect, it } from "vitest";
import {
  buildChordMap,
  canStartChord,
  nextOptions,
  randomWalk,
  chordMidi,
  voiceLead,
  midiToFreq,
  recognizeChord,
  chordDescription,
} from "./theory.js";

const map = buildChordMap();
const find = (id, graph = map) => graph.nodes.find((n) => n.id === id);
function validPath(graph, path) {
  for (let i = 1; i < path.length; i++) {
    expect(
      graph.edges.some((e) => e.from === path[i - 1] && e.to === path[i]),
    ).toBe(true);
  }
  expect(graph.nodes[path.at(-1)].ring).toBe("outer");
}
function seeded(seed) {
  return () => (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;
}

describe("기본 코드 맵", () => {
  it("고유한 60개 노드와 올바른 원 구성을 만든다", () => {
    expect(map.nodes).toHaveLength(60);
    expect(new Set(map.nodes.map((n) => n.id)).size).toBe(60);
    expect(map.nodes.filter((n) => n.ring === "outer")).toHaveLength(24);
    expect(map.nodes.filter((n) => n.ring === "dom")).toHaveLength(24);
    expect(map.nodes.filter((n) => n.ring === "dim")).toHaveLength(12);
    map.nodes.forEach((n, i) => expect(n.idx).toBe(i));
    map.edges.forEach((e) => {
      expect(map.nodes[e.from]).toBeDefined();
      expect(map.nodes[e.to]).toBeDefined();
    });
  });
  it("모든 V7 근음은 목표보다 완전5도 위다", () => {
    for (const n of map.nodes.filter((n) => n.ring === "dom")) {
      expect(n.rootPc).toBe((map.nodes[n.target].rootPc + 7) % 12);
      expect(nextOptions(map, n.idx)).toContainEqual({
        from: n.idx,
        to: n.target,
        type: "resolve",
      });
    }
  });
  it("감7은 모든 해결 목표의 반음 아래에 있다", () => {
    for (const n of map.nodes.filter((n) => n.kind === "dim7")) {
      expect(n.rootPc).toBe((n.targetPc + 11) % 12);
      expect(nextOptions(map, n.idx)).toHaveLength(2);
      for (const edge of nextOptions(map, n.idx))
        expect(map.nodes[edge.to].rootPc).toBe(n.targetPc);
    }
  });
  it("릴스 예시 진행 전체가 연결되어 있다", () => {
    validPath(
      map,
      ["C", "E7>Am", "Am", "D7>G", "G", "B7>Em", "Em"].map(
        (id) => find(id).idx,
      ),
    );
  });
  it("여러 시드·길이·출발점에서 화살표만 따라 바깥 원에서 끝난다", () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const start of map.nodes)
        validPath(map, randomWalk(map, start.idx, seed % 11, seeded(seed)));
    }
  });
});

describe("추가 화성 경로", () => {
  it.each([
    ["tritone", 84, "tritone:Db7>C", 1, "dom7"],
    ["backdoor", 72, "backdoor:Bb7>C", 10, "dom7"],
    ["iiV", 72, "iiV:Dm7>C", 2, "min7"],
  ])(
    "%s 옵션은 독립적으로 추가되고 기본 노드는 안정적이다",
    (option, count, id, pc, kind) => {
      const graph = buildChordMap({ [option]: true });
      expect(graph.nodes).toHaveLength(count);
      expect(graph.nodes.slice(0, 60)).toEqual(map.nodes);
      const extra = find(id, graph);
      expect(extra).toMatchObject({
        rootPc: pc,
        kind,
        ring: "extra",
        option,
        target: 0,
        slot: 0,
      });
      expect(
        graph.edges.some(
          (e) => e.to === extra.idx && graph.nodes[e.from].ring === "outer",
        ),
      ).toBe(true);
      const target = option === "iiV" ? find("G7>C", graph) : find("C", graph);
      expect(nextOptions(graph, extra.idx)).toContainEqual({
        from: extra.idx,
        to: target.idx,
        type: option,
      });
    },
  );
  it("모든 옵션 조합과 추가 노드 출발에서도 완전히 해결한다", () => {
    for (let mask = 0; mask < 8; mask++) {
      const graph = buildChordMap({
        tritone: mask & 1,
        backdoor: mask & 2,
        iiV: mask & 4,
      });
      expect(new Set(graph.nodes.map((n) => n.id)).size).toBe(
        graph.nodes.length,
      );
      for (const start of graph.nodes) {
        validPath(
          graph,
          randomWalk(graph, start.idx, 1, () => 0),
        );
        validPath(
          graph,
          randomWalk(graph, start.idx, 23, seeded(start.idx + mask)),
        );
      }
    }
  });
  it("ii7에서 시작하는 한 단계 산책은 V7을 거쳐 으뜸으로 끝난다", () => {
    const graph = buildChordMap({ iiV: true });
    expect(
      randomWalk(graph, find("iiV:Dm7>C", graph).idx, 1).map(
        (i) => graph.nodes[i].name,
      ),
    ).toEqual(["Dm7", "G7", "C"]);
  });
});

describe("보이싱·음 집합 인식", () => {
  it("코드 구성음과 기준 주파수가 정확하다", () => {
    expect(chordMidi(find("C"))).toEqual([60, 64, 67]);
    expect(chordMidi(find("E7>Am"))).toEqual([64, 68, 71, 74]);
    expect(midiToFreq(69)).toBe(440);
  });
  it("보이스 리딩은 구성 음 집합을 보존하고 유한한 MIDI 음을 낸다", () => {
    let previous = null;
    for (const node of buildChordMap({ iiV: true }).nodes) {
      const voiced = voiceLead(previous, node);
      expect(new Set(voiced.map((n) => n % 12))).toEqual(
        new Set(chordMidi(node).map((n) => n % 12)),
      );
      expect(
        voiced.every((n) => Number.isInteger(n) && n >= 0 && n <= 127),
      ).toBe(true);
      previous = voiced;
    }
    expect(voiceLead([], find("C"))).toEqual(chordMidi(find("C")));
  });
  it.each([
    [[60, 64, 67], 0, "maj"],
    [[64, 67, 72, 84], 0, "maj"],
    [[69, 72, 76], 9, "min"],
    [[64, 68, 71, 74], 4, "dom7"],
    [[62, 65, 69, 72], 2, "min7"],
  ])("%j의 전위와 중복 음을 인식한다", (notes, rootPc, kind) => {
    expect(recognizeChord(notes)).toEqual([
      expect.objectContaining({ rootPc, kind }),
    ]);
  });
  it("감7은 대칭적인 네 가지 근음 후보를 모두 돌려준다", () => {
    expect(recognizeChord([59, 62, 65, 68]).map((n) => n.rootPc)).toEqual([
      2, 5, 8, 11,
    ]);
  });
  it("불완전하거나 잘못된 음 집합은 추측하지 않는다", () => {
    for (const notes of [
      [],
      [60],
      [60, 64],
      [60, 61, 62],
      [60, 64, 67, 70, 71],
      [-1, 60],
      [NaN],
      [128],
      [60.5],
    ]) {
      expect(recognizeChord(notes)).toEqual([]);
    }
  });
  it("툴팁은 구성음 철자와 해결 기능을 설명한다", () => {
    expect(chordDescription(find("E7>Am"), map)).toBe(
      "E7 = E · G# · B · D | Am으로 가는 V7",
    );
    expect(chordDescription(find("E#°>F#"), map)).toContain("E# · G# · B · D");
    const graph = buildChordMap({ tritone: true });
    expect(chordDescription(find("tritone:Db7>C", graph), graph)).toBe(
      "Db7 = Db · F · Ab · Cb | C으로 가는 트라이톤 대리 V7",
    );
  });
});

describe("시작 코드", () => {
  it("바깥 원과 가운데 원의 모든 7코드를 허용한다", () => {
    expect(map.nodes.filter(canStartChord)).toHaveLength(48);
    for (const node of map.nodes.filter(n => n.ring === "dom")) {
      expect(canStartChord(node)).toBe(true);
      expect(nextOptions(map, node.idx).some(e => e.to === node.target)).toBe(true);
    }
  });
  it("추가 도미넌트7도 허용하고 감7의 기존 제한은 유지한다", () => {
    const extended = buildChordMap({tritone:true, backdoor:true});
    expect(extended.nodes.filter(n => n.kind === "dom7").every(canStartChord)).toBe(true);
    expect(extended.nodes.filter(n => n.kind === "dim7").some(canStartChord)).toBe(false);
  });
});
