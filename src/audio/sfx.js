// Foley synthesised with the Web Audio API: no audio files ship with the site.
// Every sound is panned to where it happens and sent into a short, dark room
// reverb (an impulse generated here), so it sits in the library rather than
// on top of it. The context is created on the first user gesture.

import { useStore } from "../store/useStore";

let ctx = null;
let master = null;
let room = null; // reverb send
let noise = null;

const createNoiseBuffer = (audio) => {
  const length = audio.sampleRate * 2;
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;
    brown = (brown + 0.02 * white) / 1.02;
    data[i] = white * 0.6 + brown * 2.4; // paper sits between white and brown noise
  }
  return buffer;
};

// A wood-and-books room: quick early density, ~1.6 s dark tail.
const createImpulse = (audio) => {
  const seconds = 1.6;
  const length = Math.floor(audio.sampleRate * seconds);
  const impulse = audio.createBuffer(2, length, audio.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    let smooth = 0;
    for (let i = 0; i < length; i += 1) {
      const t = i / length;
      smooth = smooth * 0.82 + (Math.random() * 2 - 1) * 0.18; // books soak up the highs
      data[i] = smooth * Math.pow(1 - t, 3.2);
    }
  }
  return impulse;
};

const ensureContext = () => {
  if (!ctx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    ctx = new AudioContextClass();
    master = ctx.createGain();
    master.gain.value = useStore.getState().muted ? 0 : 0.9;
    master.connect(ctx.destination);
    const convolver = ctx.createConvolver();
    convolver.buffer = createImpulse(ctx);
    room = ctx.createGain();
    room.gain.value = 0.32;
    room.connect(convolver).connect(master);
    noise = createNoiseBuffer(ctx);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
};

export const unlockAudio = () => ensureContext();

useStore.subscribe((state, prev) => {
  if (!master || state.muted === prev.muted) return;
  master.gain.setTargetAtTime(state.muted ? 0 : 0.9, ctx.currentTime, 0.05);
});

const canPlay = () => !useStore.getState().muted && ensureContext() && master;

// gain → (pan) → dry + reverb send
const output = (node, at, duration, pan, panTo) => {
  let tail = node;
  if (ctx.createStereoPanner && (pan || panTo)) {
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(pan ?? 0, at);
    if (panTo !== undefined) panner.pan.linearRampToValueAtTime(panTo, at + duration);
    tail = node.connect(panner);
  }
  tail.connect(master);
  tail.connect(room);
};

const noiseBurst = ({ at, duration, gain, type = "bandpass", from, to, q = 0.9, attack = 0.02, pan, panTo }) => {
  const source = ctx.createBufferSource();
  source.buffer = noise;
  source.playbackRate.value = 0.85 + Math.random() * 0.3;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, at);
  filter.frequency.exponentialRampToValueAtTime(to, at + duration);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(gain, at + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  source.connect(filter).connect(amp);
  output(amp, at, duration, pan, panTo);
  source.start(at, Math.random() * 1.5, duration + 0.05);
};

const tone = ({ at, duration, gain, from, to, type = "sine", pan }) => {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + duration);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(gain, at + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(amp);
  output(amp, at, duration, pan);
  osc.start(at);
  osc.stop(at + duration + 0.02);
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export const sfx = {
  // speed: 0 (slow drag) .. 1 (fast waterfall); direction +1 when the leaf
  // travels left → right (forward in a manga), -1 when turning back
  pageTurn(speed = 0.5, delay = 0, direction = 1) {
    if (!canPlay()) return;
    const s = clamp01(speed);
    const at = ctx.currentTime + delay;
    const duration = 0.42 - s * 0.18;
    const volume = 0.12 + s * 0.22;
    const pan = -0.45 * direction;
    noiseBurst({ at, duration, gain: volume, from: 700, to: 2600 + s * 1800, q: 0.7, attack: 0.05, pan, panTo: -pan });
    for (let i = 0; i < 3; i += 1) {
      const offset = 0.04 + Math.random() * duration * 0.6;
      noiseBurst({ at: at + offset, duration: 0.05, gain: volume * 0.5, from: 3800, to: 5200, q: 2.5, attack: 0.004, pan: pan * (1 - (2 * offset) / duration) });
    }
    noiseBurst({ at: at + duration * 0.9, duration: 0.12, gain: volume * 0.9, type: "lowpass", from: 420, to: 160, q: 0.5, attack: 0.006, pan: -pan * 0.6 });
  },

  coverOpen() {
    if (!canPlay()) return;
    const at = ctx.currentTime;
    noiseBurst({ at, duration: 0.55, gain: 0.22, type: "lowpass", from: 1600, to: 380, q: 0.8, attack: 0.08, pan: -0.3, panTo: 0.35 });
    noiseBurst({ at: at + 0.48, duration: 0.18, gain: 0.32, type: "lowpass", from: 260, to: 90, q: 0.6, attack: 0.005, pan: 0.3 });
    tone({ at: at + 0.5, duration: 0.2, gain: 0.18, from: 96, to: 52, pan: 0.3 });
  },

  coverClose() {
    if (!canPlay()) return;
    const at = ctx.currentTime;
    noiseBurst({ at, duration: 0.4, gain: 0.18, type: "lowpass", from: 1300, to: 420, q: 0.7, attack: 0.06 });
    noiseBurst({ at: at + 0.36, duration: 0.2, gain: 0.4, type: "lowpass", from: 240, to: 70, q: 0.6, attack: 0.004 });
    tone({ at: at + 0.37, duration: 0.24, gain: 0.24, from: 84, to: 44 });
  },

  hover() {
    if (!canPlay()) return;
    noiseBurst({ at: ctx.currentTime, duration: 0.05, gain: 0.05, from: 2600, to: 3400, q: 3, attack: 0.004 });
  },

  slide() {
    if (!canPlay()) return;
    noiseBurst({ at: ctx.currentTime, duration: 0.3, gain: 0.08, from: 380, to: 620, q: 2.2, attack: 0.03, pan: 0.25 });
  },

  whoosh(reverse = false) {
    if (!canPlay()) return;
    const at = ctx.currentTime;
    noiseBurst({ at, duration: 1.0, gain: 0.12, from: reverse ? 1500 : 260, to: reverse ? 240 : 1400, q: 1.1, attack: 0.35, pan: reverse ? 0 : 0.4, panTo: reverse ? 0.4 : 0 });
  },

  stamp() {
    if (!canPlay()) return;
    const at = ctx.currentTime;
    tone({ at, duration: 0.18, gain: 0.3, from: 150, to: 58 });
    noiseBurst({ at, duration: 0.1, gain: 0.22, type: "lowpass", from: 900, to: 200, q: 0.7, attack: 0.003 });
  },

  tick() {
    if (!canPlay()) return;
    tone({ at: ctx.currentTime, duration: 0.06, gain: 0.06, from: 1900, to: 1300, type: "triangle" });
  }
};
