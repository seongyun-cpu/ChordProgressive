import {
  buildChordMap,
  canStartChord,
  nextOptions,
  randomWalk,
  chordDescription,
} from "./theory.js";
import { computeVoicings } from "./voicing.js";
import { shortcutAction } from "./shortcuts.js";
import { AudioEngine } from "./audio.js";
import {
  encodeProgression,
  decodeProgression,
  listProgressions,
  saveProgression,
  deleteProgression,
  makeMidi,
  downloadBlob,
  exportPNG,
} from "./storage.js";
import { connectMidi } from "./midi-input.js";
const $ = (id) => document.getElementById(id),
  svg = $("map"),
  NS = "http://www.w3.org/2000/svg";
const engine = new AudioEngine();
let map = buildChordMap(),
  rotation = 0,
  prog = [],
  focus = 0,
  startSlot = 0,
  playing = false,
  playIdx = -1,
  demoFrame = 0,
  demoActive = false,
  duration = 1,
  serialWriter = null;
let nodes = [],
  edges = [],
  usedLayer;
const visible = { dominant: true, ring: true, passing: true };
const settings = () => ({
  strict: $("strict").checked,
  rotation,
  bpm: Math.max(40, Math.min(200, +$("bpm").value || 90)),
  beats: +$("beats").value,
  timbre: $("timbre").value,
  rhythm: $("rhythm").value,
  loop: $("loop").getAttribute("aria-pressed") === "true",
  tritone: $("tritone").checked,
  backdoor: $("backdoor").checked,
  iiV: $("iiV").checked,
});
const status = (text) => {
  $("status").textContent = text;
};
const run = (fn) => async () => {
  try {
    await fn();
  } catch (error) {
    status(error.message);
  }
};
function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.append(e);
  return e;
}
function opts() {
  return prog.length ? nextOptions(map, prog.at(-1)) : [];
}
function position() {
  for (const n of map.nodes) {
    let angle = -90 + n.slot * (n.ring === "dim" ? 30 : 15),
      r = { outer: 330, dom: 255, dim: 165, extra: 110 }[n.ring];
    if (n.ring === "dom") angle -= 5;
    if (n.ring === "extra") {
      r = { tritone: 425, backdoor: 490, iiV: 555 }[n.option];
      angle += n.option === "tritone" ? 4 : 0;
    }
    angle = ((angle + rotation) * Math.PI) / 180;
    n.x = r * Math.cos(angle);
    n.y = r * Math.sin(angle);
  }
}
const radius = (n) => (n.ring === "outer" ? 24 : n.ring === "dim" ? 19 : 22);
function curve(a, b, type) {
  const dist = Math.hypot(b.x - a.x, b.y - a.y),
    bend = type === "ring" ? 1.12 : dist > 250 ? 0.55 : 0.88,
    cx = ((a.x + b.x) / 2) * bend,
    cy = ((a.y + b.y) / 2) * bend;
  const trim = (n) => {
    const l = Math.hypot(cx - n.x, cy - n.y) || 1;
    return [
      n.x + ((cx - n.x) / l) * (radius(n) + 4),
      n.y + ((cy - n.y) / l) * (radius(n) + 4),
    ];
  };
  const s = trim(a),
    e = trim(b);
  return `M${s} Q${cx},${cy} ${e}`;
}
function category(e) {
  return e.type === "ring"
    ? "ring"
    : e.type === "passing" || map.nodes[e.from].ring === "dim"
      ? "passing"
      : "dominant";
}
function draw() {
  const slot = (((-rotation / 15) % 24) + 24) % 24;
  $("rotation").value = Number.isInteger(slot) ? String(slot) : "free";
  position();
  const extent = Math.max(
    400,
    ...map.nodes.map((n) => Math.hypot(n.x, n.y) + 40),
  );
  svg.setAttribute(
    "viewBox",
    `${-extent} ${-extent} ${extent * 2} ${extent * 2}`,
  );
  svg.style.setProperty("--map-min", `${extent * 2 * 0.875}px`);
  svg.replaceChildren();
  const defs = el("defs", {}, svg);
  for (const [id, color] of [
    ["faint", "#bbb"],
    ["used", "#111"],
  ]) {
    const marker = el(
      "marker",
      {
        id,
        viewBox: "0 0 10 10",
        refX: 9,
        refY: 5,
        markerWidth: 6,
        markerHeight: 6,
        orient: "auto",
      },
      defs,
    );
    el("path", { d: "M0 0L10 5L0 10Z", fill: color }, marker);
  }
  const layer = el("g", {}, svg);
  usedLayer = el("g", {}, svg);
  edges = map.edges.map((e) =>
    el(
      "path",
      {
        d: curve(map.nodes[e.from], map.nodes[e.to], e.type),
        "marker-end": "url(#faint)",
      },
      layer,
    ),
  );
  const nl = el("g", {}, svg);
  nodes = map.nodes.map((n) => {
    const g = el(
      "g",
      {
        class: `node ${n.kind}`,
        transform: `translate(${n.x},${n.y})`,
        role: "button",
        tabindex: n.idx === 0 ? 0 : -1,
        "aria-label": chordDescription(n, map),
        "data-id": n.id,
      },
      nl,
    );
    el("title", {}, g).textContent = chordDescription(n, map);
    el("circle", { r: radius(n) + 6, class: "halo" }, g);
    if (n.kind === "dom7" || n.kind === "min7")
      el(
        "rect",
        { x: -24, y: -16, width: 48, height: 32, rx: 5, class: "shape" },
        g,
      );
    else el("circle", { r: radius(n), class: "shape" }, g);
    el("text", {}, g).textContent = n.name;
    el("circle", { r: 26, class: "hit" }, g);
    g.onclick = () => pick(n.idx);
    g.onpointerenter = (e) => {
      const tip = $("tooltip");
      tip.textContent = chordDescription(n, map);
      tip.hidden = false;
      tip.style.left =
        Math.max(8, Math.min(e.clientX + 12, innerWidth - 330)) + "px";
      tip.style.top = Math.min(e.clientY + 16, innerHeight - 90) + "px";
    };
    g.onpointerleave = () => {
      $("tooltip").hidden = true;
    };
    g.onfocus = () => status(chordDescription(n, map));
    g.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.stopPropagation();
        e.preventDefault();
        focused();
      }
    };
    return g;
  });
  render();
}
function render(animate = false) {
  const options = opts(),
    last = prog.at(-1),
    end = playing || demoActive ? playIdx : prog.length - 1,
    visited = new Set(prog.slice(0, end + 1));
  nodes.forEach((g, i) => {
    g.classList.toggle("used", visited.has(i));
    g.classList.toggle(
      "current",
      i === (playing || demoActive ? prog[playIdx] : last),
    );
    g.classList.toggle(
      "option",
      options.some((e) => e.to === i),
    );
    g.classList.toggle("focus", i === (options[focus]?.to ?? startSlot));
    g.classList.toggle("playing", playing && i === prog[playIdx]);
  });
  edges.forEach((p, i) => {
    const e = map.edges[i];
    p.setAttribute(
      "class",
      `edge ${category(e)} ${e.from === last ? "option" : ""} ${visible[category(e)] ? "" : "hidden"}`,
    );
  });
  usedLayer.replaceChildren();
  for (let i = 1; i <= end; i++) {
    const a = map.nodes[prog[i - 1]],
      b = map.nodes[prog[i]],
      edge = map.edges.find((e) => e.from === a.idx && e.to === b.idx);
    const p = el(
      "path",
      {
        d: curve(a, b, edge?.type),
        class: "edge used",
        "marker-end": "url(#used)",
      },
      usedLayer,
    );
    if (
      animate &&
      i === end &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const len = p.getTotalLength();
      p.animate(
        [
          { strokeDasharray: `${len}`, strokeDashoffset: len },
          { strokeDasharray: `${len}`, strokeDashoffset: 0 },
        ],
        {
          duration: duration * 1000 * 0.85,
          easing: "linear",
          fill: "forwards",
        },
      );
    }
  }
  $("chips").replaceChildren();
  prog.forEach((idx, i) => {
    const b = document.createElement("button");
    b.className = `chip ${i === prog.length - 1 ? "last" : ""} ${i === playIdx ? "playing" : ""}`;
    b.textContent = map.nodes[idx].name;
    b.title = "여기까지 되돌리기";
    b.onclick = () => {
      stop();
      prog = prog.slice(0, i + 1);
      focus = 0;
      render();
    };
    $("chips").append(b);
  });
  $("caption").replaceChildren();
  const strong = document.createElement("strong"),
    small = document.createElement("span");
  strong.textContent = demoActive
    ? "화살표를 따라, C에서 Em까지"
    : last === undefined
      ? "원하는 코드에서 출발하세요"
      : `${map.nodes[last].name}에서 화살표만 따라가요`;
  small.textContent = demoActive
    ? "시작 데모 · 코드를 누르면 바로 만들 수 있어요"
    : last === undefined
      ? "장조·단조·7코드·감7 중 원하는 코드를 골라주세요"
      : `다음 후보: ${options.map((e) => map.nodes[e.to].name).join(" · ")}`;
  $("caption").append(strong, small);
  $("candidates").replaceChildren();
  for (const [i, e] of options.entries()) {
    const b = document.createElement("button");
    b.textContent = map.nodes[e.to].name;
    b.setAttribute("aria-pressed", i === focus);
    b.onclick = () => pick(e.to);
    $("candidates").append(b);
  }
  $("play").textContent = playing ? "■ 정지" : "▶ 재생";
}
function stop() {
  engine.stop();
  cancelAnimationFrame(demoFrame);
  demoActive = false;
  playing = false;
  playIdx = -1;
  render();
}
function pick(idx) {
  if (demoActive) {
    stop();
    prog = [];
  } else if (playing) stop();
  if (
    $("strict").checked &&
    ((prog.length && !opts().some((e) => e.to === idx)) ||
      (!prog.length && !canStartChord(map.nodes[idx])))
  ) {
    status(
      "화살표로 연결된 후보를 선택하세요. 자유롭게 고르려면 화살표만 허용을 꺼주세요.",
    );
    return;
  }
  prog.push(idx);
  focus = 0;
  render();
  engine
    .audition(progressionVoicings().at(-1), settings())
    .catch((e) => status(e.message));
  sendSerial(map.nodes[idx].name);
}
async function play() {
  if (playing) return stop();
  stop();
  if (!prog.length) return status("먼저 코드를 선택하세요.");
  playing = true;
  render();
  try {
    await engine.start({
      voicings: progressionVoicings(),
      ...settings(),
      onStep(i, sec) {
        playIdx = i;
        duration = sec;
        render(true);
        sendSerial(map.nodes[prog[i]].name);
      },
      onEnd() {
        playing = false;
        playIdx = -1;
        render();
      },
    });
  } catch (e) {
    stop();
    status(e.message);
  }
}
function undo() {
  stop();
  prog.pop();
  focus = 0;
  render();
}
function clear() {
  if (prog.length >= 4 && !window.confirm("코드 진행을 모두 비울까요?")) return;
  stop();
  prog = [];
  focus = 0;
  render();
}
function walk() {
  stop();
  const path = randomWalk(map, prog.at(-1) ?? 0, 8);
  prog = prog.length ? [...prog, ...path.slice(1)] : path;
  render();
  void play();
}
function demo() {
  stop();
  prog = ["C", "E7>Am", "Am", "D7>G", "G", "B7>Em", "Em"].map(
    (id) => map.nodes.find((n) => n.id === id).idx,
  );
  demoActive = true;
  playIdx = 0;
  duration = (60 / settings().bpm) * settings().beats;
  render();
  let next = performance.now() + duration * 1000;
  const step = (now) => {
    if (!demoActive) return;
    if (now >= next) {
      playIdx++;
      next += duration * 1000;
      if (playIdx >= prog.length) {
        demoActive = false;
        playIdx = -1;
        render();
        return;
      }
      render(true);
    }
    demoFrame = requestAnimationFrame(step);
  };
  demoFrame = requestAnimationFrame(step);
}
function rebuild() {
  stop();
  const ids = prog.map((i) => map.nodes[i].id);
  map = buildChordMap(settings());
  prog = ids.map((id) => map.nodes.findIndex((n) => n.id === id));
  if (prog.includes(-1)) {
    prog = [];
    status(
      "꺼진 추가 화성의 코드가 있어 진행을 비웠습니다. 저장한 진행은 유지돼요.",
    );
  }
  focus = 0;
  draw();
}
function cycle(d) {
  if (demoActive) {
    stop();
    prog = [];
  }
  if (opts().length) focus = (focus + d + opts().length) % opts().length;
  else {
    const starts = map.nodes.filter(canStartChord);
    const current = Math.max(
      0,
      starts.findIndex((n) => n.idx === startSlot),
    );
    startSlot = starts[(current + d + starts.length) % starts.length].idx;
  }
  render();
}
function focused() {
  pick(opts()[focus]?.to ?? startSlot);
}
$("rotation").add(new Option("자유 회전", "free"));
for (const n of map.nodes.filter((n) => n.ring === "outer"))
  $("rotation").add(new Option(n.name, String(n.slot)));
$("rotation").onchange = () => {
  if ($("rotation").value === "free") return;
  rotation = -+$("rotation").value * 15;
  draw();
};
let drag = null;
svg.addEventListener("pointerdown", (e) => {
  if (e.target.closest(".node")) return;
  const rect = svg.getBoundingClientRect();
  drag = {
    id: e.pointerId,
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    rotation,
  };
  drag.angle = Math.atan2(e.clientY - drag.y, e.clientX - drag.x);
  svg.setPointerCapture(e.pointerId);
});
svg.addEventListener("pointermove", (e) => {
  if (!drag) return;
  rotation =
    drag.rotation +
    ((Math.atan2(e.clientY - drag.y, e.clientX - drag.x) - drag.angle) * 180) /
      Math.PI;
  draw();
});
const endDrag = () => {
  drag = null;
};
svg.addEventListener("pointerup", endDrag);
svg.addEventListener("pointercancel", endDrag);
$("play").onclick = () => void play();
function toggleLoop() {
  const b = $("loop");
  b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true");
  if (playing) {
    stop();
    void play();
  }
}
$("loop").onclick = toggleLoop;
$("undo").onclick = undo;
$("clear").onclick = clear;
$("walk").onclick = walk;
$("demo").onclick = demo;
$("strict").onchange = () => render();
for (const id of ["tritone", "backdoor", "iiV"]) $(id).onchange = rebuild;
for (const id of ["bpm", "beats", "timbre", "rhythm"])
  $(id).onchange = () => {
    if (id === "bpm") $("bpm").value = settings().bpm;
    if (playing) {
      stop();
      void play();
    }
  };
document.querySelectorAll("[data-edge]").forEach(
  (input) =>
    (input.onchange = () => {
      visible[input.dataset.edge] = input.checked;
      render();
    }),
);
$("legend").onchange = () => {
  $("legend-text").hidden = !$("legend").checked;
};
function snapshot() {
  return { ids: prog.map((i) => map.nodes[i].id), settings: settings() };
}
function apply(data) {
  stop();
  const s = data.settings ?? {};
  rotation = s.rotation ?? 0;
  $("strict").checked = s.strict ?? true;
  if (
    s.beats !== undefined &&
    ![...$("beats").options].some((o) => +o.value === s.beats)
  )
    $("beats").add(new Option(`${s.beats}박`, String(s.beats)));
  for (const id of ["bpm", "beats", "timbre", "rhythm"])
    if (s[id] !== undefined) $(id).value = s[id];
  for (const id of ["tritone", "backdoor", "iiV"]) $(id).checked = !!s[id];
  map = buildChordMap(settings());
  const path = data.ids.map((id) => map.nodes.findIndex((n) => n.id === id));
  if (path.includes(-1)) {
    prog = [];
    draw();
    throw new Error("현재 맵에서 찾을 수 없는 코드가 포함되어 있어요.");
  }
  prog = path;
  focus = 0;
  draw();
}
function refreshSaved() {
  const select = $("saved");
  select.replaceChildren(new Option("진행 선택", ""));
  for (const entry of listProgressions())
    select.add(new Option(entry.name, entry.id));
}
$("save").onclick = run(() => {
  if (!prog.length) throw new Error("저장할 진행을 먼저 만들어주세요.");
  const s = snapshot();
  saveProgression(
    $("save-name").value.trim() || "이름 없는 진행",
    s.ids,
    s.settings,
  );
  refreshSaved();
  status("이 브라우저에 진행을 저장했습니다.");
});
$("load").onclick = run(() => {
  const data = listProgressions().find((e) => e.id === $("saved").value);
  if (!data) throw new Error("불러올 진행을 선택하세요.");
  apply(data);
  status("진행을 불러왔습니다.");
});
$("delete").onclick = run(() => {
  if (!$("saved").value) return;
  deleteProgression($("saved").value);
  refreshSaved();
  status("선택한 저장 진행을 삭제했습니다.");
});
$("share").onclick = run(async () => {
  const s = snapshot();
  location.hash = encodeProgression(s.ids, s.settings);
  try {
    await navigator.clipboard.writeText(location.href);
    status("공유 URL을 복사했습니다.");
  } catch {
    status("주소창에 공유 URL을 만들었습니다. 주소를 복사해주세요.");
  }
});
function progressionVoicings() {
  return computeVoicings(prog.map(i => map.nodes[i]), settings());
}
$("export").onclick = () => {
  const voicings = progressionVoicings();
  const data = {
    ...settings(),
    chords: prog.map((i, index) => {
      const n = map.nodes[i];
      const voicing = voicings[index];
      return { id: n.id, name: n.name, ring: n.ring, kind: n.kind, midi: voicing.upper, bass: voicing.bass };
    }),
  };
  downloadBlob(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    "progression.json",
  );
};
$("midi-export").onclick = run(() => {
  if (!prog.length) throw new Error("먼저 진행을 만들어주세요.");
  downloadBlob(
    new Blob(
      [
        makeMidi(
          progressionVoicings(),
          settings().bpm,
          settings().beats,
        ),
      ],
      { type: "audio/midi" },
    ),
    "progression.mid",
  );
});
$("png").onclick = run(async () => {
  stop();
  status("PNG를 만들고 있습니다.");
  const blob = await exportPNG(svg, {
    names: prog.map((i) => map.nodes[i].name),
    caption: $("caption").innerText,
  });
  downloadBlob(blob, "chord-map-1080x1920.png");
  status("PNG를 저장했습니다.");
});
let midiDisconnect;
$("midi").onclick = run(async () => {
  if (midiDisconnect) {
    midiDisconnect();
    midiDisconnect = null;
    $("midi").textContent = "MIDI 건반 연결";
    return;
  }
  midiDisconnect = await connectMidi({
    onChord(matches) {
      if (demoActive) {
        stop();
        prog = [];
        render();
      }
      const candidates = map.nodes.filter((n) =>
        matches.some((m) => m.rootPc === n.rootPc && m.kind === n.kind),
      );
      const allowed = candidates.filter(
        (n) =>
          !$("strict").checked ||
          (!prog.length
            ? canStartChord(n)
            : opts().some((e) => e.to === n.idx)),
      );
      if (!allowed.length) {
        status(
          candidates.length
            ? "인식한 코드는 현재 화살표 후보에 없어요."
            : "인식한 코드는 현재 맵에 없어요. 추가 화성 옵션을 확인하세요.",
        );
        return;
      }
      const n = allowed[0];
      pick(n.idx);
      status(
        `MIDI: ${n.name}${allowed.length > 1 ? " · 여러 해석 중 현재 경로 우선" : ""}`,
      );
    },
    onStatus: status,
  });
  $("midi").textContent = "MIDI 연결 해제";
});
async function sendSerial(name) {
  try {
    await serialWriter?.write(new TextEncoder().encode(`CHORD ${name}\n`));
  } catch {
    serialWriter = null;
    status("아두이노 연결이 끊어졌습니다.");
  }
}
$("serial").onclick = run(async () => {
  if (!navigator.serial)
    throw new Error(
      "이 브라우저는 Web Serial을 지원하지 않습니다. Chrome/Edge를 사용하세요.",
    );
  if (serialWriter) return;
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: 115200 });
  serialWriter = port.writable.getWriter();
  const reader = port.readable.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  $("serial").textContent = "아두이노 연결됨";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let split;
      while ((split = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, split).trim();
        buffer = buffer.slice(split + 1);
        const [cmd, arg] = line.split(" ");
        if (cmd === "BPM" && Number.isFinite(+arg)) {
          $("bpm").value = Math.max(40, Math.min(200, +arg));
          $("bpm").onchange();
        } else
          ({
            NEXT: () => cycle(1),
            PREV: () => cycle(-1),
            PICK: focused,
            UNDO: undo,
            PLAY: () => void play(),
            WALK: walk,
            CLEAR: clear,
          })[cmd]?.();
      }
      if (buffer.length > 1024) buffer = "";
    }
  } finally {
    reader.releaseLock();
    serialWriter?.releaseLock();
    serialWriter = null;
    await port.close();
    $("serial").textContent = "아두이노 연결";
  }
});
document.addEventListener("keydown", (e) => {
  const action = shortcutAction(e, {
    editable:
      !!e.target.closest("input,select,textarea") || e.target.isContentEditable,
    interactive: !!e.target.closest("button,summary"),
  });
  if (!action) return;
  e.preventDefault();
  if (e.repeat) return;
  ({
    undo,
    clear,
    walk,
    loop: toggleLoop,
    play: () => void play(),
    previous: () => cycle(-1),
    next: () => cycle(1),
    pick: focused,
    stop,
  })[action]();
});

function fromHash() {
  if (!location.hash) return;
  try {
    apply(decodeProgression(location.hash));
    status("공유된 진행을 불러왔습니다.");
  } catch (e) {
    status(e.message);
  }
}
window.addEventListener("hashchange", fromHash);
draw();
try {
  refreshSaved();
} catch (e) {
  status(e.message);
}
if (location.hash) fromHash();
