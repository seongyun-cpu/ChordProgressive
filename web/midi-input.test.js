import { describe, it, expect, vi, afterEach } from "vitest";
import { createMidiHandler } from "./midi-input.js";
afterEach(() => vi.useRealTimers());
describe("MIDI 입력 묶음", () => {
  it("동시 연주를 한 화음으로 인식하고 노트오프는 추가하지 않는다", () => {
    vi.useFakeTimers();
    const callback = vi.fn(),
      h = createMidiHandler(callback);
    for (const n of [60, 64, 67]) h.message([0x90, n, 100]);
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0]).toContainEqual({
      rootPc: 0,
      kind: "maj",
      name: "C",
    });
    h.message([0x90, 67, 0]);
    vi.advanceTimersByTime(150);
    expect(callback).toHaveBeenCalledTimes(1);
    h.reset();
  });
  it("채널별 노트와 전체 노트오프를 처리한다", () => {
    vi.useFakeTimers();
    const callback = vi.fn(),
      h = createMidiHandler(callback);
    for (const n of [60, 64, 67]) h.message([0x91, n, 100]);
    h.message([0xb1, 123, 0]);
    vi.advanceTimersByTime(150);
    expect(callback).not.toHaveBeenCalled();
  });
});
