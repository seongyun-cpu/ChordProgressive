import { describe, it, expect } from "vitest";
import { buildChordMap } from "./theory.js";
import { parseProgressionText, formatProgressionText } from "./progression-text.js";
const map = buildChordMap();
const nodes = ids => ids.map(id => map.nodes.find(node => node.id === id));

describe("코드 텍스트 입출력", () => {
  it.each(["C E7 Am", "C-E7-Am", "C | E7 | Am", "C – E7 – Am", "C—E7—Am", " C\nE7\tAm "])("%s를 같은 진행으로 읽는다", text => {
    expect(parseProgressionText(text, map)).toEqual({ ids: ["C", "E7>Am", "Am"], unknown: [] });
  });
  it("같은 이름의 도미넌트는 다음 코드의 해결 대상을 우선한다", () => {
    expect(parseProgressionText("E7 A E7 Am", map).ids).toEqual(["E7>A", "A", "E7>Am", "Am"]);
    expect(parseProgressionText("E7", map).ids).toEqual([map.nodes.find(n => n.name === "E7").id]);
  });
  it("같은 코드 반복, 샵·플랫과 감화음을 유지한다", () => {
    expect(parseProgressionText("C C F♯ B♭ B°", map)).toEqual({ ids: ["C", "C", "F#", "Bb", "B°>C"], unknown: [] });
  });
  it("알 수 없는 코드를 알리고 그 다음을 건너뛰어 해결 대상을 추측하지 않는다", () => {
    const result = parseProgressionText("C H7 Am? E7 mystery A", map);
    expect(result.unknown).toEqual(["H7", "Am?", "mystery"]);
    expect(result.ids).toEqual(["C", map.nodes.find(n => n.name === "E7").id, "A"]);
  });
  it("복사 형식과 선택적 보이싱 이름을 만든다", () => {
    const progression = nodes(["C", "E7>Am", "Am", "D7>G"]);
    expect(formatProgressionText(progression)).toBe("C – E7 – Am – D7");
    const copied = formatProgressionText(progression, { neoSoul: true }, true);
    expect(copied).toBe("Cmaj9 – E7(b9) – Am9 – D7");
    expect(parseProgressionText(copied, map)).toEqual({ ids: ["C", "E7>Am", "Am", "D7>G"], unknown: [] });
    expect(formatProgressionText(nodes(["C", "Am"]), { seventh: true }, true)).toBe("Cmaj7 – Am7");
  });
  it("빈 입력과 제한을 처리한다", () => {
    expect(parseProgressionText("  ", map)).toEqual({ ids: [], unknown: [] });
    expect(formatProgressionText([])).toBe("");
    expect(() => parseProgressionText(null, map)).toThrow();
    expect(() => parseProgressionText("C ".repeat(1025), map)).toThrow();
  });
});
