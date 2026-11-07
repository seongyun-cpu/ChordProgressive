import { describe, it, expect, vi, afterEach } from "vitest";
import {
  AudioEngine,
  scheduleWindow,
  metronomeWindow,
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


describe("박자표와 메트로놈", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const prepare = () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const engine = new AudioEngine();
    const ac = { currentTime: 0 };
    engine.ready = async () => ac;
    engine.chord = vi.fn();
    engine.click = vi.fn();
    return { engine, ac };
  };
  const voicing = { bass: 36, upper: [60, 64, 67] };

  it.each([3, 4])("%i/4는 각 마디 첫 박만 강박이다", beatsPerBar => {
    let cursor = 0;
    const events = [];
    for (let beat = 0; beat < 9; beat++) {
      const result = metronomeWindow(10, 0.5, cursor, 9, 9.95 + beat * 0.5, beatsPerBar);
      cursor = result.cursor;
      events.push(...result.events);
    }
    expect(events.map(e => e.time)).toEqual(Array.from({ length: 9 }, (_, i) => 10 + i * 0.5));
    expect(events.filter(e => e.accent).map(e => e.ordinal)).toEqual(
      Array.from({ length: 9 }, (_, i) => i).filter(i => i % beatsPerBar === 0),
    );
  });
  it("분수 박 길이는 끝나기 전의 박만 예약하며 종료 박은 포함하지 않는다", () => {
    expect(metronomeWindow(10, 0.5, 2, 2, 10.95, 4).events).toEqual([]);
    expect(metronomeWindow(10, 0.5, 2, 2.5, 10.95, 4).events).toEqual([
      { time: 11, ordinal: 2, accent: false },
    ]);
    expect(metronomeWindow(10, 0.5, 3, 2.5, 11.45, 4).events).toEqual([]);
    expect(metronomeWindow(10, 0.5, 0, 0.25, 9.95, 4).events).toHaveLength(1);
  });
  it("지연된 클릭은 몰아서 재생하지 않고 다음 정확한 박을 기다린다", () => {
    expect(metronomeWindow(10, 0.5, 0, 4, 100.2, 3, true).events).toEqual([]);
    expect(metronomeWindow(10, 0.5, 0, 4, 100.45, 3, true).events).toEqual([
      { time: 100.5, ordinal: 181, accent: false },
    ]);
  });
  it("같은 코드를 두 번 선택하면 각각 연주하고 기본 메트로놈은 꺼져 있다", async () => {
    const { engine, ac } = prepare();
    try {
      await engine.start({ voicings: [voicing, voicing], bpm: 120, beats: 1 });
      ac.currentTime = 0.5;
      vi.advanceTimersByTime(25);
      expect(engine.chord.mock.calls.map(call => call[0])).toEqual([voicing, voicing]);
      expect(engine.chord.mock.calls.map(call => call[1])).toEqual([0.04, 0.54]);
      expect(engine.click).not.toHaveBeenCalled();
    } finally { engine.stop(); }
  });
  it.each(["3/4", "4/4"])("%s 클릭은 코드당 1.5박과 별도로 같은 오디오 시계를 사용한다", async timeSignature => {
    const { engine, ac } = prepare();
    try {
      await engine.start({ voicings: [voicing, voicing, voicing], bpm: 120, beats: 1.5,
        timeSignature, metronome: true });
      for (const now of [0.5, 0.75, 1, 1.5, 2, 2.25]) {
        ac.currentTime = now;
        vi.advanceTimersByTime(25);
      }
      expect(engine.chord.mock.calls.map(call => call[1])).toEqual([0.04, 0.79, 1.54]);
      expect(engine.click.mock.calls.map(call => call[0])).toEqual([0.04, 0.54, 1.04, 1.54, 2.04]);
      expect(engine.click.mock.calls.map(call => call[1])).toEqual(
        Array.from({ length: 5 }, (_, i) => i % Number(timeSignature[0]) === 0),
      );
      expect(engine.click.mock.calls.every(call => call[0] < 2.29)).toBe(true);
    } finally { engine.stop(); }
  });
  it("반복 경계에서 박자표를 초기화하지 않으며 정지 뒤 클릭 예약을 중단한다", async () => {
    const { engine, ac } = prepare();
    try {
      await engine.start({ voicings: [voicing, voicing], bpm: 120, beats: 1,
        timeSignature: "3/4", metronome: true, loop: true });
      for (let beat = 1; beat <= 6; beat++) {
        ac.currentTime = beat * 0.5;
        vi.advanceTimersByTime(25);
      }
      expect(engine.click.mock.calls.map(call => call[1])).toEqual([true, false, false, true, false, false, true]);
      engine.stop();
      ac.currentTime = 10;
      vi.advanceTimersByTime(1000);
      expect(engine.click).toHaveBeenCalledTimes(7);
      expect(engine.interval).toBeNull();
    } finally { engine.stop(); }
  });
  it("강박은 더 높은 음과 음량으로 재생하며 같은 소스 정지 경로를 쓴다", () => {
    const engine = new AudioEngine();
    engine.note = vi.fn();
    engine.click(10, true);
    engine.click(10.5, false);
    expect(engine.note.mock.calls).toEqual([
      [96, 10, 0.045, "pluck", 0.13], [89, 10.5, 0.045, "pluck", 0.075],
    ]);
  });
  it("지원하지 않는 박자표는 오디오 시작 전에 거절한다", async () => {
    const engine = new AudioEngine();
    engine.ready = vi.fn();
    await expect(engine.start({ voicings: [voicing], timeSignature: "6/8" })).rejects.toThrow("박자표");
    expect(engine.ready).not.toHaveBeenCalled();
  });
});
