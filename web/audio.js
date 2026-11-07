import { midiToFreq } from "./theory.js";
import { isValidVoicing } from "./voicing.js";

export const LOOKAHEAD_MS = 25;
export const SCHEDULE_AHEAD = 0.1;

// 박자 위치는 오디오 시계의 절대 시간으로 계산한다.
export function scheduleWindow(
  start,
  duration,
  cursor,
  length,
  now,
  loop = false,
) {
  const events = [];
  let next = cursor;
  if (!(duration > 0) || !length) return { events, cursor: next };
  // 탭이 오래 숨겨져도 지난 소리를 한꺼번에 재생하지 않는다.
  next = Math.max(next, Math.floor(Math.max(0, now - start) / duration));
  while (
    (loop || next < length) &&
    start + next * duration < now + SCHEDULE_AHEAD
  ) {
    events.push({
      index: next % length,
      time: start + next * duration,
      ordinal: next,
    });
    next++;
  }
  return { events, cursor: next };
}

// 메트로놈은 코드 경계와 독립적인 4분음표 시간축을 유지한다.
export function metronomeWindow(start, beatDuration, cursor, totalBeats, now, beatsPerBar, loop = false) {
  const events = [];
  let next = cursor;
  if (!(beatDuration > 0) || !(totalBeats > 0)) return { events, cursor: next };
  // 늦어진 클릭은 몰아서 연주하지 않고 다음 박부터 이어간다.
  next = Math.max(next, Math.ceil(Math.max(0, now - start) / beatDuration - 1e-9));
  while ((loop || next < totalBeats) && start + next * beatDuration < now + SCHEDULE_AHEAD) {
    events.push({ time: start + next * beatDuration, ordinal: next, accent: next % beatsPerBar === 0 });
    next++;
  }
  return { events, cursor: next };
}

export function rhythmEvents(notes, duration, rhythm = "block") {
  return notes.map((midi, index) => {
    const offset =
      rhythm === "arpeggio"
        ? (index * duration) / notes.length
        : rhythm === "strum"
          ? index * Math.min(0.045, duration / (notes.length * 3))
          : 0;
    return {
      midi,
      offset,
      duration: Math.max(0.001, duration - offset) * 0.94,
    };
  });
}

export class AudioEngine {
  constructor() {
    this.context = null;
    this.sources = new Set();
    this.generation = 0;
    this.interval = null;
    this.frame = null;
    this.playing = false;
  }

  async ready() {
    if (!this.context) {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context)
        throw new Error("이 브라우저는 Web Audio를 지원하지 않아요.");
      this.context = new Context();
      this.master = this.context.createDynamicsCompressor();
      this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") await this.context.resume();
    return this.context;
  }

  note(midi, time, duration, timbre, gain = 0.075) {
    const ac = this.context;
    const oscillator = ac.createOscillator();
    const envelope = ac.createGain();
    oscillator.type =
      timbre === "pad" ? "sine" : timbre === "pluck" ? "triangle" : "triangle";
    oscillator.frequency.value = midiToFreq(midi);
    const attack = Math.min(timbre === "pad" ? 0.16 : 0.012, duration * 0.2);
    const sustain = timbre === "pad" ? 0.7 : timbre === "pluck" ? 0.08 : 0.3;
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(gain, time + attack);
    envelope.gain.exponentialRampToValueAtTime(
      gain * sustain,
      time + duration * 0.65,
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(envelope).connect(this.master);
    this.sources.add(oscillator);
    oscillator.onended = () => {
      this.sources.delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
    };
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }

  chord(voicing, time, duration, timbre, rhythm) {
    for (const event of rhythmEvents(voicing.upper, duration, rhythm)) {
      this.note(event.midi, time + event.offset, event.duration, timbre);
    }
    this.note(voicing.bass, time, duration * 0.94, "pad", 0.09);
  }

  click(time, accent, duration = 0.045) {
    this.note(accent ? 96 : 89, time, duration, "pluck", accent ? 0.13 : 0.075);
  }

  async audition(voicing, settings = {}) {
    this.stop();
    const generation = this.generation;
    if (!isValidVoicing(voicing)) throw new Error("보이싱 음을 확인해주세요.");
    const snapshot = { bass: voicing.bass, upper: [...voicing.upper] };
    const ac = await this.ready();
    if (generation !== this.generation) return null;
    this.chord(
      snapshot,
      ac.currentTime + 0.01,
      0.85,
      settings.timbre || "piano",
      settings.rhythm || "block",
    );
    return snapshot;
  }

  async start({
    voicings,
    bpm = 90,
    beats = 2,
    timbre = "piano",
    rhythm = "block",
    loop = false,
    timeSignature = "4/4",
    metronome = false,
    onStep = () => {},
    onEnd = () => {},
  }) {
    this.stop();
    const generation = this.generation;
    if (!Array.isArray(voicings) || voicings.some(v => !isValidVoicing(v)))
      throw new Error("보이싱 음을 확인해주세요.");
    if (!["3/4", "4/4"].includes(timeSignature) || typeof metronome !== "boolean")
      throw new Error("박자표와 메트로놈 설정을 확인해주세요.");
    const snapshot = voicings.map(v => ({ bass: v.bass, upper: [...v.upper] }));
    if (!snapshot.length) return;
    const tempo = Number.isFinite(+bpm)
      ? Math.max(40, Math.min(200, +bpm))
      : 90;
    const beatCount = Number.isFinite(+beats)
      ? Math.max(0.25, Math.min(16, +beats))
      : 2;
    const beatDuration = 60 / tempo;
    const duration = beatDuration * beatCount;
    const totalBeats = snapshot.length * beatCount;
    const beatsPerBar = Number(timeSignature[0]);
    const ac = await this.ready();
    if (generation !== this.generation) return;
    const start = ac.currentTime + 0.04;
    let cursor = 0;
    let beatCursor = 0;
    let shown = -1;
    this.playing = true;
    const pump = () => {
      if (generation !== this.generation) return;
      const result = scheduleWindow(
        start,
        duration,
        cursor,
        snapshot.length,
        ac.currentTime,
        loop,
      );
      cursor = result.cursor;
      if (metronome) {
        const clicks = metronomeWindow(start, beatDuration, beatCursor, totalBeats,
          ac.currentTime, beatsPerBar, loop);
        beatCursor = clicks.cursor;
        for (const event of clicks.events) {
          const remaining = loop ? Infinity : start + totalBeats * beatDuration - event.time;
          this.click(event.time, event.accent, Math.min(0.045, remaining));
        }
      }
      for (const event of result.events) {
        // 지연된 탭이 돌아오면 현재 코드부터 재개한다.
        const remaining = event.time + duration - ac.currentTime;
        if (remaining > 0.03)
          this.chord(
            snapshot[event.index],
            Math.max(ac.currentTime, event.time),
            Math.min(duration, remaining),
            timbre,
            rhythm,
          );
      }
    };
    const draw = () => {
      if (generation !== this.generation) return;
      const ordinal = Math.floor((ac.currentTime - start) / duration);
      if (!loop && ordinal >= snapshot.length) {
        this.stop();
        onEnd();
        return;
      }
      if (ordinal >= 0 && ordinal !== shown) {
        shown = ordinal;
        onStep(ordinal % snapshot.length, duration);
      }
      this.frame = requestAnimationFrame(draw);
    };
    pump();
    this.interval = setInterval(pump, LOOKAHEAD_MS);
    this.frame = requestAnimationFrame(draw);
  }

  stop() {
    this.generation++;
    this.playing = false;
    clearInterval(this.interval);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.interval = this.frame = null;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* 이미 끝난 소리 */
      }
    }
    this.sources.clear();
  }
}
