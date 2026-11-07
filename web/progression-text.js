import { displayName } from "./voicing.js";

const normalize = text => text.replaceAll("♯", "#").replaceAll("♭", "b");

function matchingNodes(token, map) {
  const name = normalize(token);
  const exact = map.nodes.filter(node => normalize(node.name) === name || normalize(node.id) === name);
  if (exact.length) return exact;
  // 보이싱 이름으로 복사한 텍스트도 원래 맵 노드로 읽는다. 설정은 바꾸지 않는다.
  const base = name.replace(/maj(?:7|9)$/, "").replace(/m9$/, "m")
    .replace(/7\(b9\)$/, "7").replace(/(?:13|9)$/, "7");
  const triad = base.replace(/m7$/, "m");
  return map.nodes.filter(node => normalize(node.name) === triad);
}

/** 구분자를 읽고 같은 이름의 노드는 다음 코드로 해결되는 후보를 우선한다. */
export function parseProgressionText(text, map) {
  if (typeof text !== "string" || text.length > 150000)
    throw new Error("붙여넣을 코드 진행의 길이를 확인해주세요.");
  const tokens = text.trim().split(/[\s|–—-]+/u).filter(Boolean);
  if (tokens.length > 1024) throw new Error("코드는 1024개까지 불러올 수 있어요.");
  const matches = tokens.map(token => matchingNodes(token, map));
  const ids = [], unknown = [];
  matches.forEach((candidates, index) => {
    if (!candidates.length) { unknown.push(tokens[index]); return; }
    const targets = new Set((matches[index + 1] ?? []).map(node => node.idx));
    const resolving = candidates.find(node => map.edges.some(edge =>
      edge.from === node.idx && edge.type === "resolve" && targets.has(edge.to)));
    ids.push((resolving ?? candidates[0]).id);
  });
  return { ids, unknown };
}

export function formatProgressionText(nodes, options = {}, useVoicingNames = false) {
  return nodes.map((node, index) => useVoicingNames
    ? displayName(node, options, nodes[index + 1]) : node.name).join(" – ");
}
