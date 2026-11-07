import { describe, it, expect, vi } from "vitest";
import {
  encodeProgression,
  decodeProgression,
  listProgressions,
  saveProgression,
  deleteProgression,
  makeMidi,
} from "./storage.js";
import { buildChordMap } from "./theory.js";

import { computeVoicings } from "./voicing.js";
import { AudioEngine } from "./audio.js";

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};
describe("진행 공유 링크", () => {
  it("샵, 감화음, 해결 대상 및 설정이 왕복한다", () => {
    const ids = ["C", "E7>Am", "Am", "F#", "E#°>F#", "test.with.dot"];
    const settings = {
      bpm: 110,
      beats: 4,
      timbre: "pad",
      rhythm: "strum",
      tritone: true,
      rotation: -30,
    };
    expect(decodeProgression(encodeProgression(ids, settings))).toEqual({
      ids,
      settings,
    });
    expect(encodeProgression(ids)).toContain("F%23");
  });
  it("간단한 기존 링크와 빈 링크도 읽는다", () => {
    expect(decodeProgression("#C.E7>Am.Am")).toEqual({
      ids: ["C", "E7>Am", "Am"],
      settings: {},
    });
    expect(decodeProgression("")).toEqual({ ids: [], settings: {} });
  });
  it.each([
    "#C.%XX",
    "#C..Am",
    "#C?s=%7B",
    "#C?s=null",
    "#C?s=%7B%22bpm%22%3A0%7D",
    "#C??s={}",
  ])("잘못된 링크 %s를 거절한다", (hash) => {
    expect(() => decodeProgression(hash)).toThrow("공유 링크");
  });
  it("설정과 진행의 크기를 검증한다", () => {
    expect(() => encodeProgression(Array(1025).fill("C"))).toThrow();
    expect(() => encodeProgression(["C"], { beats: NaN })).toThrow();
    expect(() => encodeProgression(["C"], { timbre: "unknown" })).toThrow();
    expect(() => encodeProgression(["C"], { iiV: "true" })).toThrow();
  });
});

describe("여러 진행 저장", () => {
  it("동일한 이름도 별도 ID로 보존하고 선택한 진행만 삭제한다", () => {
    const storage = memoryStorage();
    const a = saveProgression(" 연습 ", ["C", "Am"], { bpm: 90 }, storage);
    const b = saveProgression("연습", ["D"], {}, storage);
    expect(a.name).toBe("연습");
    expect(a.id).not.toBe(b.id);
    expect(listProgressions(storage).map((entry) => entry.ids)).toEqual([
      ["D"],
      ["C", "Am"],
    ]);
    deleteProgression(b.id, storage);
    expect(listProgressions(storage)).toEqual([a]);
  });
  it("빈 진행과 이름 및 손상된 저장 데이터를 거절한다", () => {
    const storage = memoryStorage();
    expect(() => saveProgression(" ", ["C"], {}, storage)).toThrow();
    expect(() => saveProgression("연습", [], {}, storage)).toThrow();
    storage.setItem("chord-lab.progressions.v1", "null");
    expect(() => listProgressions(storage)).toThrow("저장 목록");
  });
  it("저장 거부 오류를 사용자에게 전달한다", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(() => saveProgression("연습", ["C"], {}, storage)).toThrow(
      "저장 공간",
    );
  });
});

function parseMidi(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  expect(ascii(0, 4)).toBe("MThd");
  expect(view.getUint32(4)).toBe(6);
  expect(view.getUint16(8)).toBe(0);
  expect(view.getUint16(10)).toBe(1);
  expect(view.getUint16(12)).toBe(480);
  expect(ascii(14, 18)).toBe("MTrk");
  expect(view.getUint32(18)).toBe(bytes.length - 22);
  let cursor = 22,
    time = 0;
  const events = [];
  const variable = () => {
    let value = 0,
      byte;
    do {
      byte = bytes[cursor++];
      value = value * 128 + (byte & 127);
    } while (byte & 128);
    return value;
  };
  while (cursor < bytes.length) {
    time += variable();
    const status = bytes[cursor++];
    if (status === 255) {
      const type = bytes[cursor++],
        length = variable(),
        data = Array.from(bytes.slice(cursor, cursor + length));
      cursor += length;
      events.push({ time, status, type, data });
    } else {
      const data = Array.from(
        bytes.slice(cursor, cursor + (status === 192 ? 1 : 2)),
      );
      cursor += data.length;
      events.push({ time, status, data });
    }
  }
  return events;
}
describe("표준 MIDI 내보내기", () => {
  it("헤더, 템포, 보이싱, 코드 박 수와 트랙 종료가 일치한다", () => {
    const map = buildChordMap();
    const nodes = ["C", "E7>Am", "Am"].map((id) =>
      map.nodes.find((n) => n.id === id),
    );
    const events = parseMidi(makeMidi(computeVoicings(nodes), 120, 2));
    expect(events[0]).toEqual({
      time: 0,
      status: 255,
      type: 81,
      data: [7, 161, 32],
    });
    expect(events.at(-1)).toEqual({
      time: 2880,
      status: 255,
      type: 47,
      data: [],
    });
    computeVoicings(nodes).forEach((voicing, index) => {
      expect(
        events
          .filter((e) => e.status === 144 && e.time === index * 960)
          .map((e) => e.data[0]),
      ).toEqual([...voicing.upper, voicing.bass]);
    });
    for (const time of [960, 1920]) {
      const sameTick = events.filter((e) => e.time === time);
      expect(
        sameTick
          .slice(
            0,
            sameTick.findIndex((e) => e.status === 144),
          )
          .every((e) => e.status === 128),
      ).toBe(true);
    }
    expect(events.filter((e) => e.status === 144)).toHaveLength(
      events.filter((e) => e.status === 128).length,
    );
  });
  it("분수 박과 잘못된 입력을 처리한다", () => {
    const node = computeVoicings([buildChordMap().nodes[0]])[0];
    expect(parseMidi(makeMidi([node], 90, 0.5)).at(-1).time).toBe(240);
    expect(() => makeMidi([], 90, 2)).toThrow();
    expect(() => makeMidi([node], 0, 2)).toThrow();
    expect(() => makeMidi([{ rootPc: 0, kind: "bad" }])).toThrow();
  });
});

describe("재생과 MIDI의 공통 보이싱", () => {
  it("스케줄러가 연주한 모든 음이 MIDI note-on/off와 일치한다", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const engine = new AudioEngine();
    const ac = { currentTime: 0 };
    engine.ready = async () => ac;
    engine.note = vi.fn();
    const voicings = computeVoicings(buildChordMap().nodes.slice(0, 6));
    // 전달된 베이스를 그대로 사용하는지도 검사한다.
    voicings[1].bass = 30;
    const events = parseMidi(makeMidi(voicings, 120, 2));
    try {
      const pending = engine.start({ voicings, bpm: 120, beats: 2 });
      voicings[1].upper[0] = 100;
      voicings[1].bass = 31;
      await pending;
      for (let index = 0; index < voicings.length; index++) {
        if (index) {
          ac.currentTime = index;
          vi.advanceTimersByTime(25);
        }
        const played = engine.note.mock.calls.map(call => call[0]);
        for (const [status, tick] of [[144, index * 960], [128, (index + 1) * 960]]) {
          expect(events.filter(e => e.status === status && e.time === tick)
            .map(e => e.data[0])).toEqual(played);
        }
        engine.note.mockClear();
      }
    } finally {
      engine.stop();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
  it("인코딩된 기존 공유 링크가 같은 코드와 보이싱으로 열린다", () => {
    const { ids } = decodeProgression("#C.E7%3EAm.Am.D7%3EG.G.B7%3EEm.Em");
    const map = buildChordMap();
    const nodes = ids.map(id => map.nodes.find(node => node.id === id));
    expect(nodes).toHaveLength(7);
    expect(nodes.every(Boolean)).toBe(true);
    expect(computeVoicings(nodes).at(-1)).toEqual({ bass: 40, upper: [59, 64, 67] });
  });
});

describe("보이싱 설정 저장·공유", () => {
  const ids = ["C", "E7>Am", "Am"];
  const settings = {
    type: "rootlessA",
    neoSoul: true,
    locks: { 0: { bass: 36, upper: [64, 67, 71, 74] } },
  };
  it("타입·확장음·잠금을 URL과 저장 목록에서 왕복한다", () => {
    expect(decodeProgression(encodeProgression(ids, settings))).toEqual({ ids, settings });
    const storage = memoryStorage();
    const entry = saveProgression("보이싱", ids, settings, storage);
    expect(listProgressions(storage)[0]).toEqual(entry);
    expect(entry.settings).toEqual(settings);
    expect(entry.settings.locks[0].upper).not.toBe(settings.locks[0].upper);
    entry.settings.locks[0].upper[0] = 65;
    expect(listProgressions(storage)[0].settings).toEqual(settings);
  });
  it.each(["auto", "close", "shell", "drop2", "rootlessA", "rootlessB", "rootless", "spread"])("%s 타입을 보존한다", type => {
    const options = { type, neoSoul: false, locks: {} };
    expect(decodeProgression(encodeProgression(ids, options)).settings).toEqual(options);
  });
  it("선택 필드가 없는 기존 링크·저장 데이터에 기본값을 강제로 추가하지 않는다", () => {
    expect(decodeProgression("#C.E7%3EAm.Am")).toEqual({ ids, settings: {} });
    expect(decodeProgression(encodeProgression(ids, { bpm: 100 })).settings).toEqual({ bpm: 100 });
    const storage = memoryStorage();
    const entry = saveProgression("기존", ids, {}, storage);
    expect(listProgressions(storage)[0]).toEqual(entry);
    expect(entry.settings).toEqual({});
  });
  it.each([
    { type: "unknown" },
    { neoSoul: "true" },
    { locks: null },
    { locks: [] },
    { locks: { "-1": { bass: 36, upper: [60] } } },
    { locks: { "01": { bass: 36, upper: [60] } } },
    { locks: { "1.5": { bass: 36, upper: [60] } } },
    { locks: { 3: { bass: 36, upper: [60] } } },
    { locks: { 0: { bass: -1, upper: [60] } } },
    { locks: { 0: { bass: 36, upper: [128] } } },
    { locks: { 0: { bass: 36, upper: [60.5] } } },
    { locks: { 0: { bass: 36, upper: [] } } },
    { locks: { 0: { bass: 36, upper: [60, 60] } } },
    { locks: { 0: { bass: 36, upper: [64, 60] } } },
    { locks: { 0: { bass: 60, upper: [36] } } },
    { locks: { 0: { bass: 36, upper: Array.from({ length: 17 }, (_, i) => 60 + i) } } },
  ])("잘못된 선택 설정 %j를 저장과 공유 양쪽에서 거절한다", invalid => {
    expect(() => encodeProgression(ids, invalid)).toThrow();
    expect(() => decodeProgression(`#C.E7%3EAm.Am?s=${encodeURIComponent(JSON.stringify(invalid))}`)).toThrow("공유 링크");
    expect(() => saveProgression("손상", ids, invalid, memoryStorage())).toThrow();
    const storage = memoryStorage();
    storage.setItem("chord-lab.progressions.v1", JSON.stringify([
      { id: "bad", name: "손상", ids, settings: invalid, updatedAt: 1 },
    ]));
    expect(() => listProgressions(storage)).toThrow("저장 목록");
  });
  it("빈 진행에는 잠금을 붙일 수 없다", () => {
    expect(() => encodeProgression([], settings)).toThrow();
    expect(decodeProgression(encodeProgression([], { locks: {} })).settings).toEqual({ locks: {} });
  });
});


describe("박자표와 선택 설정 저장·공유", () => {
  it.each(["3/4", "4/4"])("%s와 7th·메트로놈·표시 옵션이 왕복한다", timeSignature => {
    const ids = ["C", "C", "E7>Am", "Am"];
    const settings = { timeSignature, seventh: true, neoSoul: false, metronome: true,
      allArrows: false, copyVoicingNames: true, beats: 2 };
    expect(decodeProgression(encodeProgression(ids, settings))).toEqual({ ids, settings });
    const storage = memoryStorage();
    saveProgression("박자 연습", ids, settings, storage);
    expect(listProgressions(storage)[0].settings).toEqual(settings);
  });
  it.each([
    { timeSignature: "6/8" }, { timeSignature: 3 }, { timeSignature: null },
    { seventh: 1 }, { metronome: "true" }, { allArrows: null }, { copyVoicingNames: "false" },
  ])("잘못된 설정 %j를 거절한다", settings => {
    expect(() => encodeProgression(["C"], settings)).toThrow();
    expect(() => decodeProgression(`#C?s=${encodeURIComponent(JSON.stringify(settings))}`)).toThrow();
    expect(() => saveProgression("설정", ["C"], settings, memoryStorage())).toThrow();
  });
  it("기존 링크는 새 기본 설정을 주입하지 않는다", () => {
    expect(decodeProgression("#C.E7%3EAm.Am").settings).toEqual({});
    expect(decodeProgression(encodeProgression(["C"], { bpm: 90 })).settings).toEqual({ bpm: 90 });
  });
});

describe("MIDI 박자표", () => {
  const voicings = [{ bass: 36, upper: [60, 64, 67] }, { bass: 36, upper: [60, 64, 67] }];
  it.each([["3/4", 3], ["4/4", 4]])("%s는 time signature 메타를 기록하고 코드 길이는 유지한다", (signature, numerator) => {
    const events = parseMidi(makeMidi(voicings, 120, 2, signature));
    expect(events.filter(e => e.status === 255 && e.type === 88)).toEqual([
      { time: 0, status: 255, type: 88, data: [numerator, 2, 24, 8] },
    ]);
    expect([...new Set(events.filter(e => e.status === 144).map(e => e.time))]).toEqual([0, 960]);
    expect(events.at(-1).time).toBe(1920);
  });
  it("생략한 박자표는 4/4이며 분수 박도 그대로 기록한다", () => {
    const events = parseMidi(makeMidi(voicings, 90, 0.5));
    expect(events.find(e => e.type === 88).data).toEqual([4, 2, 24, 8]);
    expect(events.at(-1).time).toBe(480);
  });
  it.each(["6/8", "3", "", null, 4])("지원하지 않는 MIDI 박자표 %j를 거절한다", signature => {
    expect(() => makeMidi(voicings, 90, 2, signature)).toThrow();
  });
});
