import { recognizeChord } from "./theory.js";
// 노트온 묶음만 인식: 손을 떼는 중 생기는 다른 화음은 추가하지 않는다.
export function createMidiHandler(
  onChord,
  { delay = 100, setTimer = setTimeout, clearTimer = clearTimeout } = {},
) {
  const held = new Map();
  let timer,
    last = "";
  const message = (data, source = "default") => {
    const [status, note, velocity] = data,
      type = status & 0xf0,
      channel = status & 15,
      key = `${source}:${channel}:${note}`;
    if (type === 0xb0 && (note === 120 || note === 123)) {
      for (const k of held.keys())
        if (k.startsWith(`${source}:${channel}:`)) held.delete(k);
      clearTimer(timer);
      last = "";
      return;
    }
    if (type === 0x90 && velocity > 0) {
      held.set(key, note);
      clearTimer(timer);
      timer = setTimer(() => {
        const notes = [...held.values()],
          signature = [...new Set(notes.map((n) => n % 12))]
            .sort((a, b) => a - b)
            .join(",");
        if (signature === last) return;
        const matches = recognizeChord(notes);
        if (matches.length) {
          last = signature;
          onChord(matches);
        }
      }, delay);
    } else if (type === 0x80 || (type === 0x90 && velocity === 0)) {
      held.delete(key);
      clearTimer(timer);
      if (!held.size) last = "";
    }
  };
  return {
    message,
    reset() {
      held.clear();
      clearTimer(timer);
      last = "";
    },
  };
}
export async function connectMidi({ onChord, onStatus = () => {} }) {
  if (!navigator.requestMIDIAccess)
    throw new Error(
      "이 브라우저는 Web MIDI를 지원하지 않습니다. Chrome/Edge에서 연결해주세요.",
    );
  const access = await navigator.requestMIDIAccess({ sysex: false }),
    handler = createMidiHandler(onChord),
    bound = new Set();
  function bind() {
    handler.reset();
    for (const input of bound) input.onmidimessage = null;
    bound.clear();
    for (const input of access.inputs.values()) {
      if (input.state === "disconnected") continue;
      input.onmidimessage = (e) => handler.message(e.data, input.id);
      bound.add(input);
    }
    onStatus(
      bound.size
        ? `MIDI 입력 ${bound.size}개 연결 · 화음을 눌러주세요.`
        : "MIDI 장치가 없습니다. USB 건반을 연결해주세요.",
    );
  }
  access.onstatechange = bind;
  bind();
  return () => {
    access.onstatechange = null;
    for (const input of bound) input.onmidimessage = null;
    handler.reset();
    onStatus("MIDI 연결을 해제했습니다.");
  };
}
