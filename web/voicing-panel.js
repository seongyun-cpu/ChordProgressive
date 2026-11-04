const NS = "http://www.w3.org/2000/svg";
const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const noteName = midi => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

// 건반은 음 표시용이다. 키보드 조작은 칩과 잠금 버튼에서 한다.
export function renderVoicingPanel({ index, name, voicing, locked }) {
  const panel = document.getElementById("voicing-panel");
  panel.hidden = !voicing;
  if (!voicing) return;
  document.getElementById("voicing-title").textContent = `${index + 1}. ${name}`;
  const lock = document.getElementById("voicing-lock");
  lock.textContent = locked ? "🔒 잠금 해제" : "🔓 보이싱 잠금";
  lock.setAttribute("aria-pressed", String(locked));
  const notes = `왼손 ${noteName(voicing.bass)} · 오른손 ${voicing.upper.map(noteName).join(" · ")}`;
  document.getElementById("voicing-notes").textContent = notes;
  const svg = document.getElementById("voicing-keyboard");
  svg.setAttribute("aria-label", `C2부터 C6 건반. ${notes}`);
  svg.replaceChildren();
  let whiteIndex = 0;
  const blackKeys = [];
  for (let midi = 36; midi <= 84; midi++) {
    const black = [1, 3, 6, 8, 10].includes(midi % 12);
    const group = document.createElementNS(NS, "g");
    const rect = document.createElementNS(NS, "rect");
    const hand = midi === voicing.bass ? "bass" : voicing.upper.includes(midi) ? "upper" : "";
    rect.setAttribute("class", `piano-key ${black ? "black" : "white"} ${hand}`);
    rect.setAttribute("data-midi", midi);
    rect.setAttribute("x", black ? whiteIndex * 24 - 7 : whiteIndex * 24);
    rect.setAttribute("y", 0);
    rect.setAttribute("width", black ? 14 : 24);
    rect.setAttribute("height", black ? 86 : 138);
    const title = document.createElementNS(NS, "title");
    title.textContent = `${noteName(midi)}${hand === "bass" ? " 왼손" : hand === "upper" ? " 오른손" : ""}`;
    rect.append(title);
    group.append(rect);
    if (!black && midi % 12 === 0) {
      const label = document.createElementNS(NS, "text");
      label.setAttribute("x", whiteIndex * 24 + 12);
      label.setAttribute("y", 126);
      label.setAttribute("text-anchor", "middle");
      label.textContent = noteName(midi);
      group.append(label);
    }
    if (black) blackKeys.push(group);
    else { svg.append(group); whiteIndex++; }
  }
  svg.append(...blackKeys);
  const outside = [voicing.bass, ...voicing.upper].filter(n => n < 36 || n > 84);
  document.getElementById("voicing-range").textContent = outside.length
    ? `건반 범위 밖: ${outside.map(noteName).join(" · ")}` : "";
}
