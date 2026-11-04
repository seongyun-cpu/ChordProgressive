import { QUALITY, voiceLead } from "./theory.js";

const TYPES = ["auto", "close", "shell", "drop2", "rootlessA", "rootlessB", "spread"];
const HARMONIES = {
  maj: [0, 4, 7, 11], maj7: [0, 4, 7, 11], maj9: [0, 4, 7, 11, 14],
  min: [0, 3, 7, 10], min7: [0, 3, 7, 10], min9: [0, 3, 7, 10, 14],
  dom7: [0, 4, 7, 10], dom13: [0, 4, 10, 14, 21], dim7: [0, 3, 6, 9],
};
const pc = note => ((note % 12) + 12) % 12;
const rootless = type => type === "rootlessA" || type === "rootlessB";

function settings(options) {
  const { type = "auto", neoSoul = false, locks = {} } = options;
  if (!TYPES.includes(type) || typeof neoSoul !== "boolean" ||
      !locks || typeof locks !== "object" || Array.isArray(locks))
    throw new TypeError("보이싱 설정을 확인해주세요.");
  return { type, neoSoul, locks };
}

function validateNode(node) {
  if (!node || !Object.hasOwn(HARMONIES, node.kind) ||
      !Number.isInteger(node.rootPc) || node.rootPc < 0 || node.rootPc > 11)
    throw new TypeError("코드의 종류와 근음을 확인해주세요.");
}

// 노드와 그래프는 그대로 두고 연주할 화음만 확장한다.
function harmony(node, options, nextNode) {
  const minor = node.kind.startsWith("min");
  const major = node.kind.startsWith("maj");
  const dominant = node.kind.startsWith("dom");
  let intervals = [...HARMONIES[node.kind]];
  let suffix = major ? "maj7" : minor ? "m7" : dominant ? "7" : "°";
  if (major && (options.neoSoul || rootless(options.type) || node.kind === "maj9")) {
    intervals = [0, 4, 7, 11, 14];
    suffix = "maj9";
  } else if (minor && (options.neoSoul || rootless(options.type) || node.kind === "min9")) {
    intervals = [0, 3, 7, 10, 14];
    suffix = "m9";
  } else if (dominant && (options.neoSoul || rootless(options.type) || node.kind === "dom13")) {
    if (nextNode?.kind.startsWith("min")) {
      intervals = [0, 4, 7, 10, 13];
      suffix = "7(b9)";
    } else if (nextNode?.kind.startsWith("maj") || rootless(options.type) || node.kind === "dom13") {
      // 13화음은 5음을 생략한다. 장조의 자연 11음은 추가하지 않는다.
      intervals = [0, 4, 10, 14, 21];
      suffix = "13";
    }
  }
  return { intervals, suffix, guides: [intervals[1], node.kind === "dim7" ? 9 : major ? 11 : 10] };
}

/** UI용 이름만 반환하며 node.name/id/kind를 변경하지 않는다. */
export function displayName(node, options = {}, nextNode) {
  validateNode(node);
  const config = settings(options);
  if (config.type === "auto" && !config.neoSoul && !Object.keys(config.locks).length && QUALITY[node.kind])
    return node.name;
  const root = node.name?.match(/^[A-G](?:#{1,2}|b{1,2}|♯|♭)?/)?.[0] ??
    ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"][node.rootPc];
  return root + harmony(node, config, nextNode).suffix;
}

// E3より低い音を起点に、長3度以下の密集を避ける。ベースも含める。
function lowIntervalsOK(voicing) {
  const notes = [voicing.bass, ...voicing.upper].sort((a, b) => a - b);
  return notes.every((note, i) => !i || notes[i - 1] >= 52 || note - notes[i - 1] > 4);
}

function validForChord(voicing, node, harmonic, type) {
  if (!isValidVoicing(voicing) || pc(voicing.bass) !== node.rootPc ||
      voicing.upper[0] <= voicing.bass || !lowIntervalsOK(voicing)) return false;
  const relative = voicing.upper.map(note => pc(note - node.rootPc));
  return voicing.upper.every((note, i) => !i || note > voicing.upper[i - 1]) &&
    relative.every(note => harmonic.intervals.some(interval => pc(interval) === note) ||
      (node.kind.startsWith("maj") && note === 6)) &&
    harmonic.guides.every(note => relative.includes(pc(note))) &&
    (!rootless(type) || !relative.includes(0));
}

function shape(node, harmonic, type) {
  let intervals = harmonic.intervals;
  if (type === "shell" && node.kind !== "dim7")
    intervals = [...harmonic.guides, ...intervals.filter(n => n > 12)];
  if (rootless(type)) intervals = intervals.filter(n => n !== 0);
  // Close는 한 옥타브 안에 모으고, rootless A는 3음부터 쌓는다.
  if (["close", "drop2", "spread"].includes(type))
    intervals = intervals.map(pc).sort((a, b) => a - b);
  if (rootless(type))
    intervals = intervals.map(pc).map(n => n < harmonic.guides[0] ? n + 12 : n)
      .sort((a, b) => a - b);
  let upper = intervals.map(n => 60 + node.rootPc + n);
  if (type === "rootlessB") {
    const seventh = 60 + node.rootPc + harmonic.guides[1];
    upper = upper.map(n => n < seventh ? n + 12 : n).sort((a, b) => a - b);
  }
  if (type === "drop2") {
    upper[upper.length - 2] -= 12;
    upper.sort((a, b) => a - b);
  }
  if (type === "spread") {
    upper = upper.map((note, i) => note + (i >= Math.ceil(upper.length / 2) ? 12 : 0));
  }
  return upper;
}

function candidates(node, harmonic, type) {
  const bass = 36 + node.rootPc;
  const result = [];
  const seen = new Set();
  const shapes = type === "auto" ? ["close", "drop2", "spread"] : [type];
  for (const form of shapes) {
    const base = shape(node, harmonic, form);
    // 고정 타입은 형태를 유지하고 auto만 전위도 탐색한다.
    const inversions = type === "auto" ? base.length : 1;
    for (let inversion = 0; inversion < inversions; inversion++) {
      const inverted = base.map((n, i) => n + (i < inversion ? 12 : 0)).sort((a, b) => a - b);
      for (const shift of [0, -12, 12, -24]) {
        const voicing = { bass, upper: inverted.map(n => n + shift) };
        const key = voicing.upper.join(",");
        if (!seen.has(key) && voicing.upper[0] >= 48 && voicing.upper.at(-1) <= 88 &&
            validForChord(voicing, node, harmonic, type)) {
          seen.add(key);
          result.push(voicing);
        }
      }
    }
  }
  if (!result.length) throw new RangeError("연주 가능한 보이싱이 없어요.");
  return result;
}

/** 아래에서 위 순서의 성부 이동 비용. 음 개수가 다르면 끝 성부를 대응시킨다. */
export function voicingTransitionCost(from, to) {
  let cost = Math.abs(from.bass - to.bass);
  const count = Math.max(from.upper.length, to.upper.length);
  for (let i = 0; i < count; i++)
    cost += Math.abs((from.upper[i] ?? from.upper.at(-1)) - (to.upper[i] ?? to.upper.at(-1)));
  const topLeap = Math.abs(from.upper.at(-1) - to.upper.at(-1));
  cost += Math.max(0, topLeap - 4) * 8;
  // 순서가 뒤집힌 성부는 교차로 계산한다. 생성 후보는 교차를 미리 제거한다.
  for (let i = 0; i < count; i++)
    for (let j = i + 1; j < count; j++)
      if ((from.upper[i] - from.upper[j]) * (to.upper[i] - to.upper[j]) < 0) cost += 24;
  return cost;
}

function optimize(layers) {
  if (!layers.length) return [];
  let costs = layers[0].map(() => 0);
  const parents = [];
  for (let index = 1; index < layers.length; index++) {
    const parent = [];
    const nextCosts = layers[index].map((current, j) => {
      let best = Infinity;
      layers[index - 1].forEach((previous, i) => {
        const cost = costs[i] + voicingTransitionCost(previous, current);
        if (cost < best) { best = cost; parent[j] = i; }
      });
      return best;
    });
    parents[index] = parent;
    costs = nextCosts;
  }
  let cursor = costs.indexOf(Math.min(...costs));
  const result = Array(layers.length);
  for (let index = layers.length - 1; index >= 0; index--) {
    result[index] = layers[index][cursor];
    cursor = parents[index]?.[cursor];
  }
  return result;
}

/**
 * @param {Array<{rootPc: number, kind: string}>} nodes
 * @param {{type?: 'auto'|'close'|'shell'|'drop2'|'rootlessA'|'rootlessB'|'spread', neoSoul?: boolean, locks?: Object<number, {bass: number, upper: number[]}>}} options
 * 기본 auto/neoSoul:false/잠금 없음은 기존 triad까지 보존한다.
 * 새 모드는 maj/min에 7음을 포함하며, auto는 전체 후보 경로를 최적화한다.
 * 잠금은 정확한 MIDI 음을 고정한다. 화음·저음 간격 위반은 오류로 알린다.
 */
export function computeVoicings(nodes, options = {}) {
  if (!Array.isArray(nodes)) throw new TypeError("코드 배열을 전달해주세요.");
  nodes.forEach(validateNode);
  const config = settings(options);
  for (const index of Object.keys(config.locks))
    if (!/^(0|[1-9]\d*)$/.test(index) || Number(index) >= nodes.length)
      throw new RangeError("잠금 코드 위치를 확인해주세요.");
  // 기존 triad/voiceLead 경로는 기본 설정에 한해서만 호환성을 유지한다.
  if (config.type === "auto" && !config.neoSoul && !Object.keys(config.locks).length &&
      nodes.every(node => QUALITY[node.kind])) {
    let previous = null;
    return nodes.map(node => {
      previous = voiceLead(previous, node);
      return { bass: 36 + node.rootPc, upper: previous };
    });
  }
  const layers = nodes.map((node, index) => {
    const harmonic = harmony(node, config, nodes[index + 1]);
    if (Object.hasOwn(config.locks, index)) {
      const locked = config.locks[index];
      if (!validForChord(locked, node, harmonic, config.type))
        throw new RangeError(`${index + 1}번째 잠금 보이싱이 화음·음역 규칙에 맞지 않아요.`);
      return [{ bass: locked.bass, upper: [...locked.upper] }];
    }
    return candidates(node, harmonic, config.type);
  });
  return config.type === "auto" ? optimize(layers) : layers.map(layer => layer[0]);
}

// 재생과 파일 출력은 이미 계산된 MIDI 음만 받는다.
export function isValidVoicing(voicing) {
  const isMidi = note => Number.isInteger(note) && note >= 0 && note <= 127;
  return !!voicing && isMidi(voicing.bass) && Array.isArray(voicing.upper)
    && voicing.upper.length > 0 && voicing.upper.every(isMidi);
}
