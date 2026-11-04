import { describe, it, expect } from "vitest";
import {
  encodeProgression,
  decodeProgression,
  listProgressions,
  saveProgression,
  deleteProgression,
  makeMidi,
} from "./storage.js";
import { buildChordMap, voiceLead } from "./theory.js";

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
    const events = parseMidi(makeMidi(nodes, 120, 2));
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
    let previous = null;
    nodes.forEach((node, index) => {
      previous = voiceLead(previous, node);
      expect(
        events
          .filter((e) => e.status === 144 && e.time === index * 960)
          .map((e) => e.data[0]),
      ).toEqual(previous);
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
    const node = buildChordMap().nodes[0];
    expect(parseMidi(makeMidi([node], 90, 0.5)).at(-1).time).toBe(240);
    expect(() => makeMidi([], 90, 2)).toThrow();
    expect(() => makeMidi([node], 0, 2)).toThrow();
    expect(() => makeMidi([{ rootPc: 0, kind: "bad" }])).toThrow();
  });
});
