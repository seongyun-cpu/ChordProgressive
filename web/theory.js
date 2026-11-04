// theory.js — 코드 맵(그래프) + 음악 이론 순수 함수. UI/오디오와 분리.
//
// 구조 (릴스 레퍼런스 그림과 동일한 3겹 원)
//   바깥 원  : 5도권 순서로 [장조, 그 관계단조] 24개   C, Am, G, Em, D, Bm ...
//   가운데 원: 각 바깥 코드로 해결되는 세컨더리 도미넌트 7th 24개 (E7 → Am)
//   안쪽 원  : 각 장조 근음으로 반음 올라가 해결되는 감7화음 12개 (B° → C, Cm)
// 화살표 = "여기서 자연스럽게 갈 수 있는 다음 코드"

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export const QUALITY = {
  maj: { iv: [0, 4, 7], suffix: "" },
  min: { iv: [0, 3, 7], suffix: "m" },
  dom7: { iv: [0, 4, 7, 10], suffix: "7" },
  dim7: { iv: [0, 3, 6, 9], suffix: "°" },
  min7: { iv: [0, 3, 7, 10], suffix: "m7" },
};

const MAJOR_NAMES = [
  "C",
  "G",
  "D",
  "A",
  "E",
  "B",
  "F#",
  "Db",
  "Ab",
  "Eb",
  "Bb",
  "F",
];
const MINOR_NAMES = [
  "Am",
  "Em",
  "Bm",
  "F#m",
  "C#m",
  "G#m",
  "D#m",
  "Bbm",
  "Fm",
  "Cm",
  "Gm",
  "Dm",
];
// 감7화음은 이끈음(목표 근음 반음 아래)을 글자 하나 아래로 표기: F#의 이끈음은 E#
const DIM_NAMES = [
  "B",
  "F#",
  "C#",
  "G#",
  "D#",
  "A#",
  "E#",
  "C",
  "G",
  "D",
  "A",
  "E",
];

const pcOf = (name) => {
  const m = name.match(/^([A-G])([#b]?)/);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  return (base + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + 12) % 12;
};

// 목표 코드 이름의 조표 계열(샵/플랫)을 따라 도미넌트 이름을 정함
function spellLike(pc, targetName) {
  return (targetName.slice(1).startsWith("b") ? FLAT : SHARP)[pc];
}

/** 코드 맵 그래프 생성 → { nodes, edges } */
export function buildChordMap(options = {}) {
  const nodes = [];
  const add = (n) => {
    n.idx = nodes.length;
    nodes.push(n);
    return n;
  };

  // 바깥 원 24개: 짝수 = 장조, 홀수 = 관계단조
  const outer = [];
  for (let k = 0; k < 12; k++) {
    outer.push(
      add({
        id: MAJOR_NAMES[k],
        name: MAJOR_NAMES[k],
        ring: "outer",
        kind: "maj",
        rootPc: pcOf(MAJOR_NAMES[k]),
        slot: 2 * k,
      }),
    );
    outer.push(
      add({
        id: MINOR_NAMES[k],
        name: MINOR_NAMES[k],
        ring: "outer",
        kind: "min",
        rootPc: pcOf(MINOR_NAMES[k]),
        slot: 2 * k + 1,
      }),
    );
  }

  // 가운데 원 24개: outer[j]의 V7 (같은 이름이 두 번 나올 수 있음: G7 → C, G7 → Cm)
  const dom = outer.map((t, j) => {
    const pc = (t.rootPc + 7) % 12;
    const name = spellLike(pc, t.name) + "7";
    return add({
      id: `${name}>${t.name}`,
      name,
      ring: "dom",
      kind: "dom7",
      rootPc: pc,
      slot: j,
      target: t.idx,
    });
  });

  // 안쪽 원 12개: 장조 k의 이끈음 감7
  const dim = MAJOR_NAMES.map((maj, k) => {
    const name = DIM_NAMES[k] + "°";
    return add({
      id: `${name}>${maj}`,
      name,
      ring: "dim",
      kind: "dim7",
      rootPc: (pcOf(maj) + 11) % 12,
      slot: k,
      targetPc: pcOf(maj),
    });
  });

  const edges = [];
  const link = (a, b, type) => edges.push({ from: a.idx, to: b.idx, type });
  const N = outer.length;
  for (let j = 0; j < N; j++) {
    const here = outer[j],
      next = outer[(j + 1) % N];
    link(here, dom[(j + 1) % N], "walk"); // C → E7 (다음 코드의 도미넌트로)
    link(dom[j], here, "resolve"); // E7 → Am
    link(here, next, "ring"); // C → Am (바로 이웃으로)
    // 경과 감7: 다음 코드 근음으로 반음 상행 해결 (근음이 같은 감7 사용)
    const passing = dim.find((d) => d.targetPc === next.rootPc);
    if (passing) link(here, passing, "passing");
  }
  // 감7 → 같은 근음의 장조/단조 둘 다로 해결 (B° → C, Cm)
  for (const d of dim) {
    for (const o of outer) if (o.rootPc === d.targetPc) link(d, o, "resolve");
  }
  // 추가 경로도 앞 이웃에서 진입해 목표까지 화살표로 이어진다.
  for (const option of ["tritone", "backdoor", "iiV"]) {
    if (!options[option]) continue;
    for (const target of outer) {
      if (option !== "tritone" && target.kind !== "maj") continue;
      const offset = { tritone: 1, backdoor: 10, iiV: 2 }[option];
      const rootPc = (target.rootPc + offset) % 12;
      const kind = option === "iiV" ? "min7" : "dom7";
      const name =
        (option === "iiV" ? spellLike(rootPc, target.name) : FLAT[rootPc]) +
        QUALITY[kind].suffix;
      const node = add({
        id: `${option}:${name}>${target.id}`,
        name,
        ring: "extra",
        kind,
        rootPc,
        slot: target.slot,
        option,
        target: target.idx,
      });
      link(outer[(target.slot + N - 1) % N], node, option);
      link(node, option === "iiV" ? dom[target.slot] : target, option);
    }
  }
  return { nodes, edges };
}

export function nextOptions(map, nodeIdx) {
  return map.edges.filter((e) => e.from === nodeIdx);
}

// ---------- 소리 관련 ----------
export function chordMidi(node, octave = 4) {
  const base = 12 * (octave + 1) + node.rootPc;
  return QUALITY[node.kind].iv.map((i) => base + i);
}

// 이전 보이싱에서 가장 적게 움직이는 전위/옥타브 선택
export function voiceLead(prev, node) {
  const tones = chordMidi(node, 4);
  if (!prev?.length) return tones;
  const center = prev.reduce((a, b) => a + b, 0) / prev.length;
  let best = tones,
    bestCost = Infinity;
  for (let inv = 0; inv < tones.length; inv++) {
    for (const shift of [-12, 0, 12]) {
      const cand = tones
        .map((n, i) => (i < inv ? n + 12 : n) + shift)
        .sort((a, b) => a - b);
      const mean = cand.reduce((a, b) => a + b, 0) / cand.length;
      if (mean < 52 || mean > 76) continue; // 너무 낮거나 높은 보이싱 제외
      const cost =
        cand.reduce(
          (s, n, i) => s + Math.abs(n - (prev[i] ?? prev.at(-1))),
          0,
        ) +
        Math.abs(mean - center) * 0.5;
      if (cost < bestCost) {
        bestCost = cost;
        best = cand;
      }
    }
  }
  return best;
}

export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 화살표만 따라가는 랜덤 산책 (도미넌트 경로를 조금 더 선호)
export function randomWalk(map, startIdx, steps = 8, rand = Math.random) {
  if (!map.nodes[startIdx]) throw new RangeError("출발 코드가 없어요.");
  const path = [startIdx];
  let cur = startIdx;
  for (let s = 1; s < Math.max(1, Math.floor(steps)); s++) {
    const opts = nextOptions(map, cur);
    if (!opts.length) break;
    const weight = (edge) => (edge.type === "walk" ? 3 : 1);
    const total = opts.reduce((sum, edge) => sum + weight(edge), 0);
    let r = Math.max(0, Math.min(1, rand())) * total;
    const pick = opts.find((edge) => (r -= weight(edge)) < 0) ?? opts.at(-1);
    cur = pick.to;
    path.push(cur);
  }
  // ii–V처럼 두 번 해결하는 경로도 끝까지 따른다.
  const seen = new Set();
  while (map.nodes[cur].ring !== "outer") {
    if (seen.has(cur)) throw new Error("해결할 수 없는 순환 경로예요.");
    seen.add(cur);
    const edge = nextOptions(map, cur)[0];
    if (!edge) throw new Error("해결 코드가 없어요.");
    cur = edge.to;
    path.push(cur);
  }
  return path;
}

/** 전위와 옥타브 중복을 제거한 정확한 음 집합 판별. 감7은 후보가 여러 개다. */
export function recognizeChord(midiNotes) {
  const notes = Array.from(midiNotes ?? []);
  if (!notes.every((n) => Number.isInteger(n) && n >= 0 && n <= 127)) return [];
  const pcs = new Set(notes.map((n) => n % 12));
  const matches = [];
  for (let rootPc = 0; rootPc < 12; rootPc++) {
    for (const [kind, quality] of Object.entries(QUALITY)) {
      if (
        pcs.size === quality.iv.length &&
        quality.iv.every((interval) => pcs.has((rootPc + interval) % 12))
      ) {
        matches.push({ rootPc, kind, name: SHARP[rootPc] + quality.suffix });
      }
    }
  }
  return matches;
}

/** 툴팁용 구성음과 기능. 음명은 코드 철자에 맞춰 표시한다. */
export function chordDescription(node, map) {
  const letters = ["C", "D", "E", "F", "G", "A", "B"];
  const natural = [0, 2, 4, 5, 7, 9, 11];
  const rootLetter = letters.indexOf(node.name[0]);
  const tones = QUALITY[node.kind].iv.map((interval, i) => {
    const letter = (rootLetter + i * 2) % 7;
    let alteration =
      (((node.rootPc + interval - natural[letter]) % 12) + 12) % 12;
    if (alteration > 6) alteration -= 12;
    return (
      letters[letter] +
      (alteration >= 0 ? "#".repeat(alteration) : "b".repeat(-alteration))
    );
  });
  const target = map.nodes[node.target];
  let role;
  if (node.option === "tritone")
    role = `${target.name}으로 가는 트라이톤 대리 V7`;
  else if (node.option === "backdoor")
    role = `${target.name}으로 가는 백도어 ♭VII7`;
  else if (node.option === "iiV") role = `${target.name}의 ii–V를 시작하는 ii7`;
  else if (node.kind === "dom7") role = `${target.name}으로 가는 V7`;
  else if (node.kind === "dim7") {
    const targets = map.nodes
      .filter((n) => n.ring === "outer" && n.rootPc === node.targetPc)
      .map((n) => n.name);
    role = `${targets.join("·")}으로 반음 상행 해결하는 감7`;
  } else role = node.kind === "maj" ? "장3화음" : "단3화음";
  return `${node.name} = ${tones.join(" · ")} | ${role}`;
}

// 기본 맵의 3화음·도미넌트7·감7을 시작점으로 선택한다.
export function canStartChord(node) {
  return node.ring === "outer" || node.kind === "dom7" || node.kind === "dim7";
}
