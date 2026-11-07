import { canStartChord, nextOptions } from "./theory.js";

// 반복 입력만 허용한다. 그래프에 자기 자신으로 가는 화살표는 추가하지 않는다.
export function canPickChord(map, path, index, strict) {
  if (!map.nodes[index]) return false;
  if (!strict) return true;
  if (!path.length) return canStartChord(map.nodes[index]);
  return path.at(-1) === index || nextOptions(map, path.at(-1)).some(edge => edge.to === index);
}

export function isEdgeVisible(edge, { current, hovered, allArrows = false, categoryVisible = true }) {
  return categoryVisible && (allArrows || edge.from === current || edge.from === hovered);
}
