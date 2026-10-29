// Chiptune music and sound effects with the Web Audio API.
// Voices mimic a 1983 sound chip: two pulse channels, a triangle bass and a noise channel.
(function (G) {
  let ac = null, master, musicBus, sfxBus, noiseBuf, crowdGain, crowdFilter;
  const waves = {};
  let muted = false;

  const NOTE_IDX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  function freq(name) {
    const m = /^([A-G]#?)(\d)$/.exec(name);
    if (!m) return 0;
    const midi = 12 * (+m[2] + 1) + NOTE_IDX[m[1]];
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function pulseWave(duty) {
    const n = 64, re = new Float32Array(n), im = new Float32Array(n);
    // Fourier series of a pulse wave that is high for `duty` of each cycle
    for (let k = 1; k < n; k++) { re[k] = (2 / (k * Math.PI)) * Math.sin(2 * k * Math.PI * duty); im[k] = (2 / (k * Math.PI)) * (1 - Math.cos(2 * k * Math.PI * duty)); }
    return ac.createPeriodicWave(re, im);
  }

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ac.destination);
    musicBus = ac.createGain(); musicBus.gain.value = 0.55; musicBus.connect(master);
    sfxBus = ac.createGain(); sfxBus.gain.value = 0.8; sfxBus.connect(master);
    waves.p125 = pulseWave(0.125); waves.p25 = pulseWave(0.25); waves.p50 = pulseWave(0.5);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // Crowd murmur: looping low-passed noise whose level rises when the crowd cheers.
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    crowdFilter = ac.createBiquadFilter(); crowdFilter.type = 'bandpass'; crowdFilter.frequency.value = 700; crowdFilter.Q.value = 0.6;
    crowdGain = ac.createGain(); crowdGain.gain.value = 0;
    src.connect(crowdFilter); crowdFilter.connect(crowdGain); crowdGain.connect(sfxBus); src.start();
  }

  // ---------- tone helpers ----------
  function tone(bus, wave, f, t, dur, vol, opts) {
    opts = opts || {};
    const o = ac.createOscillator();
    if (typeof wave === 'string' && waves[wave]) o.setPeriodicWave(waves[wave]); else o.type = wave;
    o.frequency.setValueAtTime(f, t);
    if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur);
    const g = ac.createGain();
    const a = 0.004, rel = Math.min(0.03, dur * 0.3);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.setValueAtTime(vol * (opts.sustain || 0.7), t + Math.min(dur * 0.4, 0.06));
    g.gain.setValueAtTime(vol * (opts.sustain || 0.7), t + dur - rel);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.02);
    return o;
  }

  function noise(bus, t, dur, vol, type, fr, q, endFr) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    s.playbackRate.value = 0.5 + Math.random();
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(fr, t); f.Q.value = q || 1;
    if (endFr) f.frequency.exponentialRampToValueAtTime(endFr, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
    return s;
  }

  // ---------- music sequencer ----------
  // A song has bpm, optional loop, voices with note strings ("C5/2 R/2 ...", lengths in 16ths)
  // and a drum pattern list (one 16-char string per bar: K kick, S snare, h hat, o open hat).
  function parse(str) {
    const out = []; let t = 0;
    for (const tok of str.trim().split(/\s+/)) {
      const [n, l] = tok.split('/');
      const len = +(l || 2);
      if (n !== 'R') out.push({ t, len, f: freq(n) });
      t += len;
    }
    return { notes: out, len: t };
  }
  const compiled = new Map();
  function compile(song) {
    if (compiled.has(song)) return compiled.get(song);
    const voices = song.voices.map(v => Object.assign({}, v, parse(v.notes)));
    let len = Math.max(...voices.map(v => v.len));
    const drums = [];
    if (song.drums) {
      song.drums.join('').split('').forEach((c, i) => { if (c !== '.') drums.push({ t: i, c }); });
      len = Math.max(len, song.drums.join('').length);
    }
    const c = { voices, drums, len };
    compiled.set(song, c);
    return c;
  }

  let current = null; // {song, c, start, nextStep, timer, nodes, onEnd}

  function drum(c, t) {
    if (c === 'K') {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.16);
    } else if (c === 'S') noise(musicBus, t, 0.12, 0.45, 'bandpass', 1800, 0.8);
    else if (c === 'h') noise(musicBus, t, 0.03, 0.18, 'highpass', 7000, 1);
    else if (c === 'o') noise(musicBus, t, 0.12, 0.16, 'highpass', 6000, 1);
  }

  function schedule() {
    if (!current) return;
    const { c, song } = current;
    const step = 60 / song.bpm / 4; // seconds per 16th
    const horizon = ac.currentTime + 0.15;
    while (true) {
      const s = current.nextStep;
      const t = current.start + s * step;
      if (t > horizon) break;
      if (s >= c.len) {
        if (song.loop) { current.start += c.len * step; current.nextStep = 0; continue; }
        const done = current.onEnd; const endT = t;
        clearInterval(current.timer); current = null;
        if (done) setTimeout(done, Math.max(0, (endT - ac.currentTime) * 1000));
        return;
      }
      for (const v of c.voices) for (const n of v.notes) if (n.t === s)
        tone(musicBus, v.wave, n.f, t, n.len * step * (v.gate || 0.9), v.vol || 0.2);
      for (const d of c.drums) if (d.t === s) drum(d.c, t);
      current.nextStep++;
    }
  }

  function play(song, onEnd) {
    if (!ac) { if (onEnd) setTimeout(onEnd, 10); return; }
    stop();
    const c = compile(song);
    current = { song, c, start: ac.currentTime + 0.05, nextStep: 0, onEnd };
    current.timer = setInterval(schedule, 25);
    schedule();
  }
  function stop() {
    if (current) { clearInterval(current.timer); current = null; }
  }

  // ---------- songs (all original compositions) ----------
  const DR_MARCH = 'K.h.S.h.K.h.S.h.';
  const SONGS = {
    // Running song for the events: JD's sung melody, transcribed and arranged for the sound chip (G major, 3+3+2 feel).
    running: {
      bpm: 120, loop: true,
      voices: [
        { wave: 'p25', vol: 0.18, notes:
          'G4/3 C5/3 D5/3 E5/3 D5/7 B4/10 R/3 G4/3 ' +
          'C5/3 D5/3 E5/3 D5/2 D5/3 R/1 D5/2 D5/4 ' +
          'R/8 G4/3 C5/3 D5/3 E5/3 D5/7 B4/10 R/3 ' +
          'B4/4 C5/3 B4/3 F#4/3 G4/16 R/3 A5/4 G5/3 ' +
          'F5/3 D5/2 G5/5 R/1 D5/3 F5/5 D5/3 E5/3 ' +
          'R/3 A5/2 G5/3 E5/3 D5/1 G5/14 R/2 G5/2 ' +
          'R/2 R/3 A5/1 G#5/1 G5/3 E5/3 D#5/1 G5/5 ' +
          'R/1 D5/1 D#5/1 E5/5 A#4/2 R/1 D5/2 R/2 ' +
          'R/2 A#4/2 C5/3 B4/2 A4/1 G4/2 R/1 G4/16 ' +
          'R/3 ' },
        { wave: 'p125', vol: 0.07, gate: 0.6, notes:
          'C4/2 E4/2 G4/2 E4/2 C4/2 E4/2 G4/2 E4/2 ' +
          'G4/2 B4/2 D4/2 B4/2 G4/2 B4/2 D4/2 B4/2 ' +
          'C4/2 E4/2 G4/2 E4/2 C4/2 E4/2 G4/2 E4/2 ' +
          'D4/2 F#4/2 A4/2 F#4/2 D4/2 F#4/2 A4/2 F#4/2 ' +
          'C4/2 E4/2 G4/2 E4/2 C4/2 E4/2 G4/2 E4/2 ' +
          'G4/2 B4/2 D4/2 B4/2 G4/2 B4/2 D4/2 B4/2 ' +
          'D4/2 F#4/2 C4/2 F#4/2 D4/2 F#4/2 C4/2 F#4/2 ' +
          'G4/2 B4/2 D4/2 B4/2 G4/2 B4/2 D4/2 B4/2 ' +
          'F4/2 A4/2 C4/2 A4/2 F4/2 A4/2 C4/2 A4/2 ' +
          'G4/2 B4/2 F4/2 B4/2 G4/2 B4/2 F4/2 B4/2 ' +
          'C4/2 E4/2 G4/2 E4/2 C4/2 E4/2 G4/2 E4/2 ' +
          'E4/2 G4/2 B4/2 G4/2 E4/2 G4/2 B4/2 G4/2 ' +
          'A4/2 C4/2 E4/2 C4/2 A4/2 C4/2 E4/2 C4/2 ' +
          'C4/2 E4/2 G4/2 E4/2 C4/2 E4/2 G4/2 E4/2 ' +
          'D4/2 F#4/2 C4/2 F#4/2 D4/2 F#4/2 C4/2 F#4/2 ' +
          'G4/2 B4/2 D4/2 B4/2 G4/2 B4/2 D4/2 B4/2 ' },
        { wave: 'triangle', vol: 0.32, gate: 0.8, notes:
          'C2/3 C3/3 G2/2 C2/3 C3/3 G2/2 G2/3 G3/3 ' +
          'D2/2 G2/3 G3/3 D2/2 C2/3 C3/3 G2/2 C2/3 ' +
          'C3/3 G2/2 D2/3 D3/3 A2/2 D2/3 D3/3 A2/2 ' +
          'C2/3 C3/3 G2/2 C2/3 C3/3 G2/2 G2/3 G3/3 ' +
          'D2/2 G2/3 G3/3 D2/2 D2/3 D3/3 A2/2 D2/3 ' +
          'D3/3 A2/2 G2/3 G3/3 D2/2 G2/3 G3/3 D2/2 ' +
          'F2/3 F3/3 C2/2 F2/3 F3/3 C2/2 G2/3 G3/3 ' +
          'D2/2 G2/3 G3/3 D2/2 C2/3 C3/3 G2/2 C2/3 ' +
          'C3/3 G2/2 E2/3 E3/3 B2/2 E2/3 E3/3 B2/2 ' +
          'A2/3 A3/3 E2/2 A2/3 A3/3 E2/2 C2/3 C3/3 ' +
          'G2/2 C2/3 C3/3 G2/2 D2/3 D3/3 A2/2 D2/3 ' +
          'D3/3 A2/2 G2/3 G3/3 D2/2 G2/3 G3/3 D2/2 ' },
      ],
      drums: ['K.hK.hS.K.hK.hS.', 'K.hK.hS.K.hK.hS.', 'K.hK.hS.K.hK.hS.', 'K.hK.hS.K.hK.hS.', 'K.hK.hS.K.hK.hS.', 'K.hK.hS.K.hK.hS.', 'K.hK.hS.K.hK.hS.', 'K.hK.hS.K.S.SSSS', 'K.hK.hS.K.hK.hS.', 'K.hK.hS.K.hK.hS.', 'K.hK.hS.K.hK.hS.', 'K.hK.hS.K.hK.hS.', 'K.hK.hS.K.hK.hS.', 'K.hK.hS.K.hK.hS.', 'K.hK.hS.K.hK.hS.', 'K.hK.hS.K...o...'],
    },
    // Olympic theme for the menus and score screens: JD's second recording (E-flat major).
    anthem: {
      bpm: 97, loop: true,
      voices: [
        { wave: 'p25', vol: 0.17, notes:
          'D#5/8 A#5/8 D#5/4 F5/4 G5/4 D5/4 F5/4 F5/4 ' +
          'F5/4 G#5/2 F5/2 D#5/4 G5/2 F5/2 D#5/4 R/4 ' +
          'G5/6 R/2 A#5/8 D#5/4 F5/4 G5/4 D5/4 F5/4 ' +
          'F5/4 F5/4 G#5/2 F5/2 D#5/4 G5/2 F5/2 D#5/4 ' +
          'R/4 G5/6 R/2 A#5/8 D#5/4 F5/4 G#5/4 D#5/4 ' +
          'F5/4 F5/4 F5/4 G#5/2 F5/2 D#5/4 G5/2 D#5/2 ' +
          'F5/4 R/4 G5/6 R/2 A#5/8 D#5/4 F5/4 G5/4 ' +
          'D5/4 F5/4 F5/4 F5/4 G5/2 F5/2 D#5/4 G5/2 ' +
          'F5/2 D#5/8 F#5/2 G5/2 D#5/2 F#5/2 G#5/2 A5/2 ' +
          'E5/2 G#5/2 E5/2 A5/2 E5/2 G5/2 F5/2 A#5/2 ' +
          'G5/2 D#5/2 F5/2 G5/2 G#5/2 A5/2 A#5/2 G5/2 ' +
          'A5/4 C6/6 A5/2 A#5/2 C6/6 C6/16 ' },
        { wave: 'p50', vol: 0.09, gate: 0.8, notes:
          'D#4/8 A#4/8 D#4/4 F4/4 G4/4 D4/4 F4/4 F4/4 ' +
          'F4/4 G#4/2 F4/2 D#4/4 G4/2 F4/2 D#4/4 R/4 ' +
          'G4/6 R/2 A#4/8 D#4/4 F4/4 G4/4 D4/4 F4/4 ' +
          'F4/4 F4/4 G#4/2 F4/2 D#4/4 G4/2 F4/2 D#4/4 ' +
          'R/4 G4/6 R/2 A#4/8 D#4/4 F4/4 G#4/4 D#4/4 ' +
          'F4/4 F4/4 F4/4 G#4/2 F4/2 D#4/4 G4/2 D#4/2 ' +
          'F4/4 R/4 G4/6 R/2 A#4/8 D#4/4 F4/4 G4/4 ' +
          'D4/4 F4/4 F4/4 F4/4 G4/2 F4/2 D#4/4 G4/2 ' +
          'F4/2 D#4/8 F#4/2 G4/2 D#4/2 F#4/2 G#4/2 A4/2 ' +
          'E4/2 G#4/2 E4/2 A4/2 E4/2 G4/2 F4/2 A#4/2 ' +
          'G4/2 D#4/2 F4/2 G4/2 G#4/2 A4/2 A#4/2 G4/2 ' +
          'A4/4 C5/6 A4/2 A#4/2 C5/6 C5/16 ' },
        { wave: 'p125', vol: 0.05, gate: 0.6, notes:
          'D#4/2 G4/2 A#4/2 G4/2 D#4/2 G4/2 A#4/2 G4/2 ' +
          'D#4/2 G4/2 A#4/2 G4/2 D#4/2 G4/2 A#4/2 G4/2 ' +
          'A#4/2 D4/2 G#4/2 D4/2 A#4/2 D4/2 G#4/2 D4/2 ' +
          'D#4/2 G4/2 A#4/2 G4/2 D#4/2 G4/2 A#4/2 G4/2 ' +
          'D#4/2 G4/2 A#4/2 G4/2 D#4/2 G4/2 A#4/2 G4/2 ' +
          'D#4/2 G4/2 A#4/2 G4/2 D#4/2 G4/2 A#4/2 G4/2 ' +
          'A#4/2 D4/2 G#4/2 D4/2 A#4/2 D4/2 G#4/2 D4/2 ' +
          'D#4/2 G4/2 A#4/2 G4/2 D#4/2 G4/2 A#4/2 G4/2 ' +
          'D#4/2 G4/2 A#4/2 G4/2 D#4/2 G4/2 A#4/2 G4/2 ' +
          'G#4/2 C4/2 D#4/2 C4/2 G#4/2 C4/2 D#4/2 C4/2 ' +
          'A#4/2 D4/2 G#4/2 D4/2 A#4/2 D4/2 G#4/2 D4/2 ' +
          'D#4/2 G4/2 A#4/2 G4/2 D#4/2 G4/2 A#4/2 G4/2 ' +
          'D#4/2 G4/2 A#4/2 G4/2 D#4/2 G4/2 A#4/2 G4/2 ' +
          'D#4/2 G4/2 A#4/2 G4/2 D#4/2 G4/2 A#4/2 G4/2 ' +
          'A#4/2 D4/2 G#4/2 D4/2 A#4/2 D4/2 G#4/2 D4/2 ' +
          'D#4/2 G4/2 A#4/2 G4/2 D#4/2 G4/2 A#4/2 G4/2 ' +
          'D#4/2 G4/2 A#4/2 G4/2 D#4/2 G4/2 A#4/2 G4/2 ' +
          'G#4/2 C4/2 D#4/2 C4/2 G#4/2 C4/2 D#4/2 C4/2 ' +
          'A#4/2 D4/2 G#4/2 D4/2 A#4/2 D4/2 G#4/2 D4/2 ' +
          'F4/2 A4/2 D#4/2 A4/2 F4/2 A4/2 D#4/2 A4/2 ' +
          'D#4/16 ' },
        { wave: 'triangle', vol: 0.32, gate: 0.8, notes:
          'D#2/4 A#2/4 D#3/4 A#2/4 D#2/4 A#2/4 D#3/4 A#2/4 ' +
          'A#2/4 F2/4 A#3/4 F2/4 D#2/4 A#2/4 D#3/4 A#2/4 ' +
          'D#2/4 A#2/4 D#3/4 A#2/4 D#2/4 A#2/4 D#3/4 A#2/4 ' +
          'A#2/4 F2/4 A#3/4 F2/4 D#2/4 A#2/4 D#3/4 A#2/4 ' +
          'D#2/4 A#2/4 D#3/4 A#2/4 G#2/4 D#2/4 G#3/4 D#2/4 ' +
          'A#2/4 F2/4 A#3/4 F2/4 D#2/4 A#2/4 D#3/4 A#2/4 ' +
          'D#2/4 A#2/4 D#3/4 A#2/4 D#2/4 A#2/4 D#3/4 A#2/4 ' +
          'A#2/4 F2/4 A#3/4 F2/4 D#2/4 A#2/4 D#3/4 A#2/4 ' +
          'D#2/4 A#2/4 D#3/4 A#2/4 G#2/4 D#2/4 G#3/4 D#2/4 ' +
          'A#2/4 F2/4 A#3/4 F2/4 F2/4 C2/4 F3/4 C2/4 ' +
          'D#2/16 ' },
      ],
      drums: [
        'K...S...K.SSSSSS', 'K...S...K.K.S...', 'K...S...K.K.S...', 'K...S...K.K.S...',
        'K...S...K.SSSSSS', 'K...S...K.K.S...', 'K...S...K.K.S...', 'K...S...K.K.S...',
        'K...S...K.SSSSSS', 'K...S...K.K.S...', 'K...S...K.K.S...', 'K...S...K.K.S...',
        'K...S...K.SSSSSS', 'K...S...K.K.S...', 'K...S...K.K.S...', 'K...S...K.K.S...',
        'K...S...K.SSSSSS', 'K...S...K.K.S...', 'K...S...K.K.S...', 'K...S...K.K.S...',
        'K.......o.......',
      ],
    },
    fanfare: {
      bpm: 150,
      voices: [
        { wave: 'p25', vol: 0.2, notes: 'G4/2 C5/2 E5/2 G5/4 E5/2 G5/2 R/2  C6/8 R/8' },
        { wave: 'p125', vol: 0.1, notes: 'E4/2 G4/2 C5/2 E5/4 C5/2 E5/2 R/2  G5/8 R/8' },
        { wave: 'triangle', vol: 0.3, notes: 'C3/4 G2/4 C3/4 G2/2 R/2  C3/8 R/8' },
      ],
      drums: ['K...S...K.S.S.S.', 'K.......o.......'],
    },
    qualify: {
      bpm: 170,
      voices: [
        { wave: 'p25', vol: 0.2, notes: 'C5/2 E5/2 G5/2 C6/2 G5/2 C6/2 E6/8 R/4' },
        { wave: 'triangle', vol: 0.3, notes: 'C3/2 C3/2 E3/2 G3/2 E3/2 G3/2 C4/8 R/4' },
      ],
      drums: ['K.S.K.S.K.S.K...', 'o...............'],
    },
    fail: {
      bpm: 120,
      voices: [
        { wave: 'p50', vol: 0.18, notes: 'G4/4 F#4/4 F4/4 E4/12' },
        { wave: 'triangle', vol: 0.3, notes: 'C3/4 B2/4 A#2/4 A2/12' },
      ],
    },
    record: {
      bpm: 180,
      voices: [
        { wave: 'p25', vol: 0.2, notes: 'C5/1 E5/1 G5/1 C6/1 E5/1 G5/1 C6/1 E6/1 G5/1 C6/1 E6/1 G6/1 C7/8 R/4' },
        { wave: 'triangle', vol: 0.3, notes: 'C3/4 E3/4 G3/4 C4/8 R/4' },
      ],
    },
  };

  // ---------- sound effects ----------
  const sfx = {
    gun() { const t = ac.currentTime; noise(sfxBus, t, 0.5, 1.0, 'lowpass', 3000, 0.7, 200); },
    step() { noise(sfxBus, ac.currentTime, 0.04, 0.25, 'bandpass', 900 + Math.random() * 300, 2); },
    jump() { tone(sfxBus, 'p25', 300, ac.currentTime, 0.18, 0.15, { slideTo: 900 }); },
    land() { noise(sfxBus, ac.currentTime, 0.3, 0.7, 'lowpass', 500, 1, 80); },
    knock() { const t = ac.currentTime; tone(sfxBus, 'square', 180, t, 0.12, 0.2, { slideTo: 90 }); noise(sfxBus, t, 0.12, 0.4, 'bandpass', 2500, 3); },
    throw() { noise(sfxBus, ac.currentTime, 0.35, 0.4, 'bandpass', 500, 2, 3000); },
    thud() { noise(sfxBus, ac.currentTime, 0.25, 0.8, 'lowpass', 400, 1, 60); },
    foul() { const t = ac.currentTime; tone(sfxBus, 'square', 110, t, 0.45, 0.2); tone(sfxBus, 'square', 116, t, 0.45, 0.15); },
    beep() { tone(sfxBus, 'p50', 880, ac.currentTime, 0.08, 0.15); },
    blip() { tone(sfxBus, 'p25', 1320, ac.currentTime, 0.04, 0.1); },
    select() { const t = ac.currentTime; tone(sfxBus, 'p25', 660, t, 0.06, 0.15); tone(sfxBus, 'p25', 1320, t + 0.06, 0.1, 0.15); },
    tick() { tone(sfxBus, 'p125', 2000, ac.currentTime, 0.02, 0.06); },
    whistle() { const t = ac.currentTime; tone(sfxBus, 'sine', 2600, t, 0.25, 0.15); tone(sfxBus, 'sine', 2750, t + 0.02, 0.2, 0.08); },
    angle(a) { tone(sfxBus, 'p125', 300 + a * 12, ac.currentTime, 0.03, 0.05); },
    swish(spd) { noise(sfxBus, ac.currentTime, 0.12, 0.15 + spd * 0.25, 'bandpass', 600 + spd * 1500, 3); },
  };

  G.audio = {
    init,
    play: (name, onEnd) => play(SONGS[name], onEnd),
    // The menu music: starts the Olympic theme unless it is already playing.
    theme() { if (!current || current.song !== SONGS.anthem) play(SONGS.anthem); },
    songs: SONGS, // extra tracks (see extras/) can be added here
    stop,
    sfx: new Proxy(sfx, { get: (o, k) => (...a) => { if (ac && o[k]) o[k](...a); } }),
    crowd(level) { // 0..1
      if (!ac) return;
      crowdGain.gain.setTargetAtTime(level * 0.25, ac.currentTime, 0.3);
    },
    cheer() {
      if (!ac) return;
      const t = ac.currentTime;
      crowdGain.gain.cancelScheduledValues(t);
      crowdGain.gain.setTargetAtTime(0.6, t, 0.1);
      crowdGain.gain.setTargetAtTime(0.08, t + 1.5, 0.6);
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() { return muted; },
  };
})(window.G = window.G || {});
