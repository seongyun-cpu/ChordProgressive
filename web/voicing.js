import { voiceLead } from "./theory.js";

/** 코드 순서대로 보이싱을 계산한다. options는 향후 타입·잠금·확장음 설정용이다. */
export function computeVoicings(nodes, options = {}) {
  let previous = null;
  return nodes.map(node => {
    previous = voiceLead(previous, node);
    return { bass: 36 + node.rootPc, upper: previous };
  });
}

// 재생과 파일 출력은 이미 계산된 MIDI 음만 받는다.
export function isValidVoicing(voicing) {
  const isMidi = note => Number.isInteger(note) && note >= 0 && note <= 127;
  return !!voicing && isMidi(voicing.bass) && Array.isArray(voicing.upper)
    && voicing.upper.length > 0 && voicing.upper.every(isMidi);
}
