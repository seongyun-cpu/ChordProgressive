// 입력란에서는 브라우저의 편집 단축키를 그대로 사용한다.
export function shortcutAction(
  event,
  { editable = false, interactive = false } = {},
) {
  if (editable || event.isComposing || event.altKey) return null;
  const key = event.key?.toLowerCase();
  const code =
    event.code ||
    { z: "KeyZ", x: "KeyX", a: "KeyA", l: "KeyL", " ": "Space" }[key];
  if (event.metaKey || event.ctrlKey) {
    if (event.shiftKey) return null;
    return code === "KeyZ" ? "undo" : code === "KeyX" ? "clear" : null;
  }
  if (event.shiftKey) return null;
  if (code === "Space") return "play";
  if (code === "KeyA") return "walk";
  if (code === "KeyL") return "loop";
  if (key === "escape") return "stop";
  if (interactive) return null;
  return (
    {
      arrowleft: "previous",
      arrowright: "next",
      enter: "pick",
      backspace: "undo",
    }[key] ?? null
  );
}
