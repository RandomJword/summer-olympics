// The six events. Each event runs its own physics in update() and draws itself in draw().
// update() never touches the canvas, so the physics can be exercised headlessly (see tools/sim.js).
(function (G) {
  const PPM = () => G.PPM;
  G.RUN_GAIN = 1.0;   // m/s added by each alternating RUN press
  G.RUN_DRAG = 0.85;  // fraction of speed lost per second
  G.VMAX = 12;        // top speed, m/s
  const GRAV = 9.81;
  const sfx = () => G.audio.sfx;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const DEG = Math.PI / 180;

  // ---------- event table ----------
  const pts = (A, B, C, track) => (v) => {
    if (v === null || v === undefined) return 0;
    const d = track ? B - v : v - B;
    return d > 0 ? Math.floor(A * Math.pow(d, C)) : 0;
  };
  // Points use the real decathlon scoring tables (hammer uses the throws-pentathlon table).
  G.EVENT_LIST = [
    { id: 'dash', name: '100M DASH', short: '100M', time: true, wr: '9.93', unit: 'SEC',
      quals: [12.20, 11.60, 11.00, 10.50, 10.20], points: pts(25.4347, 18, 1.81, true),
      help: ['ALTERNATE THE RUN KEYS', 'AS FAST AS YOU CAN!', "DON'T RUN BEFORE THE GUN"] },
    { id: 'long', name: 'LONG JUMP', short: 'LONG J.', wr: '8.90', unit: 'M',
      quals: [5.30, 6.50, 7.20, 7.80, 8.20], points: (v) => pts(0.14354, 220, 1.4)(v === null ? null : v * 100),
      help: ['RUN, JUMP AT THE BOARD', 'HOLD JUMP TO RAISE ANGLE', 'RELEASE NEAR 45* - 3 TRIES'] },
    { id: 'jav', name: 'JAVELIN THROW', short: 'JAVELIN', wr: '99.72', unit: 'M',
      quals: [52, 60, 68, 75, 80], points: pts(10.14, 7, 1.08),
      help: ['RUN, THROW BEFORE THE LINE', 'HOLD TO RAISE THE ANGLE', 'RELEASE NEAR 45* - 3 TRIES'] },
    { id: 'hurdles', name: '110M HURDLES', short: '110M H.', time: true, wr: '12.93', unit: 'SEC',
      quals: [17.30, 14.20, 13.50, 13.00, 12.60], points: pts(5.74352, 28.5, 1.92, true),
      help: ['ALTERNATE THE RUN KEYS', 'PRESS JUMP FOR EACH HURDLE', 'HITTING ONE SLOWS YOU DOWN'] },
    { id: 'hammer', name: 'HAMMER THROW', short: 'HAMMER', wr: '84.14', unit: 'M',
      quals: [48, 55, 61, 66, 70], points: pts(13.0449, 7, 1.05),
      help: ['PRESS RUN TO START SPINNING', 'HOLD ACTION TO RAISE ANGLE', 'LET GO WHEN ARROW IS GREEN'] },
    { id: 'high', name: 'HIGH JUMP', short: 'HIGH J.', wr: '2.38', unit: 'M',
      quals: [1.85, 1.95, 2.05, 2.12, 2.18], points: (v) => pts(0.8465, 75, 1.42)(v === null ? null : v * 100),
      help: ['KEEP YOUR SPEED IN THE GREEN', 'JUMP NEAR THE BAR AND HOLD', 'RELEASE AT A STEEP ANGLE'] },
  ];
  G.qualFor = (ev, round) => ev.quals[Math.min(round - 1, ev.quals.length - 1)];
  G.fmtVal = (ev, v) => {
    if (v === null || v === undefined) return ev.time ? '--.--' : 'FOUL';
    return ev.time ? v.toFixed(2) : v.toFixed(2) + 'M';
  };
  G.isQualified = (ev, v, q) => v !== null && v !== undefined && (ev.time ? v <= q + 1e-9 : v >= q - 1e-9);
  G.isBetter = (ev, a, b) => b === null || b === undefined || (ev.time ? a < b : a > b);

  // ---------- runner ----------
  class Runner {
    constructor(vmax) { this.x = 0; this.v = 0; this.last = ''; this.phase = 0; this.vmax = vmax || G.VMAX; this.stepped = false; }
    press(side) {
      const g = side !== this.last ? 1 : 0.3; // alternating keys is what counts
      this.last = side;
      this.v = Math.min(this.vmax, this.v + G.RUN_GAIN * g);
    }
    update(dt, drag) {
      this.v = Math.max(0, this.v - this.v * (drag === undefined ? G.RUN_DRAG : drag) * dt);
      if (this.v < 0.15) this.v = 0;
      this.x += this.v * dt;
      const before = Math.floor(this.phase / Math.PI);
      this.phase += (this.v * dt / 2.3) * Math.PI * 2;
      this.stepped = Math.floor(this.phase / Math.PI) !== before;
    }
    pose() { return G.poses.run(this.phase, clamp(this.v / 5, 0, 1)); }
  }
  G.Runner = Runner;

  // ---------- shared drawing ----------
  function hud(ctx, ev, o) {
    G.rect(ctx, 0, 200, G.W, 24, '#000');
    if (o.l1) G.text(ctx, o.l1, 4, 203, '#f8f8f8');
    if (o.r1) G.text(ctx, o.r1, G.W - 4, 203, '#f8d038', { align: 'right' });
    if (o.l2) G.text(ctx, o.l2, 4, 214, '#f8f8f8');
    if (o.speed !== undefined) {
      G.text(ctx, 'SPD', 4, 214, '#80c0ff');
      const segs = 24, n = Math.round(clamp(o.speed / G.VMAX, 0, 1) * segs);
      for (let i = 0; i < segs; i++) {
        let c = i < n ? (i < 12 ? '#40e040' : i < 19 ? '#f0e040' : '#f04040') : '#303030';
        if (o.zone && i >= o.zone[0] && i < o.zone[1] && i >= n) c = '#205020';
        G.rect(ctx, 32 + i * 4, 214, 3, 8, c);
      }
    }
    if (o.angle !== undefined) {
      G.text(ctx, 'ANG', 134, 214, '#80c0ff');
      G.text(ctx, Math.round(o.angle) + '*', 162, 214, o.angleHot ? '#f8d038' : '#f8f8f8');
    }
    if (o.r2) G.text(ctx, o.r2, G.W - 4, 214, '#c0c0c0', { align: 'right' });
  }

  function bigMsg(ctx, m) {
    if (!m || m.t <= 0) return;
    const y = m.y || 92, w = Math.max(G.textWidth(m.text, 2), m.sub ? G.textWidth(m.sub, 1) : 0) + 12;
    G.rect(ctx, G.W / 2 - w / 2, y - 4, w, m.sub ? 34 : 22, 'rgba(0,0,0,0.75)');
    G.text(ctx, m.text, G.W / 2, m.y || 92, m.color, { scale: 2, align: 'center', shadow: '#000' });
    if (m.sub) G.text(ctx, m.sub, G.W / 2, (m.y || 92) + 18, '#f8f8f8', { align: 'center', shadow: '#000' });
  }

  function attemptsText(list) {
    const out = [];
    for (let i = 0; i < 3; i++) out.push((i + 1) + ':' + (i < list.length ? (list[i] === null ? 'X' : list[i].toFixed(2)) : '--'));
    return out.join(' ');
  }

  function particles(ctx, list, cam) {
    for (const p of list) {
      const [sx, sy] = G.toScreen(p.x, p.y, cam.x, cam.y);
      G.rect(ctx, sx, sy, 1, 1, p.c);
    }
  }
  function stepParticles(list, dt) {
    for (const p of list) { p.vy -= GRAV * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    for (let i = list.length - 1; i >= 0; i--) if (list[i].life <= 0 || list[i].y < -0.3) list.splice(i, 1);
  }
  function burst(list, x, y, n, c, spd) {
    for (let i = 0; i < n; i++) list.push({ x, y, vx: (Math.random() - 0.3) * spd, vy: Math.random() * spd, life: 0.8, c });
  }

  // Ground-level markers (distance boards) every `every` metres between a and b.
  function distanceMarks(ctx, cam, a, b, every, y) {
    for (let m = a; m <= b; m += every) {
      const sx = Math.round((m - cam.x) * PPM());
      if (sx < -20 || sx > G.W + 20) continue;
      G.rect(ctx, sx, y + Math.round(cam.y * PPM()), 1, 8, '#f8f8f8');
      G.text(ctx, String(m), sx + 3, y + Math.round(cam.y * PPM()), '#f8f8f8');
    }
  }

  // ---------- base ----------
  class Ev {
    constructor(game, round, def) {
      this.game = game; this.round = round; this.def = def;
      this.qual = G.qualFor(def, round);
      this.t = 0; this.done = false; this.result = null;
      this.cam = { x: 0, y: 0 };
      this.col = G.athleteColors(game.country, game.skin);
      this.msg = null; this.parts = []; this.cheer = false;
    }
    say(text, color, dur, sub) { this.msg = { text, color: color || '#f8f8f8', t: dur || 1.5, sub }; }
    tick(dt) { this.t += dt; if (this.msg) this.msg.t -= dt; stepParticles(this.parts, dt); }
    finish(value) {
      this.result = { value };
      this.done = true;
    }
  }

  // ---------- 100 m dash and 110 m hurdles ----------
  class Sprint extends Ev {
    constructor(game, round, def, hurdles) {
      super(game, round, def);
      this.hurdles = hurdles;
      this.dist = hurdles ? 110 : 100;
      this.p = new Runner(hurdles ? 11 : G.VMAX);
      this.state = 'marks'; this.st = 0; this.fs = 0;
      this.setDur = 1.0 + Math.random() * 1.2;
      this.elapsed = 0; this.finalTime = null;
      this.air = null; // {t, dur}
      this.hs = [];
      if (hurdles) for (let i = 0; i < 10; i++) this.hs.push({ x: 13.72 + i * 9.14, down: false, cpuDown: false });
      // Rival runs a smooth profile that finishes just inside the qualifying time.
      this.cpuT = this.qual - 0.25 - Math.random() * 0.2;
      this.tau = 1.0;
      this.cpuV = this.dist / (this.cpuT - this.tau * (1 - Math.exp(-this.cpuT / this.tau)));
      this.cpuX = 0; this.cpuPhase = 0; this.cpuDone = false;
      this.colCpu = G.athleteColors(game.cpuCountry, (game.skin + 1) % 3);
    }
    update(dt, inp) {
      this.tick(dt);
      this.st += dt;
      const p = this.p;
      if (this.state === 'marks') {
        if (this.st > 1.4) { this.state = 'set'; this.st = 0; sfx().beep(); }
      } else if (this.state === 'set') {
        if (inp.runs.length || inp.press) return this.falseStart();
        if (this.st > this.setDur) { this.state = 'run'; this.st = 0; sfx().gun(); G.audio.cheer(); this.cheer = true; }
      } else if (this.state === 'run' || this.state === 'finish') {
        this.elapsed += dt;
        if (this.state === 'run') {
          for (const s of inp.runs) p.press(s);
          if (this.hurdles && inp.press && !this.air) { this.air = { t: 0, dur: 0.42 }; sfx().jump(); }
        }
        const prevX = p.x;
        p.update(dt, this.state === 'finish' ? 1.6 : G.RUN_DRAG);
        if (p.stepped && !this.air) sfx().step();
        if (this.air) {
          this.air.t += dt;
          for (const h of this.hs) if (!h.down && prevX < h.x && p.x >= h.x) {
            const u = this.air.t / this.air.dur, ht = 4 * u * (1 - u);
            if (ht < 0.5) this.knock(h);
          }
          if (this.air.t >= this.air.dur) { this.air = null; sfx().step(); }
        } else {
          for (const h of this.hs) if (!h.down && prevX < h.x && p.x >= h.x) this.knock(h);
        }
        // rival
        const ct = this.elapsed;
        const cx = this.cpuV * (ct - this.tau * (1 - Math.exp(-ct / this.tau)));
        this.cpuPhase += Math.max(0, cx - this.cpuX) / 2.3 * Math.PI * 2;
        this.cpuX = this.cpuDone ? this.cpuX + Math.max(0, (cx - this.cpuX)) * 0.02 : cx;
        if (!this.cpuDone && this.cpuX >= this.dist) this.cpuDone = true;
        if (this.state === 'run' && p.x >= this.dist) {
          this.finalTime = Math.floor((this.elapsed - (p.x - this.dist) / Math.max(p.v, 0.1)) * 100) / 100;
          this.state = 'finish'; this.st = 0;
          const won = this.finalTime <= this.cpuT;
          this.say(this.finalTime.toFixed(2), '#f8d038', 3, won ? 'YOU BEAT ' + this.game.cpuCountry + '!' : '');
          G.audio.cheer();
        }
        if (this.state === 'run' && this.elapsed > 30) { this.say('TIME UP', '#f04040', 3); this.state = 'finish'; this.st = 0; sfx().whistle(); }
        if (this.state === 'finish' && this.st > 2.5) this.finish(this.finalTime);
      } else if (this.state === 'dq') {
        if (this.st > 2.5) this.finish(null);
      }
    }
    knock(h) { h.down = true; this.p.v *= 0.55; sfx().knock(); }
    falseStart() {
      this.fs++;
      sfx().foul();
      if (this.fs >= 2) { this.state = 'dq'; this.st = 0; this.say('DISQUALIFIED', '#f04040', 3, 'TWO FALSE STARTS'); return; }
      this.say('FALSE START', '#f04040', 1.6, 'ONE MORE AND YOU ARE OUT');
      this.state = 'marks'; this.st = -0.6; this.setDur = 1.0 + Math.random() * 1.2;
    }
    draw(ctx) {
      const p = this.p;
      this.cam.x = Math.max(-4, p.x - 5.5); this.cam.y = 0;
      const cam = this.cam;
      G.stadium(ctx, cam.x, 0, this.cheer, this.t);
      G.track(ctx, cam.x, 0);
      distanceMarks(ctx, cam, 10, this.dist - 10, 10, 140);
      // start and finish lines
      for (const [lx, chk] of [[0, false], [this.dist, true]]) {
        const sx = Math.round((lx - cam.x) * PPM());
        if (sx > -4 && sx < G.W + 4) {
          if (chk) for (let y = 150; y < 200; y += 2) { G.rect(ctx, sx, y, 2, 1, (y / 2) % 2 ? '#000' : '#fff'); G.rect(ctx, sx + 2, y, 2, 1, (y / 2) % 2 ? '#fff' : '#000'); }
          else G.rect(ctx, sx, 150, 2, 50, '#f8f8f8');
        }
      }
      if (this.dist === 100 || this.dist === 110) {
        const fx = Math.round((this.dist - cam.x) * PPM());
        if (fx > -20 && fx < G.W + 20) { G.rect(ctx, fx - 1, 120, 2, 30, '#c0c0c0'); G.rect(ctx, fx - 17, 120, 34, 10, '#202020'); G.text(ctx, 'GOAL', fx, 121, '#f8d038', { align: 'center' }); }
      }
      const drawHurdle = (h, gy, down) => {
        const sx = Math.round((h.x - cam.x) * PPM());
        if (sx < -10 || sx > G.W + 10) return;
        if (down) { G.rect(ctx, sx - 6, gy - 2, 12, 2, '#f8f8f8'); G.rect(ctx, sx - 2, gy - 2, 4, 2, '#202020'); return; }
        G.rect(ctx, sx + 1, gy - 15, 1, 15, '#a0a0a0'); G.rect(ctx, sx - 3, gy - 1, 8, 2, '#606060');
        G.rect(ctx, sx - 2, gy - 16, 6, 4, '#f8f8f8'); G.rect(ctx, sx - 2, gy - 14, 6, 1, '#202020');
      };
      for (const h of this.hs) drawHurdle(h, G.CPU_GROUND, false);
      // rival
      {
        const sx = Math.round((this.cpuX - cam.x) * PPM());
        let lift = 0, pose;
        if (this.state === 'marks' || (this.state === 'set' && false)) pose = G.poses.crouch();
        else if (this.state === 'set') pose = G.poses.set();
        else pose = G.poses.run(this.cpuPhase, clamp(this.elapsed * 2, 0, 1));
        if (this.hurdles && this.elapsed > 0) for (const h of this.hs) {
          const d = this.cpuX - (h.x - 1.9);
          if (d > 0 && d < 3.8) { const u = d / 3.8; lift = 4 * u * (1 - u) * 0.6; pose = G.poses.hurdle(); }
        }
        if (this.cpuDone && this.cpuX > this.dist + 4) pose = G.poses.stand();
        if (sx > -20 && sx < G.W + 20) G.athlete(ctx, sx, G.CPU_GROUND - 14 - lift * PPM(), pose, this.colCpu);
      }
      for (const h of this.hs) drawHurdle(h, G.GROUND, h.down);
      // player
      {
        const sx = Math.round((p.x - cam.x) * PPM());
        let pose, lift = 0;
        if (this.state === 'marks' || this.state === 'dq') pose = G.poses.crouch();
        else if (this.state === 'set') pose = G.poses.set();
        else if (this.air) { const u = this.air.t / this.air.dur; lift = 4 * u * (1 - u) * 0.6; pose = G.poses.hurdle(); }
        else if (this.state === 'finish' && p.v < 0.5) pose = this.finalTime !== null && this.finalTime <= this.qual ? G.poses.wave(this.t) : G.poses.stand();
        else pose = p.pose();
        G.athlete(ctx, sx, G.GROUND - 14 - lift * PPM(), pose, this.col);
      }
      if (this.state === 'marks' && this.st > 0) bigMsg(ctx, { text: 'ON YOUR MARKS', color: '#f8f8f8', t: 1 });
      else if (this.state === 'set') bigMsg(ctx, { text: 'SET', color: '#f8d038', t: 1 });
      else if (this.state === 'run' && this.st < 0.8) bigMsg(ctx, { text: 'GO!', color: '#40f040', t: 1 });
      bigMsg(ctx, this.msg);
      const shown = this.finalTime !== null ? this.finalTime : this.elapsed;
      hud(ctx, this, { l1: 'TIME ' + shown.toFixed(2), r1: 'QUAL ' + this.qual.toFixed(2), speed: p.v, r2: this.hurdles ? 'HIT ' + this.hs.filter(h => h.down).length : 'vs ' + this.game.cpuCountry });
    }
  }

  // ---------- field event base: three attempts ----------
  class Field extends Ev {
    constructor(game, round, def) {
      super(game, round, def);
      this.attempts = []; this.best = null;
      this.angle = 0;
      this.startAttempt();
    }
    startAttempt() {
      this.state = 'ready'; this.st = 0; this.angle = 0;
      this.p = new Runner(this.vmax || G.VMAX);
      this.p.x = this.startX;
      this.say('ATTEMPT ' + (this.attempts.length + 1), '#f8f8f8', 1.2);
    }
    record(v) {
      this.attempts.push(v);
      if (v !== null && G.isBetter(this.def, v, this.best)) this.best = v;
      this.state = 'show'; this.st = 0;
      if (v === null) { sfx().foul(); }
      else { G.audio.cheer(); this.cheer = true; }
    }
    afterShow() {
      this.cheer = false;
      if (this.attempts.length >= 3) this.finish(this.best);
      else this.startAttempt();
    }
    // Hold ACTION to raise the angle; releasing (or reaching 80*) fixes it.
    angleStep(dt, inp) {
      const before = Math.floor(this.angle / 5);
      this.angle = Math.min(80, this.angle + 70 * dt);
      if (Math.floor(this.angle / 5) !== before) sfx().angle(this.angle);
      return inp.release || !inp.held || this.angle >= 80;
    }
    hudField(ctx, extra) {
      hud(ctx, this, Object.assign({
        l1: attemptsText(this.attempts), r1: 'QUAL ' + this.qual.toFixed(2) + 'M',
        speed: this.p.v, angle: this.angle, angleHot: this.angle >= 40 && this.angle <= 50,
      }, extra || {}));
    }
  }

  // ---------- long jump ----------
  class LongJump extends Field {
    constructor(game, round, def) { super(game, round, def); }
    get startX() { return -38; }
    update(dt, inp) {
      this.tick(dt); this.st += dt;
      const p = this.p;
      switch (this.state) {
        case 'ready':
        case 'run':
          for (const s of inp.runs) { p.press(s); this.state = 'run'; }
          if (this.state === 'run' && inp.press) {
            this.x0 = p.x; this.v0 = p.v; this.foul = p.x > 0;
            this.state = 'angle'; this.st = 0; this.angle = 0; sfx().jump();
            break;
          }
          p.update(dt);
          if (p.stepped) sfx().step();
          if (p.x > 0.6) { this.foul = true; this.x0 = p.x; this.say('FOUL', '#f04040', 2, 'NO TAKE-OFF'); this.record(null); }
          break;
        case 'angle':
          if (this.angleStep(dt, inp)) {
            const k = Math.sqrt(0.65), a = this.angle * DEG;
            this.fl = { x: this.x0, y: 0, vx: this.v0 * k * Math.cos(a), vy: this.v0 * k * Math.sin(a), t: 0 };
            this.fl.T = Math.max(0.2, 2 * this.fl.vy / GRAV);
            this.state = 'flight'; this.st = 0;
          }
          break;
        case 'flight': {
          const f = this.fl;
          f.t += dt; f.x += f.vx * dt; f.vy -= GRAV * dt; f.y += f.vy * dt;
          if (f.y <= 0 && f.t > 0.05) {
            f.y = 0; sfx().land(); burst(this.parts, f.x, 0, 14, '#f0d890', 3);
            const d = Math.floor(f.x * 100) / 100;
            if (this.foul) { this.say('FOUL', '#f04040', 2.2, 'OVER THE BOARD'); this.record(null); }
            else if (d <= 0) { this.say('NO JUMP', '#f04040', 2.2); this.record(null); }
            else { this.say(d.toFixed(2) + 'M', d >= this.qual ? '#40f040' : '#f8d038', 2.2, d >= this.qual ? 'QUALIFIED!' : ''); this.record(d); }
            this.state = 'show'; this.landX = f.x;
          }
          break;
        }
        case 'show':
          p.update(dt, 4);
          if (this.st > 2.4) this.afterShow();
          break;
      }
    }
    draw(ctx) {
      const p = this.p, cam = this.cam;
      let fx = p.x;
      if (this.fl && (this.state === 'flight' || this.state === 'show')) fx = this.fl.x;
      if (this.state === 'show' && this.landX === undefined) fx = p.x;
      cam.x = clamp(fx - 6, this.startX - 4, 6); cam.y = 0;
      G.stadium(ctx, cam.x, 0, this.cheer, this.t);
      G.track(ctx, cam.x, 0, -60, 0.2);
      // sand pit
      const px0 = Math.round((1 - cam.x) * PPM()), px1 = Math.round((11 - cam.x) * PPM());
      G.rect(ctx, px0, 176, px1 - px0, 20, '#e8cc80');
      G.rect(ctx, px0, 176, px1 - px0, 1, '#c0a060');
      for (let i = 0; i < 40; i++) G.rect(ctx, px0 + ((i * 37) % (px1 - px0)), 178 + (i * 7) % 16, 1, 1, '#c8ac60');
      // take-off board
      const bx = Math.round((0 - cam.x) * PPM());
      G.rect(ctx, bx - 3, 188, 4, 4, '#f8f8f8'); G.rect(ctx, bx + 1, 188, 2, 4, '#606060');
      distanceMarks(ctx, cam, 3, 10, 1, 166);
      for (let m = 3; m <= 10; m++) { const sx = Math.round((m - cam.x) * PPM()); G.rect(ctx, sx, 196, 1, 3, '#f8f8f8'); }
      // athlete
      let hip, pose;
      if (this.state === 'ready') { pose = G.poses.stand(); hip = [p.x, 0]; }
      else if (this.state === 'run') { pose = p.pose(); hip = [p.x, 0]; }
      else if (this.state === 'angle') { pose = G.poses.gather(); hip = [this.x0, 0]; }
      else if (this.state === 'flight') { const f = this.fl; pose = G.poses.flight(clamp(f.t / f.T, 0, 1)); hip = [f.x, f.y]; }
      else if (this.attempts[this.attempts.length - 1] === null && !this.fl) { pose = G.poses.stand(); hip = [p.x, 0]; }
      else if (this.fl) { pose = G.poses.sit(); hip = [this.fl.x, 0]; }
      else { pose = G.poses.stand(); hip = [p.x, 0]; }
      const [sx, sy] = G.toScreen(hip[0], hip[1], cam.x, 0);
      G.athlete(ctx, sx, sy - 14, pose, this.col);
      if (this.state === 'show' && this.fl && this.landX !== undefined) {
        const mx = Math.round((this.landX - cam.x) * PPM());
        G.rect(ctx, mx, 178, 1, 18, '#d02020');
      }
      particles(ctx, this.parts, cam);
      if (this.state === 'angle') this.angleArrow(ctx, sx, sy - 10);
      bigMsg(ctx, this.msg);
      this.hudField(ctx);
    }
    angleArrow(ctx, sx, sy) {
      const a = this.angle * DEG;
      G.line(ctx, sx, sy, sx + Math.cos(a) * 22, sy - Math.sin(a) * 22, this.angle >= 40 && this.angle <= 50 ? '#40f040' : '#f8d038', 1);
    }
    startAttempt() { this.fl = null; this.landX = undefined; super.startAttempt(); }
  }

  // ---------- javelin ----------
  class Javelin extends Field {
    get startX() { return -26; }
    startAttempt() { this.jv = null; super.startAttempt(); }
    update(dt, inp) {
      this.tick(dt); this.st += dt;
      const p = this.p;
      switch (this.state) {
        case 'ready':
        case 'run':
          for (const s of inp.runs) { p.press(s); this.state = 'run'; }
          if (this.state === 'run' && inp.press) {
            this.x0 = p.x; this.v0 = p.v; this.foul = p.x > 0;
            this.state = 'angle'; this.st = 0; this.angle = 0;
            break;
          }
          p.update(dt);
          if (p.stepped) sfx().step();
          if (p.x > 0.5) { this.say('FOUL', '#f04040', 2, 'OVER THE LINE'); this.record(null); }
          break;
        case 'angle':
          if (this.angleStep(dt, inp)) {
            const a = this.angle * DEG, v = 7 + 1.85 * this.v0;
            this.jv = { x: this.x0 + 0.3, y: 2.0, vx: v * Math.cos(a), vy: v * Math.sin(a), t: 0, stuck: false };
            this.state = 'flight'; this.st = 0; sfx().throw();
          }
          break;
        case 'flight': {
          const j = this.jv;
          j.t += dt; j.x += j.vx * dt; j.vy -= GRAV * dt; j.y += j.vy * dt;
          if (j.y <= 0) {
            j.y = 0; j.stuck = true; sfx().thud(); burst(this.parts, j.x, 0, 8, '#806040', 2);
            const d = Math.floor(j.x * 100) / 100;
            if (this.foul) { this.say('FOUL', '#f04040', 2.2, 'OVER THE LINE'); this.record(null); }
            else if (d <= 0) { this.say('FOUL', '#f04040', 2.2); this.record(null); }
            else { this.say(d.toFixed(2) + 'M', d >= this.qual ? '#40f040' : '#f8d038', 2.2, d >= this.qual ? 'QUALIFIED!' : ''); this.record(d); }
            this.state = 'show';
          }
          break;
        }
        case 'show':
          if (this.st > 2.6) this.afterShow();
          break;
      }
    }
    draw(ctx) {
      const p = this.p, cam = this.cam, j = this.jv;
      if (j) { cam.x = Math.max(this.x0 - 6, j.x - 11); cam.y = Math.max(0, j.y - 7); }
      else { cam.x = clamp(p.x - 6, this.startX - 4, 2); cam.y = 0; }
      G.stadium(ctx, cam.x, cam.y, this.cheer, this.t);
      const oy = Math.round(cam.y * PPM());
      G.track(ctx, cam.x, cam.y, -60, 0);
      // foul line and sector lines
      const lx = Math.round((0 - cam.x) * PPM());
      G.rect(ctx, lx, 150 + oy, 2, 50, '#f8f8f8');
      for (let m = 10; m <= 110; m += 10) {
        const sx = Math.round((m - cam.x) * PPM());
        if (sx < -20 || sx > G.W + 20) continue;
        G.rect(ctx, sx, 160 + oy, 1, 36, '#d8f0d8');
        G.text(ctx, String(m), sx + 3, 162 + oy, '#f8f8f8');
      }
      if (this.qual) {
        const qx = Math.round((this.qual - cam.x) * PPM());
        G.rect(ctx, qx, 150 + oy, 1, 50, '#f8d038');
        G.text(ctx, 'Q', qx + 2, 188 + oy, '#f8d038');
      }
      // athlete
      let pose, hx = p.x;
      if (this.state === 'ready') pose = G.poses.stand();
      else if (this.state === 'run') pose = Object.assign(p.pose(), { uaB: 2.9, faB: 0.4 });
      else if (this.state === 'angle') { pose = G.poses.throwBack(this.angle / 80); hx = this.x0; }
      else { pose = G.poses.throwFwd(); hx = this.x0 === undefined ? p.x : this.x0; }
      const [sx, sy] = G.toScreen(hx, 0, cam.x, cam.y);
      const r = G.athlete(ctx, sx, sy - 14, pose, this.col);
      // javelin
      const jl = 2.6 * PPM() / 2;
      if (!j) {
        const a = this.state === 'angle' ? this.angle * DEG : 0.1;
        const cx = r.hand[0], cy = r.hand[1];
        G.line(ctx, cx - Math.cos(a) * jl * 0.6, cy + Math.sin(a) * jl * 0.6, cx + Math.cos(a) * jl * 1.4, cy - Math.sin(a) * jl * 1.4, '#f0f0f0', 1);
        if (this.state === 'angle') this.angleArrow(ctx, sx, sy - 22);
      } else {
        const a = Math.atan2(j.vy, j.vx);
        const [jx, jy] = G.toScreen(j.x, j.y, cam.x, cam.y);
        const ca = j.stuck ? Math.cos(this.stuckA) : Math.cos(a), sa = j.stuck ? Math.sin(this.stuckA) : Math.sin(a);
        if (!j.stuck) this.stuckA = a;
        G.line(ctx, jx - ca * jl * 2, jy + sa * jl * 2, jx, jy, '#f0f0f0', 1);
        G.rect(ctx, jx - ca * jl, jy + sa * jl - 1, 2, 2, '#d02020');
      }
      particles(ctx, this.parts, cam);
      bigMsg(ctx, this.msg);
      this.hudField(ctx, j && !j.stuck ? { r2: Math.max(0, j.x).toFixed(1) + 'M' } : {});
    }
    angleArrow(ctx, sx, sy) { LongJump.prototype.angleArrow.call(this, ctx, sx, sy); }
  }

  // ---------- hammer ----------
  const SECTOR = 0.87; // half-width of the legal release window, radians
  class Hammer extends Field {
    get startX() { return 0; }
    startAttempt() { this.spin = 0.12; this.phi = Math.PI; this.ball = null; this.turns = 0; super.startAttempt(); this.p.x = 0; }
    update(dt, inp) {
      this.tick(dt); this.st += dt;
      switch (this.state) {
        case 'ready':
          if (inp.runs.length || inp.press) { this.state = 'spin'; this.st = 0; this.last = ''; }
          break;
        case 'spin':
        case 'angle': {
          // the spin builds up by itself, as in the arcade original; tapping RUN speeds it up a little
          for (const s of inp.runs) { this.spin = Math.min(1, this.spin + (s !== this.last ? 0.015 : 0.004)); this.last = s; }
          this.spin = Math.min(1, this.spin + 0.11 * dt);
          const w = Math.PI * 2 * (0.5 + 0.9 * this.spin);
          const before = Math.floor(this.phi / Math.PI);
          this.phi += w * dt; this.turns = (this.phi - Math.PI) / (Math.PI * 2);
          if (Math.floor(this.phi / Math.PI) !== before) sfx().swish(this.spin);
          if (this.turns > 12) { this.say('FOUL', '#f04040', 2.2, 'TOO MANY TURNS'); this.record(null); this.ball = null; break; }
          if (this.state === 'spin' && inp.press) { this.state = 'angle'; this.angle = 0; }
          else if (this.state === 'angle' && this.angleStep(dt, inp)) this.release();
          break;
        }
        case 'flight': {
          const b = this.ball;
          b.t += dt; b.x += b.vx * dt; b.vy -= GRAV * dt; b.y += b.vy * dt;
          if (b.cage && b.x < -2.2) { b.x = -2.2; b.vx = 0; }
          if (b.y <= 0) {
            b.y = 0; b.landed = true; sfx().thud(); burst(this.parts, b.x, 0, 12, '#806040', 3);
            const d = Math.floor((b.x - 1.07) * 100) / 100;
            if (b.cage || d <= 0) { this.say('FOUL', '#f04040', 2.2, 'OUT OF THE SECTOR'); this.record(null); }
            else { this.say(d.toFixed(2) + 'M', d >= this.qual ? '#40f040' : '#f8d038', 2.2, d >= this.qual ? 'QUALIFIED!' : ''); this.record(d); }
            this.state = 'show';
          }
          break;
        }
        case 'show':
          if (this.st > 2.6) this.afterShow();
          break;
      }
    }
    // Direction offset of the hammer from straight down the field, in -PI..PI.
    offset() { let d = this.phi % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; return d; }
    release() {
      const d = this.offset(), a = this.angle * DEG, v = 12 + 17 * this.spin;
      const ok = Math.abs(d) <= SECTOR;
      const f = ok ? 1 - 0.25 * Math.pow(d / SECTOR, 2) : -0.3;
      this.ball = { x: 1.07 + Math.cos(d) * 0.4, y: 1.4, vx: v * Math.cos(a) * f, vy: v * Math.sin(a) * (ok ? 1 : 0.4), t: 0, cage: !ok };
      this.state = 'flight'; this.st = 0; sfx().throw();
      if (!ok) sfx().knock();
    }
    draw(ctx) {
      const cam = this.cam, b = this.ball;
      if (b) { cam.x = Math.max(-6, b.x - 11); cam.y = Math.max(0, b.y - 7); } else { cam.x = -6; cam.y = 0; }
      G.stadium(ctx, cam.x, cam.y, this.cheer, this.t);
      const oy = Math.round(cam.y * PPM());
      for (let m = 10; m <= 100; m += 10) {
        const sx = Math.round((m + 1.07 - cam.x) * PPM());
        if (sx < -20 || sx > G.W + 20) continue;
        G.rect(ctx, sx, 160 + oy, 1, 36, '#d8f0d8');
        G.text(ctx, String(m), sx + 3, 162 + oy, '#f8f8f8');
      }
      const qx = Math.round((this.qual + 1.07 - cam.x) * PPM());
      G.rect(ctx, qx, 150 + oy, 1, 50, '#f8d038'); G.text(ctx, 'Q', qx + 2, 188 + oy, '#f8d038');
      // throwing circle and cage (back half drawn first)
      const [cx, cy] = G.toScreen(0, 0, cam.x, cam.y);
      G.rect(ctx, cx - 15, cy - 1, 31, 3, '#a0a0a0'); G.rect(ctx, cx - 14, cy, 29, 1, '#d0d0d0');
      const cage = (front) => {
        const xs = front ? [-1.4, 0.6] : [-2.4, -1.9, -0.6, 0.2];
        for (const x of xs) { const sx = Math.round((x - cam.x) * PPM()); G.rect(ctx, sx, cy - 70, 1, 70, '#404040'); }
        if (!front) for (let y = 0; y < 70; y += 6) G.rect(ctx, Math.round((-2.4 - cam.x) * PPM()), cy - 70 + y, Math.round(3.0 * PPM()), 1, '#50705080');
      };
      cage(false);
      // ball position while spinning: a circle seen from the side, nearer when sin(phi) > 0
      const spinning = this.state === 'spin' || this.state === 'angle' || this.state === 'ready';
      const R = 1.5;
      const ballPos = () => [Math.cos(this.phi) * R, 1.1 + Math.sin(this.phi) * 0.25 - Math.cos(this.phi) * 0.35];
      const facing = Math.cos(this.phi) < 0;
      const drawBall = () => {
        if (!spinning) return;
        const [bx, by] = ballPos();
        const [sx, sy] = G.toScreen(bx, by, cam.x, cam.y);
        const [hx, hy] = G.toScreen(0, 1.15, cam.x, cam.y);
        G.line(ctx, hx, hy, sx, sy, '#c0c0c0', 1);
        G.circle(ctx, sx, sy, 2, '#303030'); G.rect(ctx, sx - 1, sy - 1, 1, 1, '#a0a0a0');
      };
      if (Math.sin(this.phi) < 0) drawBall();
      let pose;
      if (this.state === 'ready') pose = G.poses.hammer(1.4);
      else if (spinning) pose = G.poses.hammer(1.5 + Math.abs(Math.cos(this.phi)) * 0.3);
      else pose = G.poses.throwFwd();
      G.athlete(ctx, cx, cy - 14, pose, this.col, 0, spinning ? facing : false);
      if (Math.sin(this.phi) >= 0) drawBall();
      cage(true);
      if (b) {
        const [sx, sy] = G.toScreen(b.x, b.y, cam.x, cam.y);
        G.circle(ctx, sx, sy, 2, '#303030');
        if (!b.landed) G.line(ctx, sx, sy, sx - Math.sign(b.vx || 1) * 8, sy + 3, '#c0c0c0', 1);
      }
      particles(ctx, this.parts, cam);
      bigMsg(ctx, this.msg);
      if (this.state === 'ready') G.text(ctx, 'PRESS RUN TO START SPINNING', G.W / 2, 60, '#f8f8f8', { align: 'center', shadow: '#000' });
      // live distance from the front of the circle while the hammer flies, as for the javelin
      const flying = b && !b.landed && !b.cage;
      hud(ctx, this, { l1: attemptsText(this.attempts), r1: 'QUAL ' + this.qual.toFixed(2) + 'M', speed: this.spin * G.VMAX, angle: this.angle, angleHot: this.angle >= 40 && this.angle <= 50,
        r2: flying ? Math.max(0, b.x - 1.07).toFixed(1) + 'M' : undefined });
      // direction dial: green when the hammer points down the sector
      const dx = 230, dy = 136, d = this.offset();
      const ok = Math.abs(d) <= SECTOR;
      G.circle(ctx, dx, dy - 1, 11, '#f8f8f8'); G.circle(ctx, dx, dy - 1, 10, '#202020');
      for (let a = -SECTOR; a <= SECTOR; a += 0.1) G.rect(ctx, dx + Math.cos(a) * 7, dy - 1 - Math.sin(a) * 7, 1, 1, '#40f040');
      if (spinning) G.line(ctx, dx, dy - 1, dx + Math.cos(d) * 8, dy - 1 - Math.sin(d) * 8, ok ? '#40f040' : '#f04040', 1);
      G.text(ctx, 'TURN ' + Math.max(0, Math.floor(this.turns)), G.W - 4, dy + 14, '#f8f8f8', { align: 'right', shadow: '#000' });
    }
  }

  // ---------- high jump ----------
  class HighJump extends Field {
    get startX() { return -13; }
    get vmax() { return G.VMAX; }
    constructor(game, round, def) {
      super(game, round, def);
      this.bar = Math.round((this.qual - 0.10) * 100) / 100;
      this.fails = 0; this.cleared = [];
      this.say('BAR ' + this.bar.toFixed(2) + 'M', '#f8f8f8', 1.6);
    }
    startAttempt() {
      this.fl = null; this.barDown = false;
      this.state = 'ready'; this.st = 0; this.angle = 0;
      this.p = new Runner(G.VMAX); this.p.x = this.startX;
      if (this.bar) this.say('BAR ' + this.bar.toFixed(2) + 'M', '#f8f8f8', 1.4, 'ATTEMPT ' + (this.fails + 1));
    }
    // forgiving speed curve: anything from about 7 to 10.5 m/s converts well into lift
    takeoffSpeed(v) { return v <= 6.5 ? v * 0.8 : v <= 9.5 ? 5.2 + (v - 6.5) * 0.15 : Math.max(2, 5.65 - (v - 9.5) * 0.5); }
    update(dt, inp) {
      this.tick(dt); this.st += dt;
      const p = this.p;
      switch (this.state) {
        case 'ready':
        case 'run':
          for (const s of inp.runs) { p.press(s); this.state = 'run'; }
          if (this.state === 'run' && inp.press && p.x <= -0.35) {
            this.x0 = p.x; this.v0 = p.v; this.state = 'angle'; this.st = 0; this.angle = 0; sfx().jump();
            break;
          }
          p.update(dt);
          if (p.stepped) sfx().step();
          if (p.x > -0.35) { p.v = 0; this.say('NO JUMP', '#f04040', 2, 'RAN INTO THE BAR'); this.barDown = true; this.attemptOver(false); }
          break;
        case 'angle':
          if (this.angleStep(dt, inp) || this.angle >= 80) {
            const e = this.takeoffSpeed(this.v0), a = this.angle * DEG;
            this.fl = { x: this.x0, y: 1.15, vx: e * Math.cos(a), vy: e * Math.sin(a), t: 0, rot: 0 };
            this.state = 'flight'; this.st = 0;
          }
          break;
        case 'flight': {
          const f = this.fl;
          f.t += dt; f.x += f.vx * dt; f.vy -= GRAV * dt; f.y += f.vy * dt;
          if (!this.barDown && Math.abs(f.x) < 0.12 && f.y - 0.06 < this.bar) { this.barDown = true; sfx().knock(); }
          const floor = f.x > 0.15 ? 0.75 : 0.5;
          if (f.y <= floor && f.vy < 0) {
            f.y = floor; sfx().land();
            this.attemptOver(!this.barDown && f.x > 0.15);
          }
          break;
        }
        case 'show':
          if (this.st > 2.4) this.afterShow();
          break;
      }
    }
    attemptOver(ok) {
      this.state = 'show'; this.st = 0;
      if (ok) {
        this.best = this.bar; this.cleared.push(this.bar); this.fails = 0;
        this.say('CLEARED!', '#40f040', 2.2, this.bar.toFixed(2) + 'M' + (this.bar >= this.qual - 1e-9 ? '  QUALIFIED!' : ''));
        G.audio.cheer(); this.cheer = true;
        this.bar = Math.round((this.bar + 0.05) * 100) / 100;
      } else {
        this.fails++;
        if (!this.msg || this.msg.t <= 0 || this.msg.text !== 'NO JUMP') this.say('FAILED', '#f04040', 2.2, 'ATTEMPT ' + this.fails + ' OF 3');
        sfx().foul();
      }
    }
    afterShow() {
      this.cheer = false;
      if (this.fails >= 3 || this.bar > 2.6) this.finish(this.best);
      else this.startAttempt();
    }
    draw(ctx) {
      const p = this.p, cam = this.cam;
      cam.x = clamp((this.fl ? this.fl.x : p.x) - 8, this.startX - 4, -9); cam.y = 0;
      G.stadium(ctx, cam.x, 0, this.cheer, this.t);
      G.track(ctx, cam.x, 0, -40, 6, '#c05030');
      // landing mat (back), uprights and bar
      const [mx, my] = G.toScreen(0.4, 0, cam.x, 0);
      G.rect(ctx, mx, my - 10, Math.round(3.2 * PPM()), 10, '#2050c0');
      G.rect(ctx, mx, my - 10, Math.round(3.2 * PPM()), 2, '#4070e0');
      const [bx] = G.toScreen(0, 0, cam.x, 0);
      const by = Math.round(G.GROUND - this.bar * PPM());
      G.rect(ctx, bx - 4, by - 12, 2, G.GROUND - by + 12, '#c0c0c0');
      if (!this.barDown || this.state === 'run' || this.state === 'ready') {
        for (let x = -4; x < 6; x += 2) G.rect(ctx, bx + x, by, 2, 1, (x / 2) % 2 ? '#f8f8f8' : '#d02020');
      } else G.rect(ctx, bx + 6, G.GROUND - 9, 12, 1, '#f8f8f8');
      // athlete
      let pose, hip, rot = 0;
      if (this.state === 'ready') { pose = G.poses.stand(); hip = [p.x, 0]; }
      else if (this.state === 'run' || (this.state === 'show' && !this.fl)) { pose = p.v > 0.3 ? p.pose() : G.poses.stand(); hip = [p.x, 0]; }
      else if (this.state === 'angle') { pose = G.poses.gather(); hip = [this.x0, 0]; }
      else {
        const f = this.fl; const u = clamp(f.t / 0.9, 0, 1);
        pose = G.poses.flop(u); rot = -Math.PI / 2 * clamp(f.t / 0.4, 0, 1) - u * 0.6;
        const [sx, sy] = G.toScreen(f.x, f.y, cam.x, 0);
        G.athlete(ctx, sx, sy, pose, this.col, rot, true);
        hip = null;
      }
      if (hip) { const [sx, sy] = G.toScreen(hip[0], hip[1], cam.x, 0); G.athlete(ctx, sx, sy - 14, pose, this.col); if (this.state === 'angle') LongJump.prototype.angleArrow.call(this, ctx, sx, sy - 10); }
      // front upright
      G.rect(ctx, bx + 4, by - 12, 2, G.GROUND - by + 12, '#e0e0e0');
      G.text(ctx, 'BAR ' + this.bar.toFixed(2) + 'M', G.W - 4, 20, '#f8f8f8', { align: 'right', shadow: '#000' });
      bigMsg(ctx, this.msg);
      const fails = 'X'.repeat(this.fails) + '-'.repeat(3 - this.fails);
      hud(ctx, this, { l1: 'BEST ' + (this.best ? this.best.toFixed(2) + 'M' : '--') + '  ' + fails, r1: 'QUAL ' + this.qual.toFixed(2) + 'M',
        speed: p.v, zone: [14, 21], angle: this.angle, angleHot: this.angle >= 65 && this.angle <= 78 });
    }
  }

  const MAKERS = {
    dash: (g, r, d) => new Sprint(g, r, d, false),
    long: (g, r, d) => new LongJump(g, r, d),
    jav: (g, r, d) => new Javelin(g, r, d),
    hurdles: (g, r, d) => new Sprint(g, r, d, true),
    hammer: (g, r, d) => new Hammer(g, r, d),
    high: (g, r, d) => new HighJump(g, r, d),
  };
  G.makeEvent = (def, game, round) => MAKERS[def.id](game, round, def);
})(window.G = window.G || {});
