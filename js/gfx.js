// Drawing helpers: pixel lines, the athlete figure, flags and the stadium backdrop.
(function (G) {
  const W = 256, H = 224;
  G.W = W; G.H = H;
  G.PPM = 14;          // pixels per metre
  G.GROUND = 190;      // screen y of the player's lane
  G.CPU_GROUND = 170;  // screen y of the rival's lane

  // ---------- primitives ----------
  G.rect = function (ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };

  G.line = function (ctx, x0, y0, x1, y1, c, th) {
    th = th || 1;
    ctx.fillStyle = c;
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, o = th > 1 ? (th >> 1) : 0;
    for (let i = 0; i < 400; i++) {
      ctx.fillRect(x0 - o, y0 - o, th, th);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };

  G.circle = function (ctx, cx, cy, r, c) {
    ctx.fillStyle = c;
    for (let y = -r; y <= r; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y + r * 0.8));
      ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
    }
  };

  G.box = function (ctx, x, y, w, h, c, fill) {
    if (fill) G.rect(ctx, x, y, w, h, fill);
    G.rect(ctx, x, y, w, 1, c); G.rect(ctx, x, y + h - 1, w, 1, c);
    G.rect(ctx, x, y, 1, h, c); G.rect(ctx, x + w - 1, y, 1, h, c);
  };

  // ---------- athlete ----------
  // Poses use angles in radians. Limbs hang at 0 and swing forward (to the right) with positive values.
  // t = thigh, k = knee bend (shin = thigh - k), ua = upper arm, fa = elbow bend (forearm = ua + fa).
  const L = { thigh: 7, shin: 7, torso: 9, ua: 5, fa: 5 };

  G.poses = {
    stand: () => ({ lean: 0.02, tA: 0.06, kA: 0.05, tB: -0.06, kB: 0.05, uaA: 0.12, faA: 0.3, uaB: -0.1, faB: 0.3 }),
    run(p, amt) {
      amt = amt === undefined ? 1 : amt;
      const leg = (q) => [0.8 * Math.sin(q) * amt, (0.25 + 1.5 * Math.max(0, Math.cos(q))) * amt + 0.05];
      const [tA, kA] = leg(p), [tB, kB] = leg(p + Math.PI);
      return { lean: 0.08 + 0.22 * amt, tA, kA, tB, kB,
        uaA: -0.9 * Math.sin(p) * amt, faA: 0.4 + 1.1 * amt, uaB: 0.9 * Math.sin(p) * amt, faB: 0.4 + 1.1 * amt,
        bob: Math.abs(Math.cos(p)) * amt };
    },
    crouch: () => ({ lean: 1.05, tA: 1.7, kA: 2.4, tB: 0.7, kB: 2.0, uaA: 1.05, faA: 0, uaB: 0.95, faB: 0, drop: 6 }),
    set: () => ({ lean: 1.15, tA: 1.6, kA: 1.7, tB: 0.6, kB: 1.4, uaA: 1.2, faA: 0, uaB: 1.1, faB: 0, drop: 4 }),
    gather: () => ({ lean: 0.25, tA: 1.2, kA: 1.5, tB: -0.25, kB: 0.6, uaA: 2.4, faA: 0.2, uaB: -0.9, faB: 0.6, drop: 1 }),
    flight: (u) => ({ lean: 0.1 - u * 0.3, tA: 1.0 + u * 0.6, kA: 1.2 - u * 0.9, tB: 0.4 + u * 1.2, kB: 1.5 - u * 1.1,
      uaA: 2.8 - u * 1.4, faA: 0.2, uaB: 2.4 - u * 1.2, faB: 0.2 }),
    sit: () => ({ lean: 0.55, tA: 1.55, kA: 0.15, tB: 1.45, kB: 0.25, uaA: 1.4, faA: 0.2, uaB: 1.3, faB: 0.2, drop: 9 }),
    hurdle: () => ({ lean: 0.55, tA: 1.55, kA: 0.05, tB: -0.9, kB: 1.55, uaA: 1.7, faA: 0.1, uaB: -0.6, faB: 1.0 }),
    throwBack: (a) => ({ lean: -0.25, tA: 0.55, kA: 0.1, tB: -0.45, kB: 0.4, uaA: 0.6, faA: 0.4, uaB: -1.9 + a * 0.3, faB: 0.1, drop: 1 }),
    throwFwd: () => ({ lean: 0.4, tA: 0.4, kA: 0.5, tB: -0.6, kB: 0.3, uaA: -0.3, faA: 0.3, uaB: 2.3, faB: 0.2 }),
    flop: (u) => ({ lean: 0, tA: 0.2 + u * 1.2, kA: 1.3 - u * 1.1, tB: 0.1 + u * 1.2, kB: 1.4 - u * 1.2, uaA: 0.5, faA: 0.2, uaB: 0.4, faB: 0.2 }),
    hammer: (ang) => ({ lean: -0.15, tA: 0.25, kA: 0.35, tB: -0.25, kB: 0.35, uaA: ang, faA: 0, uaB: ang, faB: 0, drop: 1 }),
    wave: (t) => ({ lean: 0, tA: 0.06, kA: 0.05, tB: -0.06, kB: 0.05, uaA: 2.9 + Math.sin(t * 10) * 0.25, faA: 0.1, uaB: 2.9 - Math.sin(t * 10) * 0.25, faB: 0.1 }),
    down: () => ({ lean: 1.3, tA: 1.6, kA: 1.4, tB: 1.5, kB: 1.6, uaA: 1.6, faA: 0.3, uaB: 1.4, faB: 0.3, drop: 8 }),
  };

  // Draws the athlete with the hip at (hx, hy) in screen space. rot rotates the whole figure (radians, clockwise).
  // Returns the screen position of the near hand so the caller can attach a javelin or hammer.
  G.athlete = function (ctx, hx, hy, pose, col, rot, flip) {
    rot = rot || 0;
    const f = flip ? -1 : 1;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const P = (x, y) => [hx + f * (x * cr - y * sr), hy + (x * sr + y * cr)];
    const down = (x, y, a, l) => [x + Math.sin(a) * l, y + Math.cos(a) * l];
    hy += (pose.drop || 0) + (pose.bob || 0);
    // local coords: hip at 0,0, y down, facing +x
    const neck = [Math.sin(pose.lean) * L.torso, -Math.cos(pose.lean) * L.torso];
    const sh = [neck[0] - Math.sin(pose.lean) * 1, neck[1] + Math.cos(pose.lean) * 1];
    const kneeA = down(0, 0, pose.tA, L.thigh), footA = down(kneeA[0], kneeA[1], pose.tA - pose.kA, L.shin);
    const kneeB = down(0, 0, pose.tB, L.thigh), footB = down(kneeB[0], kneeB[1], pose.tB - pose.kB, L.shin);
    const elA = down(sh[0], sh[1], pose.uaA, L.ua), haA = down(elA[0], elA[1], pose.uaA + pose.faA, L.fa);
    const elB = down(sh[0], sh[1], pose.uaB, L.ua), haB = down(elB[0], elB[1], pose.uaB + pose.faB, L.fa);
    const S = (p) => P(p[0], p[1]);
    const ln = (a, b, c, th) => { const p = S(a), q = S(b); G.line(ctx, p[0], p[1], q[0], q[1], c, th); };
    const H0 = [0, 0];
    // far side (A) drawn darker
    ln(sh, elA, col.skinD, 2); ln(elA, haA, col.skinD, 2);
    ln(H0, kneeA, col.skinD, 2); ln(kneeA, footA, col.skinD, 2);
    { const p = S(footA); G.rect(ctx, p[0] - 1 + f, p[1] - 1, 3, 2, col.shoeD); }
    // torso and shorts
    ln(H0, neck, col.shirt, 4);
    ln(H0, [Math.sin(pose.lean) * 2, -Math.cos(pose.lean) * 2], col.shorts, 4);
    ln(H0, [Math.sin(pose.tB) * 3, Math.cos(pose.tB) * 3], col.shorts, 3);
    // head
    const hc = [neck[0] + Math.sin(pose.lean) * 3, neck[1] - Math.cos(pose.lean) * 3];
    const hp = S(hc);
    G.rect(ctx, hp[0] - 2, hp[1] - 2, 5, 5, col.skin);
    G.rect(ctx, hp[0] - 2, hp[1] - 3, 5, 2, col.hair);
    G.rect(ctx, hp[0] - 2 - f, hp[1] - 2, 1, 2, col.hair);
    G.rect(ctx, hp[0] + (f > 0 ? 2 : -2), hp[1] - 1, 1, 1, '#000');
    // near side (B)
    ln(H0, kneeB, col.skin, 2); ln(kneeB, footB, col.skin, 2);
    { const p = S(footB); G.rect(ctx, p[0] - 1 + f, p[1] - 1, 3, 2, col.shoe); }
    ln(sh, elB, col.skin, 2); ln(elB, haB, col.skin, 2);
    return { hand: S(haB), handFar: S(haA), shoulder: S(sh), head: hp };
  };

  // ---------- countries & flags ----------
  // c1 = singlet colour, c2 = shorts colour
  G.COUNTRIES = [
    { code: 'USA', name: 'UNITED STATES', c1: '#1840c0', c2: '#e8e8f0' },
    { code: 'JPN', name: 'JAPAN', c1: '#f0f0f0', c2: '#d01020' },
    { code: 'URS', name: 'SOVIET UNION', c1: '#d01020', c2: '#f0f0f0' },
    { code: 'FRG', name: 'WEST GERMANY', c1: '#f0f0f0', c2: '#202020' },
    { code: 'GBR', name: 'GREAT BRITAIN', c1: '#f0f0f0', c2: '#1830a0' },
    { code: 'FRA', name: 'FRANCE', c1: '#1840c0', c2: '#f0f0f0' },
    { code: 'ITA', name: 'ITALY', c1: '#2050d0', c2: '#f0f0f0' },
    { code: 'CAN', name: 'CANADA', c1: '#d01020', c2: '#f0f0f0' },
    { code: 'KEN', name: 'KENYA', c1: '#d01020', c2: '#108030' },
    { code: 'CHN', name: 'CHINA', c1: '#d01020', c2: '#f0d000' },
    { code: 'AUS', name: 'AUSTRALIA', c1: '#f0c000', c2: '#108030' },
    { code: 'SWE', name: 'SWEDEN', c1: '#f0d000', c2: '#2050c0' },
    { code: 'BRA', name: 'BRAZIL', c1: '#f0d000', c2: '#2050c0' },
    { code: 'KOR', name: 'SOUTH KOREA', c1: '#f0f0f0', c2: '#2040a0' },
    { code: 'MEX', name: 'MEXICO', c1: '#108040', c2: '#f0f0f0' },
    { code: 'JAM', name: 'JAMAICA', c1: '#108030', c2: '#f0c000' },
    { code: 'POL', name: 'POLAND', c1: '#f0f0f0', c2: '#d01020' },
    { code: 'FIN', name: 'FINLAND', c1: '#f0f0f0', c2: '#1840c0' },
    { code: 'THA', name: 'THAILAND', c1: '#2040a0', c2: '#d01020' },
    { code: 'VIE', name: 'VIETNAM', c1: '#d01020', c2: '#f0d000' },
    { code: 'GDR', name: 'EAST GERMANY', c1: '#2050c0', c2: '#f0f0f0' },
    { code: 'HUN', name: 'HUNGARY', c1: '#d01020', c2: '#f0f0f0' },
    { code: 'CUB', name: 'CUBA', c1: '#d01020', c2: '#2050c0' },
    { code: 'NED', name: 'NETHERLANDS', c1: '#f08020', c2: '#f0f0f0' },
  ].sort((a, b) => a.name.localeCompare(b.name));
  G.country = (code) => G.COUNTRIES.find(c => c.code === code) || G.COUNTRIES[0];

  G.athleteColors = function (code, skinTone) {
    const c = G.country(code);
    const skins = [['#f0b888', '#c08860'], ['#d09060', '#a06840'], ['#8c5a38', '#603818']];
    const s = skins[skinTone || 0];
    return { skin: s[0], skinD: s[1], hair: '#281808', shirt: c.c1, shorts: c.c2, shoe: '#f8f8f8', shoeD: '#a0a0a0' };
  };

  G.flag = function (ctx, code, x, y, w, h) {
    x = Math.round(x); y = Math.round(y);
    const R = (a, b, c, d, col) => G.rect(ctx, x + a, y + b, c, d, col);
    const hs = (cols) => { const n = cols.length; cols.forEach((c, i) => R(0, Math.round(i * h / n), w, Math.round((i + 1) * h / n) - Math.round(i * h / n), c)); };
    const vs = (cols) => { const n = cols.length; cols.forEach((c, i) => R(Math.round(i * w / n), 0, Math.round((i + 1) * w / n) - Math.round(i * w / n), h, c)); };
    const nordic = (bg, cross, inner) => {
      R(0, 0, w, h, bg); const cx = Math.round(w * 0.32), cy = Math.round(h / 2);
      R(cx - 2, 0, 4, h, cross); R(0, cy - 2, w, 4, cross);
      if (inner) { R(cx - 1, 0, 2, h, inner); R(0, cy - 1, w, 2, inner); }
    };
    const star = (cx, cy, c) => { R(cx, cy - 1, 1, 3, c); R(cx - 1, cy, 3, 1, c); };
    const bigStar = (cx, cy, r, c) => {
      const pts = [];
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; pts.push([x + cx + Math.cos(a) * rr, y + cy + Math.sin(a) * rr]); }
      ctx.fillStyle = c; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill();
    };
    const ujack = (ox, oy, ww, hh) => {
      G.rect(ctx, x + ox, y + oy, ww, hh, '#1830a0');
      G.line(ctx, x + ox, y + oy, x + ox + ww - 1, y + oy + hh - 1, '#f0f0f0', 2);
      G.line(ctx, x + ox + ww - 1, y + oy, x + ox, y + oy + hh - 1, '#f0f0f0', 2);
      G.line(ctx, x + ox, y + oy, x + ox + ww - 1, y + oy + hh - 1, '#d01020', 1);
      G.line(ctx, x + ox + ww - 1, y + oy, x + ox, y + oy + hh - 1, '#d01020', 1);
      const cx = ox + Math.floor(ww / 2), cy = oy + Math.floor(hh / 2);
      R(cx - 2, oy, 4, hh, '#f0f0f0'); R(ox, cy - 2, ww, 4, '#f0f0f0');
      R(cx - 1, oy, 2, hh, '#d01020'); R(ox, cy - 1, ww, 2, '#d01020');
    };
    switch (code) {
      case 'USA': {
        for (let i = 0; i < 7; i++) R(0, Math.round(i * h / 7), w, Math.round((i + 1) * h / 7) - Math.round(i * h / 7), i % 2 ? '#f0f0f0' : '#d01020');
        const cw = Math.round(w * 0.42), ch = Math.round(h * 4 / 7);
        R(0, 0, cw, ch, '#2030a0');
        for (let yy = 1; yy < ch - 1; yy += 2) for (let xx = 1 + (yy % 4 === 1 ? 0 : 1); xx < cw - 1; xx += 2) R(xx, yy, 1, 1, '#f0f0f0');
        break;
      }
      case 'JPN': R(0, 0, w, h, '#f0f0f0'); G.circle(ctx, x + w / 2, y + h / 2, Math.round(h * 0.28), '#d01020'); break;
      case 'URS': R(0, 0, w, h, '#d01020'); star(3, 2, '#f0d000'); R(2, 5, 3, 1, '#f0d000'); break;
      case 'FRG': hs(['#202020', '#d01020', '#f0c000']); break;
      case 'GBR': ujack(0, 0, w, h); break;
      case 'FRA': vs(['#1840c0', '#f0f0f0', '#d01020']); break;
      case 'ITA': vs(['#108040', '#f0f0f0', '#d01020']); break;
      case 'CAN': vs(['#d01020', '#f0f0f0', '#f0f0f0', '#d01020']); G.rect(ctx, x + w / 2 - 2, y + h / 2 - 2, 4, 4, '#d01020'); G.rect(ctx, x + w / 2 - 1, y + h / 2 + 2, 2, 2, '#d01020'); break;
      case 'KEN': hs(['#202020', '#d01020', '#108030']); R(0, Math.round(h / 3) - 1, w, 1, '#f0f0f0'); R(0, Math.round(2 * h / 3), w, 1, '#f0f0f0');
        G.rect(ctx, x + w / 2 - 2, y + h / 2 - 4, 4, 8, '#d01020'); G.rect(ctx, x + w / 2 - 1, y + h / 2 - 4, 2, 8, '#202020'); break;
      case 'CHN': R(0, 0, w, h, '#d01020'); star(4, 3, '#f0d000'); R(7, 1, 1, 1, '#f0d000'); R(8, 3, 1, 1, '#f0d000'); R(8, 5, 1, 1, '#f0d000'); R(7, 7, 1, 1, '#f0d000'); break;
      case 'AUS': R(0, 0, w, h, '#1830a0'); ujack(0, 0, Math.round(w / 2), Math.round(h / 2)); star(Math.round(w * 0.25), Math.round(h * 0.75), '#f0f0f0'); star(Math.round(w * 0.75), Math.round(h * 0.3), '#f0f0f0'); star(Math.round(w * 0.82), Math.round(h * 0.7), '#f0f0f0'); break;
      case 'SWE': nordic('#2060c0', '#f0d000'); break;
      case 'FIN': nordic('#f0f0f0', '#1840c0'); break;
      case 'BRA': R(0, 0, w, h, '#108040');
        for (let i = 0; i < h - 2; i++) { const hw = Math.round((1 - Math.abs(i - (h - 2) / 2) / ((h - 2) / 2)) * (w / 2 - 2)); R(w / 2 - hw, i + 1, hw * 2, 1, '#f0d000'); }
        G.circle(ctx, x + w / 2, y + h / 2, Math.round(h * 0.22), '#2040a0'); break;
      case 'KOR': R(0, 0, w, h, '#f0f0f0'); G.circle(ctx, x + w / 2, y + h / 2, Math.round(h * 0.26), '#2040a0');
        G.rect(ctx, x + w / 2 - Math.round(h * 0.26), y + h / 2 - Math.round(h * 0.26), Math.round(h * 0.52) + 1, Math.round(h * 0.26), '#f0f0f0');
        { const r = Math.round(h * 0.26); ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, Math.round(h / 2)); ctx.clip(); G.circle(ctx, x + w / 2, y + h / 2, r, '#d01020'); ctx.restore(); }
        R(1, 1, 2, 1, '#202020'); R(w - 3, 1, 2, 1, '#202020'); R(1, h - 2, 2, 1, '#202020'); R(w - 3, h - 2, 2, 1, '#202020'); break;
      case 'MEX': vs(['#108040', '#f0f0f0', '#d01020']); G.rect(ctx, x + w / 2 - 1, y + h / 2 - 1, 2, 2, '#a06020'); break;
      case 'JAM': R(0, 0, w, h, '#108030');
        for (let yy = 0; yy < h; yy++) { const t = Math.abs(yy - (h - 1) / 2) / ((h - 1) / 2); const half = Math.round((1 - t) * w / 2 * 0.95); R(0, yy, half, 1, '#202020'); R(w - half, yy, half, 1, '#202020'); }
        G.line(ctx, x, y, x + w - 1, y + h - 1, '#f0c000', 2); G.line(ctx, x + w - 1, y, x, y + h - 1, '#f0c000', 2); break;
      case 'POL': hs(['#f0f0f0', '#d01020']); break;
      case 'THA': hs(['#d01020', '#f0f0f0', '#2040a0', '#2040a0', '#f0f0f0', '#d01020']); break;
      case 'VIE': R(0, 0, w, h, '#d01020'); bigStar(w / 2, h / 2, Math.max(2, Math.round(h * 0.3)), '#f0d000'); break;
      case 'GDR': hs(['#202020', '#d01020', '#f0c000']); G.circle(ctx, x + w / 2, y + h / 2, Math.max(1, Math.round(h * 0.18)), '#d8b030'); G.rect(ctx, x + w / 2, y + h / 2 - 1, 1, 2, '#202020'); break;
      case 'NED': hs(['#c01828', '#f0f0f0', '#2040a0']); break;
      case 'HUN': hs(['#d01020', '#f0f0f0', '#308040']); break;
      case 'CUB': hs(['#2040a0', '#f0f0f0', '#2040a0', '#f0f0f0', '#2040a0']);
        for (let yy = 0; yy < h; yy++) { const half = Math.round((1 - Math.abs(yy - (h - 1) / 2) / ((h - 1) / 2)) * w * 0.42); R(0, yy, half, 1, '#d01020'); }
        star(Math.round(w * 0.14), Math.round(h / 2), '#f0f0f0'); break;
      default: R(0, 0, w, h, '#808080');
    }
  };

  // ---------- stadium ----------
  let crowdTiles = null, boards = null;
  function makeCrowd() {
    const tiles = [];
    const pal = ['#f0e0c0', '#e0a070', '#c07040', '#804020', '#f04040', '#4060f0', '#f0f040', '#40c040', '#f0f0f0', '#f080c0'];
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const people = [];
    for (let row = 0; row < 8; row++) for (let i = 0; i < 64; i++)
      people.push({ x: i * 4 + (row % 2) * 2, y: 4 + row * 8, head: pal[(rnd() * 4) | 0], body: pal[4 + ((rnd() * 6) | 0)], jump: rnd() });
    for (let f = 0; f < 2; f++) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 68;
      const g = c.getContext('2d');
      for (let row = 0; row < 8; row++) { g.fillStyle = row % 2 ? '#3a2860' : '#302050'; g.fillRect(0, row * 8 + 2, 256, 8); }
      for (const p of people) {
        const up = f === 1 && p.jump > 0.5 ? -1 : 0;
        g.fillStyle = p.body; g.fillRect(p.x, p.y + 2 + up, 3, 3);
        g.fillStyle = p.head; g.fillRect(p.x + 1, p.y + up, 2, 2);
        if (f === 1 && p.jump > 0.75) { g.fillStyle = p.head; g.fillRect(p.x + (p.jump > 0.87 ? 3 : -1), p.y - 2 + up, 1, 2); }
      }
      tiles.push(c);
    }
    return tiles;
  }
  function makeBoards() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 12;
    const g = c.getContext('2d');
    const ads = [['#d01020', '#f0f0f0', 'TRACK'], ['#f0f0f0', '#1840c0', 'FIELD'], ['#1840c0', '#f0d000', '1983'], ['#f0d000', '#d01020', 'GO!'],
      ['#108040', '#f0f0f0', 'SPORT'], ['#202020', '#f0a000', 'CHIPS'], ['#f0f0f0', '#d01020', 'GOLD'], ['#d01020', '#f0d000', 'POWER']];
    ads.forEach((a, i) => {
      g.fillStyle = a[0]; g.fillRect(i * 64, 0, 63, 12);
      G.text(g, a[2], i * 64 + 32, 3, a[1], { align: 'center' });
    });
    return c;
  }

  // Draws sky, crowd, boards and infield grass for a camera at (camX, camY) in metres.
  G.stadium = function (ctx, camX, camY, cheering, time) {
    if (!crowdTiles) { crowdTiles = makeCrowd(); boards = makeBoards(); }
    const oy = Math.round(camY * G.PPM);
    // sky
    G.rect(ctx, 0, 16, W, H, '#5888f8');
    G.rect(ctx, 0, 16, W, Math.max(0, 22 + oy), '#4070e0');
    // clouds when looking up
    if (camY > 0.5) {
      for (let i = 0; i < 6; i++) {
        const cx = ((i * 97 - camX * G.PPM * 0.2) % 340 + 340) % 340 - 40, cy = 40 + (i * 53) % 90 - (oy * 0.3) % 120 + oy * 0.3 - 60;
        G.rect(ctx, cx, cy, 30, 6, '#f0f0f8'); G.rect(ctx, cx + 6, cy - 4, 16, 4, '#f0f0f8');
      }
    }
    const top = 38 + oy;
    if (top < H) {
      // stadium roof
      G.rect(ctx, 0, top - 4, W, 4, '#c0c0d0'); G.rect(ctx, 0, top - 1, W, 1, '#808090');
      const px = ((Math.round(camX * G.PPM * 0.5) % 256) + 256) % 256;
      const tile = crowdTiles[cheering && Math.floor(time * 8) % 2 ? 1 : 0];
      ctx.drawImage(tile, -px, top); ctx.drawImage(tile, 256 - px, top);
      const bx = ((Math.round(camX * G.PPM * 0.8) % 512) + 512) % 512;
      G.rect(ctx, 0, top + 66, W, 14, '#202020');
      ctx.drawImage(boards, -bx, top + 67); ctx.drawImage(boards, 512 - bx, top + 67);
      G.rect(ctx, 0, top + 80, W, H, '#30a040');
      // mown stripes on the infield
      const sx = ((Math.round(camX * G.PPM) % 32) + 32) % 32;
      for (let x = -sx; x < W; x += 32) G.rect(ctx, x, top + 80, 16, Math.max(0, H - top - 80), '#38b048');
    }
  };

  // Running track with two lanes and distance marks every 10 m. from/to limit the track to a range (metres).
  G.track = function (ctx, camX, camY, from, to, color) {
    const oy = Math.round(camY * G.PPM);
    const x0 = from === undefined ? 0 : Math.max(0, Math.round((from - camX) * G.PPM));
    const x1 = to === undefined ? W : Math.min(W, Math.round((to - camX) * G.PPM));
    if (x1 <= x0) return;
    const y0 = 150 + oy, y1 = 200 + oy;
    G.rect(ctx, x0, y0, x1 - x0, y1 - y0, color || '#c05030');
    G.rect(ctx, x0, y0, x1 - x0, 1, '#f0f0f0');
    G.rect(ctx, x0, G.CPU_GROUND + 6 + oy, x1 - x0, 1, '#f0f0f0');
    G.rect(ctx, x0, y1 - 1, x1 - x0, 1, '#f0f0f0');
  };

  // Sunny stadium backdrop for the menu screens: sun, clouds, flags on the roof, crowd, banners and
  // athletes jogging round the track. Panels drawn on top keep the text readable.
  G.daylight = function (ctx, t) {
    const camX = t * 1.2;
    G.stadium(ctx, camX, 0, true, t);
    G.rect(ctx, 0, 0, W, 16, '#5888f8');
    // sun and drifting clouds in the strip of sky above the roof
    G.circle(ctx, 228, 14, 9, '#ffe680'); G.circle(ctx, 228, 14, 7, '#fff8c8');
    for (let i = 0; i < 4; i++) {
      const cx = ((i * 83 + t * 4) % 320) - 40, cy = 4 + (i * 7) % 14;
      G.rect(ctx, cx, cy + 3, 26, 5, '#f8f8ff'); G.rect(ctx, cx + 5, cy, 14, 4, '#f8f8ff');
    }
    // flags flying along the stadium roof
    const off = ((Math.round(camX * G.PPM * 0.5) % 24) + 24) % 24;
    for (let i = -1; i < 12; i++) {
      const px = i * 24 - off + 12, code = G.COUNTRIES[((i + Math.floor(camX * G.PPM * 0.5 / 24)) % G.COUNTRIES.length + G.COUNTRIES.length) % G.COUNTRIES.length].code;
      G.rect(ctx, px, 21, 1, 14, '#e0e0e0');
      G.flag(ctx, code, px + 1, 21 + Math.round(Math.sin(t * 4 + i) * 0.6), 10, 7);
    }
    G.track(ctx, camX, 0);
    // athletes of different nations jogging past
    const runners = [['KEN', 0, 3.1, 0], ['JAM', 90, 2.6, 2], ['JPN', 180, 2.2, 0], ['GBR', 40, 1.8, 1]];
    runners.forEach(([code, o, spd, skin], i) => {
      const x = ((o + t * spd * G.PPM) % 300) - 22, gy = i % 2 ? G.CPU_GROUND : G.GROUND;
      G.athlete(ctx, x, gy - 14, G.poses.run(t * spd * 2.7 + i, 0.8), G.athleteColors(code, skin));
    });
  };

  // A stadium scoreboard panel: deep blue, slightly see-through, with a gold rim.
  G.panel = function (ctx, x, y, w, h) {
    G.rect(ctx, x, y, w, h, 'rgba(18,52,130,0.9)');
    G.box(ctx, x, y, w, h, '#f8d038');
    G.box(ctx, x + 1, y + 1, w - 2, h - 2, '#3050a0');
  };

  G.toScreen = function (x, y, camX, camY) {
    return [Math.round((x - camX) * G.PPM), Math.round(G.GROUND - (y - camY) * G.PPM)];
  };
})(window.G = window.G || {});
