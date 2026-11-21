// Generative background music: chords, bass, soft drums and ever-changing melodies.
// Each mood has its own tempo, key, progressions and instruments; melodies are re-composed
// every few bars (motif + variation) so the music never loops the same tune.

const SCALE = [0, 2, 4, 5, 7, 9, 11];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

const MOODS = {
  title:  { bpm: 96,  key: 60, progs: [[0, 4, 5, 3], [3, 4, 2, 5], [0, 5, 3, 4]], lead: 'marimba', comp: 'arp',   drums: 1,   swing: .08, vol: .9 },
  map:    { bpm: 104, key: 65, progs: [[0, 5, 1, 4], [0, 3, 4, 0], [5, 3, 0, 4]], lead: 'whistle', comp: 'strum', drums: 1,   swing: .12, vol: .85 },
  level:  { bpm: 84,  key: 67, progs: [[0, 3, 0, 4], [5, 3, 0, 4], [0, 2, 3, 4]], lead: 'bell',    comp: 'pad',   drums: .4,  swing: .05, vol: .6, sparse: true },
  finale: { bpm: 132, key: 60, progs: [[0, 3, 4, 0], [5, 3, 4, 4], [0, 4, 5, 3]], lead: 'brass',   comp: 'strum', drums: 1.3, swing: 0,   vol: 1 }
};

export function createMusic(getCtx) {
  let ctx = null, master = null, comp = null, noiseBuf = null, timer = null;
  let mood = null, cfg = null, step = 0, nextT = 0, bar = 0, motif = null, prog = null, keyShift = 0, on = true;

  function init() {
    ctx = getCtx(); if (!ctx || master) return !!ctx;
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    master = ctx.createGain(); master.gain.value = 0;
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * .5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  const env = (g, t, a, peak, dec) => { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + dec); };
  function osc(type, f, t, dur, peak, a = .005, out = master, detune = 0) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = f; o.detune.value = detune;
    env(g, t, a, peak, dur); o.connect(g).connect(out); o.start(t); o.stop(t + a + dur + .05); return o;
  }
  const inst = {
    marimba(t, f, v) { osc('sine', f, t, .45, .22 * v); osc('sine', f * 4, t, .08, .05 * v); },
    bell(t, f, v) { osc('sine', f, t, 1.1, .12 * v); osc('sine', f * 2.01, t, .6, .04 * v); osc('triangle', f * 3, t, .15, .02 * v); },
    whistle(t, f, v, dur) { const o = osc('sine', f, t, dur * .9 + .1, .1 * v, .04); const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.5; lg.gain.value = 6; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + .2); },
    brass(t, f, v, dur) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(600, t); lp.frequency.linearRampToValueAtTime(2600, t + .08); lp.connect(master); osc('sawtooth', f, t, dur * .8 + .1, .07 * v, .03, lp); osc('sawtooth', f, t, dur * .8 + .1, .05 * v, .03, lp, 7); },
    pluck(t, f, v) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(400, t + .3); lp.connect(master); osc('triangle', f, t, .35, .1 * v, .003, lp); },
    pad(t, fs, dur, v) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.connect(master); fs.forEach(f => { osc('triangle', f, t, dur, .035 * v, .35, lp, -6); osc('triangle', f, t, dur, .035 * v, .35, lp, 6); }); },
    bass(t, f, v, dur) { osc('sine', f, t, dur, .2 * v, .01); osc('triangle', f * 2, t, dur * .5, .04 * v, .01); },
    kick(t, v) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(45, t + .14); env(g, t, .003, .3 * v, .16); o.connect(g).connect(master); o.start(t); o.stop(t + .25); },
    hat(t, v, open) { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = 7000; env(g, t, .002, .05 * v, open ? .12 : .035); s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + .2); },
    shaker(t, v) { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = 5000; env(g, t, .01, .025 * v, .05); s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + .15); },
    clap(t, v) { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = 1500; env(g, t, .002, .09 * v, .12); s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + .2); }
  };

  const degree = (root, d, oct = 0) => root + SCALE[((d % 7) + 7) % 7] + 12 * (Math.floor(d / 7) + oct);
  const chordTones = (root, d) => [degree(root, d), degree(root, d + 2), degree(root, d + 4)];

  // Compose a 2-bar motif as rhythm + scale-degree offsets relative to each bar's chord root.
  function newMotif() {
    const rhythms = [[0, 4, 6, 8, 12], [0, 3, 6, 8, 10, 12], [0, 2, 4, 8, 12, 14], [0, 6, 8, 11, 12], [0, 4, 8, 10, 12, 14], [2, 4, 6, 8, 12]];
    const bars = [pick(rhythms), pick(rhythms)];
    let d = pick([0, 2, 4]);
    return bars.map((r, bi) => r.map((s, i) => {
      if (i > 0) d += pick([-2, -1, -1, 1, 1, 2, 0, 3]);
      d = Math.max(-2, Math.min(9, d));
      const strong = s % 8 === 0;
      return { s, d: strong ? pick([0, 2, 4, 7]) : d, len: pick([1, 2, 2, 3]) };
    }));
  }

  function scheduleStep(t) {
    const spb = 60 / cfg.bpm, sixteenth = spb / 4;
    const s = step % 16;
    if (s === 0) {
      if (bar % 8 === 0) { prog = pick(cfg.progs); if (bar % 16 === 0 || !motif) motif = newMotif(); keyShift = (mood === 'title' && bar % 32 === 16) ? 2 : (bar % 32 === 0 ? 0 : keyShift); }
    }
    const root = cfg.key + keyShift, chordDeg = prog[bar % 4];
    const ct = chordTones(root, chordDeg);
    const sw = (s % 2 === 1) ? cfg.swing * sixteenth : 0, tt = t + sw;
    // drums
    const dv = cfg.drums;
    if (dv > 0) {
      if (s === 0 || s === 8 || (mood === 'finale' && s === 4) || (s === 10 && Math.random() < .3)) inst.kick(tt, dv * .9);
      if (s % 4 === 2) inst.hat(tt, dv, s === 14 && Math.random() < .4);
      if (s % 2 === 1) inst.shaker(tt, dv);
      if ((s === 4 || s === 12) && mood !== 'level') inst.clap(tt, dv * .7);
    }
    // bass
    if (s === 0) inst.bass(tt, mtof(ct[0] - 24), .9, spb * 1.6);
    if (s === 8) inst.bass(tt, mtof((Math.random() < .5 ? ct[2] : ct[0]) - 24), .8, spb * 1.4);
    if (s === 14 && Math.random() < .4) inst.bass(tt, mtof(ct[1] - 24), .6, spb * .5);
    // comping
    if (cfg.comp === 'pad' && s === 0) inst.pad(tt, ct.map(n => mtof(n - 12)), spb * 3.6, 1);
    if (cfg.comp === 'arp' && s % 2 === 0) { const seq = [0, 1, 2, 1, 2, 3, 2, 1]; const n = seq[(s / 2) % 8]; inst.pluck(tt, mtof((n === 3 ? ct[0] + 12 : ct[n]) - 12), .8); }
    if (cfg.comp === 'strum' && (s === 0 || s === 6 || s === 8 || s === 12)) ct.forEach((n, i) => inst.pluck(tt + i * .012, mtof(n - 12), .7));
    // melody (bars 1-2 motif, 3-4 repeat, 5-6 variation, 7 answer, 8 rest/cadence)
    const phrase = bar % 8, mb = motif[phrase % 2];
    if (!(cfg.sparse && phrase % 2 === 1) && phrase !== 7) {
      for (const n of mb) if (n.s === s) {
        let d = chordDeg + n.d + (phrase >= 4 && phrase < 6 ? pick([0, 1, -1]) : 0);
        if (phrase === 6 && s >= 8) d = chordDeg + pick([0, 2, 4]);
        const f = mtof(degree(root, d));
        inst[cfg.lead](tt, f, .9, n.len * sixteenth * 1.8);
      }
    } else if (phrase === 7 && s === 0) inst[cfg.lead](tt, mtof(degree(root, chordDeg + 7)), .8, spb * 1.5);
    step++; if (step % 16 === 0) bar++;
  }

  function tick() {
    if (!ctx || !cfg) return;
    const spb = 60 / cfg.bpm;
    while (nextT < ctx.currentTime + .15) { scheduleStep(nextT); nextT += spb / 4; }
  }

  return {
    play(m) {
      if (!on || !init()) { mood = m; return; }
      if (m === mood && timer) return;
      mood = m; cfg = MOODS[m]; step = 0; bar = 0; motif = null;
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(.0001, t + .25);
      master.gain.linearRampToValueAtTime(.55 * cfg.vol, t + 1.2);
      nextT = t + .3;
      if (!timer) timer = setInterval(tick, 25);
    },
    stop() { if (timer) { clearInterval(timer); timer = null; } if (master && ctx) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setValueAtTime(.0001, ctx.currentTime); } },
    setOn(v) { on = v; if (!v) this.stop(); else if (mood) { const m = mood; mood = null; this.play(m); } },
    get mood() { return mood; }
  };
}
