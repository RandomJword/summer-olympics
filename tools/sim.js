// Headless check of the event physics: a scripted "player" mashes at a given rate
// and the script prints the results, which is how the qualifying marks were tuned.
// Usage: node tools/sim.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ctx = { window: {}, Math, console };
ctx.window.G = { audio: { sfx: new Proxy({}, { get: () => () => {} }), cheer() {}, crowd() {} } };
vm.createContext(ctx);
for (const f of ['gfx.js', 'events.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx);
const G = ctx.window.G;
const DT = 1 / 60;

// bot(ev, frame) returns {runs, press, release, held}
function run(id, bot, round = 1) {
  const def = G.EVENT_LIST.find(e => e.id === id);
  const ev = G.makeEvent(def, { country: 'USA', cpuCountry: 'JPN', skin: 0 }, round);
  let f = 0, held = false;
  while (!ev.done && f < 60 * 120) {
    const o = bot(ev, f);
    const inp = { runs: o.runs || [], press: !!o.press, release: !!o.release, held: o.held !== undefined ? o.held : held, keys: [] };
    if (o.press) held = true; if (o.release) held = false; inp.held = held;
    ev.update(DT, inp); f++;
  }
  return { value: ev.result && ev.result.value, qual: ev.qual, attempts: ev.attempts, pts: def.points(ev.result && ev.result.value) };
}

const masher = (pps) => { let acc = 0, side = 'L'; return () => { acc += pps * DT; const r = []; while (acc >= 1) { acc -= 1; side = side === 'L' ? 'R' : 'L'; r.push(side); } return r; }; };

function sprint(pps, hurdleLead) {
  const m = masher(pps);
  return (ev) => {
    if (ev.state !== 'run') return {};
    const o = { runs: m() };
    if (hurdleLead) { const h = ev.hs.find(h => h.x > ev.p.x); if (h && h.x - ev.p.x < hurdleLead && !ev.air) o.press = true; }
    return o;
  };
}
function field(pps, pressAt, targetAngle) {
  const m = masher(pps);
  return (ev) => {
    if (ev.state === 'ready' || ev.state === 'run') {
      const o = { runs: m() };
      if (ev.p.x >= pressAt) o.press = true;
      return o;
    }
    if (ev.state === 'angle') return ev.angle >= targetAngle ? { release: true } : {};
    return {};
  };
}
function hammer(pps, targetAngle) {
  const m = masher(pps);
  return (ev) => {
    if (ev.state === 'ready') return { press: true };
    if (ev.state === 'spin') {
      const o = { runs: m() };
      // start holding so the angle lands near target as the hammer comes round
      const w = Math.PI * 2 * (0.55 + 1.05 * ev.spin);
      const tHold = targetAngle / 70;
      let d = ev.offset(); const ahead = (-(d) + Math.PI * 2 * 10) % (Math.PI * 2);
      if (ev.turns > 4 && Math.abs(ahead - w * tHold) < w * DT * 1.01) o.press = true;
      return o;
    }
    if (ev.state === 'angle') return { runs: m(), release: ev.angle >= targetAngle };
    return {};
  };
}
function high(speed, pressAt, targetAngle) {
  // keep speed near a target by pressing only when below it
  let side = 'L';
  return (ev) => {
    if (ev.state === 'ready' || ev.state === 'run') {
      const o = { runs: [] };
      if (ev.p.v < speed && ev.t % 0.1 < DT) { side = side === 'L' ? 'R' : 'L'; o.runs.push(side); }
      if (ev.state === 'ready') o.runs.push('L');
      if (ev.p.x >= pressAt) o.press = true;
      return o;
    }
    if (ev.state === 'angle') return ev.angle >= targetAngle ? { release: true } : {};
    return {};
  };
}

for (const pps of [6, 7, 8, 9, 10, 12]) {
  console.log(`--- ${pps} presses/s`);
  console.log(' dash   ', JSON.stringify(run('dash', sprint(pps))));
  console.log(' hurdles', JSON.stringify(run('hurdles', sprint(pps, 2.6))));
  console.log(' long   ', JSON.stringify(run('long', field(pps, -0.15, 44))));
  console.log(' jav    ', JSON.stringify(run('jav', field(pps, -0.3, 44))));
  console.log(' hammer ', JSON.stringify(run('hammer', hammer(pps, 44))));
}
for (const sp of [6, 7, 7.5, 8, 9])
  for (const pa of [-1.0, -0.7, -0.5]) console.log(` high v=${sp} at ${pa}`, JSON.stringify(run('high', high(sp, pa, 72))));
