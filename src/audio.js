// All sounds are synthesized with Web Audio, so there are no audio files to load.
const Sound = {
  ctx: null,
  on: true,

  // Browsers only allow audio after a key press or click.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  ready() { return this.on && this.ctx; },

  tone(freq, dur, { type = 'sine', vol = 0.2, to = null, delay = 0 } = {}) {
    if (!this.ready()) return;
    const c = this.ctx, t = c.currentTime + delay;
    const osc = c.createOscillator(), gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  },

  noise(dur, { vol = 0.3, freq = 900, delay = 0 } = {}) {
    if (!this.ready()) return;
    const c = this.ctx, t = c.currentTime + delay;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = c.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(c.destination);
    src.start(t);
  },

  step(n) {
    const up = Math.pow(1.12, n);
    this.tone(330 * up, 0.16, { type: 'triangle', vol: 0.25, to: 560 * up });
  },
  oops() { this.tone(200, 0.14, { type: 'square', vol: 0.05, to: 150 }); },
  bell() {
    this.tone(2093, 0.3, { type: 'triangle', vol: 0.1 });
    this.tone(2093, 0.3, { type: 'triangle', vol: 0.1, delay: 0.17 });
  },
  splash() {
    this.noise(0.5, { vol: 0.4, freq: 700 });
    this.tone(420, 0.35, { vol: 0.15, to: 80 });
  },
  laneDone() {
    this.tone(660, 0.12, { type: 'triangle', vol: 0.18 });
    this.tone(880, 0.18, { type: 'triangle', vol: 0.18, delay: 0.09 });
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.2, delay: i * 0.13 }));
  },
  lose() {
    [392, 330, 262].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', vol: 0.18, delay: i * 0.2 }));
  },
  click() { this.tone(800, 0.06, { type: 'triangle', vol: 0.12 }); },

  say(text) {
    if (!this.on || !window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.85;
    u.pitch = 1.15;
    speechSynthesis.speak(u);
  },
  hush() { if (window.speechSynthesis) speechSynthesis.cancel(); },
};
