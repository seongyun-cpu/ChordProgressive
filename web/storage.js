import { isValidVoicing } from "./voicing.js";

const STORAGE_KEY = "chord-lab.progressions.v1";
const MAX_CHORDS = 1024;
const MAX_LOCK_VOICES = 16;

function validateIds(ids) {
  if (
    !Array.isArray(ids) ||
    ids.length > MAX_CHORDS ||
    ids.some(
      (id) =>
        typeof id !== "string" ||
        !id.length ||
        id.length > 100 ||
        /[\u0000-\u001f]/.test(id),
    )
  ) {
    throw new Error("진행 데이터가 올바르지 않아요.");
  }
  return [...ids];
}
function validateSettings(settings = {}, chordCount = MAX_CHORDS) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings))
    throw new Error("진행 설정이 올바르지 않아요.");
  const result = {};
  for (const [key, min, max] of [
    ["bpm", 40, 200],
    ["beats", 0.25, 16],
    ["rotation", -36000, 36000],
  ]) {
    if (settings[key] !== undefined) {
      if (
        !Number.isFinite(settings[key]) ||
        settings[key] < min ||
        settings[key] > max
      )
        throw new Error("진행 설정 범위를 확인해주세요.");
      result[key] = settings[key];
    }
  }
  for (const [key, values] of [
    ["timbre", ["piano", "pad", "pluck"]],
    ["rhythm", ["block", "arpeggio", "strum"]],
    ["type", ["auto", "close", "shell", "drop2", "rootlessA", "rootlessB", "rootless", "spread"]],
  ]) {
    if (settings[key] !== undefined) {
      if (!values.includes(settings[key]))
        throw new Error("지원하지 않는 소리 설정이에요.");
      result[key] = settings[key];
    }
  }
  for (const key of ["strict", "tritone", "backdoor", "iiV", "neoSoul"]) {
    if (settings[key] !== undefined) {
      if (typeof settings[key] !== "boolean")
        throw new Error("진행 옵션이 올바르지 않아요.");
      result[key] = settings[key];
    }
  }
  if (settings.locks !== undefined) {
    const locks = settings.locks;
    if (!locks || typeof locks !== "object" || Array.isArray(locks))
      throw new Error("보이싱 잠금이 올바르지 않아요.");
    result.locks = {};
    for (const [index, voicing] of Object.entries(locks)) {
      if (!/^(0|[1-9]\d*)$/.test(index) || Number(index) >= chordCount ||
          !isValidVoicing(voicing) || voicing.upper.length > MAX_LOCK_VOICES ||
          voicing.upper[0] <= voicing.bass ||
          voicing.upper.some((note, i) => i > 0 && note <= voicing.upper[i - 1]))
        throw new Error("보이싱 잠금의 위치와 음을 확인해주세요.");
      // 저장 결과가 호출자의 잠금 배열과 연결되지 않게 복사한다.
      result.locks[index] = { bass: voicing.bass, upper: [...voicing.upper] };
    }
  }
  return result;
}

// 코드 ID를 각각 인코딩해 샵과 해결 대상을 보존한다.
export function encodeProgression(ids, settings = {}) {
  const validIds = validateIds(ids);
  const path = validIds
    .map((id) => encodeURIComponent(id).replaceAll(".", "%2E"))
    .join(".");
  const hash = `#${path}?s=${encodeURIComponent(JSON.stringify(validateSettings(settings, validIds.length)))}`;
  if (hash.length > 150000) throw new Error("공유 링크에 담을 진행이 너무 커요.");
  return hash;
}
export function decodeProgression(hash) {
  if (typeof hash !== "string" || hash.length > 150000)
    throw new Error("공유 링크가 올바르지 않아요.");
  try {
    const [path, query = "", ...extra] = hash.replace(/^#/, "").split("?");
    if (extra.length) throw new Error();
    const params = new URLSearchParams(query);
    const ids = path ? path.split(".").map(decodeURIComponent) : [];
    const settings = params.has("s") ? JSON.parse(params.get("s")) : {};
    const validIds = validateIds(ids);
    return { ids: validIds, settings: validateSettings(settings, validIds.length) };
  } catch {
    throw new Error("공유 링크가 손상되었거나 지원하지 않는 형식이에요.");
  }
}

export function listProgressions(storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries) || entries.length > 500) throw new Error();
    return entries.map((entry) => {
      if (
        !entry ||
        typeof entry.id !== "string" ||
        typeof entry.name !== "string" ||
        !entry.name.trim() ||
        entry.name.length > 80 ||
        !Number.isFinite(entry.updatedAt)
      )
        throw new Error();
      const ids = validateIds(entry.ids);
      return {
        id: entry.id,
        name: entry.name,
        ids,
        settings: validateSettings(entry.settings, ids.length),
        updatedAt: entry.updatedAt,
      };
    });
  } catch {
    throw new Error(
      "저장 목록을 읽을 수 없어요. 브라우저 저장 권한이나 기존 데이터를 확인해주세요.",
    );
  }
}
function writeEntries(entries, storage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    throw new Error(
      "저장 공간이 부족하거나 브라우저가 저장을 허용하지 않아요.",
    );
  }
}
export function saveProgression(
  name,
  ids,
  settings = {},
  storage = globalThis.localStorage,
) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 80)
    throw new Error("이름을 1~80자로 입력해주세요.");
  const validIds = validateIds(ids);
  if (!validIds.length) throw new Error("코드를 먼저 추가해주세요.");
  const entries = listProgressions(storage);
  if (entries.length >= 500)
    throw new Error("저장 목록이 가득 찼어요. 먼저 진행을 삭제해주세요.");
  const entry = {
    id: globalThis.crypto.randomUUID(),
    name: name.trim(),
    ids: validIds,
    settings: validateSettings(settings, validIds.length),
    updatedAt: Date.now(),
  };
  writeEntries([entry, ...entries], storage);
  return entry;
}
export function deleteProgression(id, storage = globalThis.localStorage) {
  writeEntries(
    listProgressions(storage).filter((entry) => entry.id !== id),
    storage,
  );
}

const u32 = (n) => [
  (n >>> 24) & 255,
  (n >>> 16) & 255,
  (n >>> 8) & 255,
  n & 255,
];
function variableLength(value) {
  const bytes = [value & 127];
  while ((value = Math.floor(value / 128))) bytes.unshift((value & 127) | 128);
  return bytes;
}
export function makeMidi(voicings, bpm = 90, beats = 2) {
  validateSettings({ bpm, beats });
  if (
    !Array.isArray(voicings) ||
    !voicings.length ||
    voicings.length > MAX_CHORDS ||
    voicings.some(v => !isValidVoicing(v))
  )
    throw new Error("MIDI로 저장할 코드를 먼저 선택해주세요.");
  const tempo = Math.round(60000000 / bpm),
    ticks = Math.round(beats * 480);
  const track = [
    0,
    255,
    81,
    3,
    (tempo >>> 16) & 255,
    (tempo >>> 8) & 255,
    tempo & 255,
    0,
    192,
    0,
  ];
  for (const voicing of voicings) {
    const notes = [...voicing.upper, voicing.bass];
    for (const note of notes) track.push(0, 144, note, 88);
    // 다음 코드의 같은 음이 먼저 꺼지지 않도록 note-off를 앞에 둔다.
    notes.forEach((note, index) =>
      track.push(...variableLength(index ? 0 : ticks), 128, note, 0),
    );
  }
  track.push(0, 255, 47, 0);
  return new Uint8Array([
    77,
    84,
    104,
    100,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    1,
    1,
    224,
    77,
    84,
    114,
    107,
    ...u32(track.length),
    ...track,
  ]);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split("\n")) {
    let line = "";
    for (const char of paragraph) {
      if (line && ctx.measureText(line + char).width > maxWidth) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
    lines.push(line);
  }
  return lines;
}
function chipLayout(ctx, names, fontSize) {
  ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
  const rows = [[]];
  let width = 0;
  for (const name of names) {
    const size = Math.min(920, ctx.measureText(name).width + fontSize * 1.1);
    if (width && width + size + 10 > 920) {
      rows.push([]);
      width = 0;
    }
    rows.at(-1).push({ name, width: size });
    width += size + 10;
  }
  return rows;
}
export async function exportPNG(
  svgElement,
  {
    names = [],
    title = "코드 진행 막힐 때\n화살표만 따라가기",
    caption = "화살표를 따라 나만의 진행을 만들어보세요.",
  } = {},
) {
  if (!svgElement || svgElement.tagName.toLowerCase() !== "svg")
    throw new Error("저장할 코드 맵이 없어요.");
  if (
    !Array.isArray(names) ||
    names.length > MAX_CHORDS ||
    names.some((name) => typeof name !== "string" || name.length > 100)
  )
    throw new Error("진행 이름을 확인해주세요.");
  await document.fonts?.ready;
  const clone = svgElement.cloneNode(true);
  const originals = [svgElement, ...svgElement.querySelectorAll("*")];
  const copies = [clone, ...clone.querySelectorAll("*")];
  originals.forEach((source, index) => {
    const style = getComputedStyle(source);
    for (const property of [
      "fill",
      "stroke",
      "stroke-width",
      "stroke-dasharray",
      "opacity",
      "font-size",
      "font-family",
      "font-weight",
      "text-anchor",
      "dominant-baseline",
      "visibility",
      "display",
      "marker-end",
    ]) {
      let value = style.getPropertyValue(property);
      if (property === "marker-end")
        value = value.replace(/url\(["']?[^#)]*#([^"')]+)["']?\)/g, "url(#$1)");
      copies[index].style.setProperty(property, value);
    }
    copies[index].style.animation = "none";
    copies[index].style.strokeDashoffset = "0";
  });
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", "1000");
  clone.setAttribute("height", "1000");
  clone.style.width = "1000px";
  clone.style.height = "1000px";
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(clone)], {
      type: "image/svg+xml;charset=utf-8",
    }),
  );
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () =>
        reject(new Error("코드 맵 이미지를 만들지 못했어요."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw new Error("이 브라우저는 이미지 내보내기를 지원하지 않아요.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 1080, 1920);
    ctx.fillStyle = "#ececec";
    for (let x = 12; x < 1080; x += 24)
      for (let y = 12; y < 1920; y += 24) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    ctx.fillStyle = "#111";
    ctx.font = "900 66px system-ui, sans-serif";
    ctx.textBaseline = "top";
    const titleLines = wrapText(ctx, title, 920);
    titleLines
      .slice(0, 3)
      .forEach((line, index) => ctx.fillText(line, 80, 105 + index * 84));
    ctx.fillRect(80, 370, 125, 6);
    ctx.drawImage(image, 40, 390, 1000, 1000);
    let fontSize = 32,
      rows = chipLayout(ctx, names, fontSize);
    while (rows.length * (fontSize * 1.65 + 10) > 280 && fontSize > 0.05) {
      fontSize = fontSize > 2 ? fontSize - 1 : fontSize * 0.8;
      rows = chipLayout(ctx, names, fontSize);
    }
    ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    const height = fontSize * 1.65;
    let index = 0;
    rows.forEach((row, r) => {
      let x =
        (1080 -
          row.reduce((sum, chip) => sum + chip.width, 0) -
          Math.max(0, row.length - 1) * 10) /
        2;
      row.forEach((chip) => {
        const y = 1410 + r * (height + 10),
          last = index++ === names.length - 1;
        ctx.fillStyle = last ? "#111" : "#fff";
        ctx.fillRect(x, y, chip.width, height);
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, chip.width, height);
        ctx.fillStyle = last ? "#fff" : "#111";
        ctx.fillText(
          chip.name,
          x + fontSize * 0.55,
          y + height / 2,
          chip.width - fontSize,
        );
        x += chip.width + 10;
      });
    });
    ctx.fillStyle = "#fff";
    ctx.fillRect(80, 1740, 920, 120);
    ctx.strokeStyle = "#ddd";
    ctx.strokeRect(80, 1740, 920, 120);
    let captionSize = 28,
      captionLines;
    do {
      ctx.font = `700 ${captionSize}px system-ui, sans-serif`;
      captionLines = wrapText(ctx, caption, 860);
      if (captionLines.length * captionSize * 1.3 <= 100) break;
      captionSize--;
    } while (captionSize > 2);
    ctx.fillStyle = "#111";
    ctx.textAlign = "center";
    captionLines.forEach((line, i) =>
      ctx.fillText(
        line,
        540,
        1800 + (i - (captionLines.length - 1) / 2) * captionSize * 1.3,
      ),
    );
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error("PNG 파일을 만들지 못했어요.")),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
