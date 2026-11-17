// All sound is synthesized with WebAudio — no audio files, no network. A tiny synth
// (oscillators + filtered noise) plays the effects, and a quiet two-oscillator pad loops
// underneath while the game runs. Audio starts on the first user gesture (browsers
// block it before then) and M toggles mute.
export function createAudio() {
  let ctx = null;
  let master = null;
  let musicNodes = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function tone({ freq = 440, to = null, type = 'square', dur = 0.08, vol = 0.2, when = 0 }) {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise({ dur = 0.25, vol = 0.3, freq = 1200, when = 0 }) {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  const sfx = {
    shoot() {
      tone({ freq: 720, to: 340, type: 'square', dur: 0.06, vol: 0.08 });
    },
    hit() {
      tone({ freq: 220, to: 140, type: 'triangle', dur: 0.05, vol: 0.12 });
    },
    kill() {
      noise({ dur: 0.18, vol: 0.22, freq: 900 });
      tone({ freq: 180, to: 60, type: 'sawtooth', dur: 0.16, vol: 0.12 });
    },
    bigKill() {
      noise({ dur: 0.4, vol: 0.32, freq: 700 });
      tone({ freq: 120, to: 40, type: 'sawtooth', dur: 0.35, vol: 0.2 });
    },
    pickup() {
      tone({ freq: 660, type: 'sine', dur: 0.07, vol: 0.16 });
      tone({ freq: 990, type: 'sine', dur: 0.09, vol: 0.16, when: 0.06 });
    },
    ember() {
      tone({ freq: 1180, to: 1560, type: 'sine', dur: 0.05, vol: 0.07 });
    },
    hurt() {
      tone({ freq: 160, to: 70, type: 'sawtooth', dur: 0.22, vol: 0.25 });
      noise({ dur: 0.15, vol: 0.18, freq: 500 });
    },
    wave() {
      tone({ freq: 220, type: 'triangle', dur: 0.3, vol: 0.18 });
      tone({ freq: 330, type: 'triangle', dur: 0.3, vol: 0.18, when: 0.12 });
      tone({ freq: 440, type: 'triangle', dur: 0.4, vol: 0.18, when: 0.24 });
    },
    boss() {
      tone({ freq: 98, to: 55, type: 'sawtooth', dur: 0.7, vol: 0.28 });
      noise({ dur: 0.6, vol: 0.2, freq: 300 });
    },
    upgrade() {
      tone({ freq: 523, type: 'sine', dur: 0.1, vol: 0.18 });
      tone({ freq: 659, type: 'sine', dur: 0.1, vol: 0.18, when: 0.09 });
      tone({ freq: 784, type: 'sine', dur: 0.18, vol: 0.18, when: 0.18 });
    },
    over() {
      tone({ freq: 392, to: 370, type: 'triangle', dur: 0.25, vol: 0.2 });
      tone({ freq: 311, to: 294, type: 'triangle', dur: 0.25, vol: 0.2, when: 0.22 });
      tone({ freq: 233, to: 220, type: 'triangle', dur: 0.5, vol: 0.2, when: 0.44 });
    },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'sine', dur: 0.22, vol: 0.18, when: i * 0.11 }));
    },
    click() {
      tone({ freq: 880, type: 'sine', dur: 0.04, vol: 0.12 });
    },
  };

  function startMusic() {
    if (!ctx || !master || musicNodes) return;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.05;
    padGain.connect(master);
    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = 110;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = 164.81;
    const o3 = ctx.createOscillator();
    o3.type = 'triangle';
    o3.frequency.value = 220;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(padGain.gain);
    o1.connect(padGain);
    o2.connect(padGain);
    o3.connect(padGain);
    o1.start();
    o2.start();
    o3.start();
    lfo.start();
    musicNodes = { o1, o2, o3, lfo, padGain };
  }

  function setMuted(value) {
    muted = value;
    if (master && ctx) master.gain.setValueAtTime(muted ? 0 : 0.5, ctx.currentTime);
    return muted;
  }

  return {
    unlock() {
      if (ensure()) startMusic();
    },
    play(name) {
      if (!ensure()) return;
      const fn = sfx[name];
      if (fn) fn();
    },
    toggleMute() {
      ensure();
      return setMuted(!muted);
    },
    isMuted() {
      return muted;
    },
  };
}
