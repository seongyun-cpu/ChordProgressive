import { describe, it, expect } from "vitest";
import { shortcutAction } from "./shortcuts.js";
describe("공통 단축키", () => {
  for (const modifier of ["metaKey", "ctrlKey"]) {
    it(`${modifier} 되돌리기와 비우기를 분리한다`, () => {
      expect(shortcutAction({ code: "KeyZ", [modifier]: true })).toBe("undo");
      expect(shortcutAction({ code: "KeyX", [modifier]: true })).toBe("clear");
      expect(
        shortcutAction({ code: "KeyZ", [modifier]: true, shiftKey: true }),
      ).toBeNull();
    });
  }
  it("A·L·Space는 버튼에 초점이 있어도 작동한다", () => {
    for (const [code, action] of [
      ["KeyA", "walk"],
      ["KeyL", "loop"],
      ["Space", "play"],
    ]) {
      expect(shortcutAction({ code }, { interactive: true })).toBe(action);
    }
  });
  it("입력 중 편집·공백·한글 조합을 방해하지 않는다", () => {
    for (const code of ["KeyZ", "KeyX", "KeyA", "KeyL", "Space"]) {
      expect(shortcutAction({ code }, { editable: true })).toBeNull();
      expect(
        shortcutAction({ code, ctrlKey: true }, { editable: true }),
      ).toBeNull();
      expect(shortcutAction({ code, isComposing: true })).toBeNull();
    }
  });
  it("브라우저 단축키와 버튼 Enter를 가로채지 않는다", () => {
    expect(shortcutAction({ code: "KeyL", metaKey: true })).toBeNull();
    expect(shortcutAction({ code: "KeyA", ctrlKey: true })).toBeNull();
    expect(shortcutAction({ code: "KeyX", altKey: true })).toBeNull();
    expect(shortcutAction({ key: "Enter" }, { interactive: true })).toBeNull();
  });
  it("기존 후보 탐색과 되돌리기를 유지한다", () => {
    for (const [key, action] of [
      ["ArrowLeft", "previous"],
      ["ArrowRight", "next"],
      ["Enter", "pick"],
      ["Backspace", "undo"],
      ["Escape", "stop"],
    ])
      expect(shortcutAction({ key })).toBe(action);
  });
});
