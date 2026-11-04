import { describe, it, expect, vi, afterEach } from "vitest";
import {
  AudioEngine,
  scheduleWindow,
  rhythmEvents,
  LOOKAHEAD_MS,
  SCHEDULE_AHEAD,
} from "./audio.js";

describe("오디오 시계 스케줄", () => {
  it("25ms 확인과 100ms 예약 창을 사용한다", () => {
    expect(LOOKAHEAD_MS).toBe(25);
    expect(SCHEDULE_AHEAD).toBe(0.1);
    expect(scheduleWindow(10, 0.5, 0, 4, 9.95).events).toEqual([
      { index: 0, time: 10, ordinal: 0 },
    ]);
  });
  it("타이머 지터와 무관하게 절대 박자 위치를 보존한다", () => {
    let cursor = 0;
    const events = [];
    for (const now of [9.95, 10.03, 10.43, 10.52, 10.94, 11.46]) {
      const result = scheduleWindow(10, 0.5, cursor, 4, now);
      cursor = result.cursor;
      events.push(...result.events);
    }
    expect(events.map((e) => e.time)).toEqual([10, 10.5, 11, 11.5]);
    expect(scheduleWindow(10, 0.5, cursor, 4, 13).events).toEqual([]);
  });
  it("반복은 같은 시간축에서 돌아가고 오래 지난 코드는 건너뛴다", () => {
    expect(scheduleWindow(10, 0.5, 4, 4, 11.95, true).events[0]).toEqual({
      index: 0,
      ordinal: 4,
      time: 12,
    });
    expect(scheduleWindow(10, 0.5, 0, 4, 100, true).events).toHaveLength(1);
  });
  it("리듬의 음 순서와 길이가 코드 구간을 벗어나지 않는다", () => {
    for (const rhythm of ["block", "arpeggio", "strum"]) {
      const events = rhythmEvents([60, 64, 67, 70], 0.075, rhythm);
      expect(events.map((e) => e.midi)).toEqual([60, 64, 67, 70]);
      for (const event of events)
        expect(event.offset + event.duration).toBeLessThanOrEqual(0.075);
      expect(events[3].offset > 0).toBe(rhythm !== "block");
    }
  });
});

describe("재생 취소", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("resume 대기 중 정지하면 뒤늦게 재생하지 않는다", async () => {
    let resume;
    vi.stubGlobal(
      "AudioContext",
      class {
        state = "suspended";
        createDynamicsCompressor() {
          return { connect() {} };
        }
        resume() {
          return new Promise((resolve) => {
            resume = resolve;
          });
        }
      },
    );
    const engine = new AudioEngine();
    const pending = engine.start({
      voicings: [{ bass: 36, upper: [60, 64, 67] }],
    });
    engine.stop();
    resume();
    await pending;
    expect(engine.playing).toBe(false);
    expect(engine.interval).toBeNull();
  });
  it("정지는 예약된 소리와 화면 타이머를 취소한다", () => {
    const engine = new AudioEngine();
    const source = { stop: vi.fn() };
    const cancel = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancel);
    engine.sources.add(source);
    engine.frame = 42;
    engine.stop();
    expect(source.stop).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledWith(42);
    expect(engine.sources.size).toBe(0);
  });
});

describe("기존 코드 연주 회귀", () => {
  it("상성부 리듬과 별도 베이스 음색·길이·세기를 유지한다", () => {
    const engine = new AudioEngine();
    engine.note = vi.fn();
    engine.chord({ bass: 36, upper: [60, 64, 67] }, 10, 2, "piano", "arpeggio");
    expect(engine.note.mock.calls).toEqual([
      [60, 10, 2 * .94, "piano"],
      [64, 10 + 2 / 3, (2 - 2 / 3) * .94, "piano"],
      [67, 10 + 4 / 3, (2 - 4 / 3) * .94, "piano"],
      [36, 10, 2 * .94, "pad", .09],
    ]);
  });
});
