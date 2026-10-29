// Game flow: title, country select, event intro, events, score tally, game over, initials entry and leaderboard.
(function (G) {
  const TITLE = ['SUMMER', "OLYMPICS '83"];
  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // ---------- storage ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };
  const BOARD_KEY = 'sa83.board', BESTS_KEY = 'sa83.bests';
  const DEFAULT_BOARD = [
    ['ACE', 9000, 'USA'], ['KEN', 8000, 'JPN'], ['ZAP', 7000, 'URS'], ['MAX', 6000, 'FRG'], ['SUE', 5000, 'GBR'],
    ['LEE', 4000, 'KOR'], ['ANA', 3000, 'BRA'], ['OLA', 2500, 'SWE'], ['ROY', 2000, 'CAN'], ['DOT', 1500, 'ITA'],
  ].map(([n, s, c]) => ({ n, s, c, r: 1 }));
  let board = store.get(BOARD_KEY, null);
  if (!Array.isArray(board) || !board.length) board = DEFAULT_BOARD.slice();
  let bests = store.get(BESTS_KEY, {});
  const hiScore = () => Math.max(board[0] ? board[0].s : 0, game ? game.total : 0);

  // ---------- input ----------
  const RUN_L = ['KeyZ', 'ArrowLeft'], RUN_R = ['KeyC', 'ArrowRight'], ACT = ['KeyX', 'Space', 'ArrowUp', 'Enter'];
  const pending = { runs: [], press: false, release: false, keys: [] };
  let actionHeld = false;
  function onAction(down) {
    if (down && !actionHeld) pending.press = true;
    if (!down && actionHeld) pending.release = true;
    actionHeld = down;
  }
  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    G.audio.init();
    if (e.repeat) return;
    pending.keys.push(e);
    if (RUN_L.includes(e.code)) pending.runs.push('L');
    else if (RUN_R.includes(e.code)) pending.runs.push('R');
    else if (ACT.includes(e.code)) onAction(true);
  });
  window.addEventListener('keyup', (e) => { if (ACT.includes(e.code)) onAction(false); });
  window.addEventListener('blur', () => onAction(false));
  document.querySelectorAll('#touch button').forEach((b) => {
    const k = b.dataset.k;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); G.audio.init(); b.classList.add('on');
      if (k === 'A') onAction(true); else pending.runs.push(k);
      pending.keys.push({ code: 'Touch' + k, key: '' });
    });
    const up = (e) => { e.preventDefault(); b.classList.remove('on'); if (k === 'A') onAction(false); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
  });
  function takeInput() {
    const inp = { runs: pending.runs, press: pending.press, release: pending.release, held: actionHeld, keys: pending.keys };
    pending.runs = []; pending.press = false; pending.release = false; pending.keys = [];
    return inp;
  }
  const EMPTY = { runs: [], press: false, release: false, held: false, keys: [] };

  // ---------- state ----------
  let state = 'title', st = 0, time = 0;
  let game = null, ev = null, paused = false;
  let sel = 0, tally = null, entry = null, highlight = -1, introTimer = 0;

  function go(s) { state = s; st = 0; }

  function newGame(code) {
    const others = G.COUNTRIES.filter(c => c.code !== code);
    game = {
      country: code, cpuCountry: others[(Math.random() * others.length) | 0].code,
      skin: (Math.random() * 3) | 0, round: 1, idx: 0, total: 0, results: [],
    };
  }

  function startIntro() {
    go('intro');
    G.audio.crowd(0.2);
    G.audio.play('fanfare');
  }

  function startEvent() {
    const def = G.EVENT_LIST[game.idx];
    if (game.idx === 0 || game.idx === 3) { // a fresh rival for the track events
      const others = G.COUNTRIES.filter(c => c.code !== game.country);
      game.cpuCountry = others[(Math.random() * others.length) | 0].code;
    }
    ev = G.makeEvent(def, game, game.round);
    go('event');
    G.audio.play('event');
    G.audio.crowd(0.35);
  }

  function endEvent() {
    const def = ev.def, v = ev.result.value;
    const q = G.qualFor(def, game.round);
    const ok = G.isQualified(def, v, q);
    const p = def.points(v);
    const prev = bests[def.id];
    const record = v !== null && G.isBetter(def, v, prev === undefined ? null : prev);
    if (record) { bests[def.id] = v; store.set(BESTS_KEY, bests); }
    game.results.push({ round: game.round, def, value: v, pts: p, ok, record });
    tally = { from: game.total, shown: game.total, to: game.total + p, ok, record, lastTick: 0 };
    game.total += p;
    G.audio.play(ok ? (record ? 'record' : 'qualify') : 'fail');
    G.audio.crowd(0.15);
    ev = null;
    go('tally');
  }

  function rankFor(score) {
    if (score <= 0) return -1;
    let i = 0;
    while (i < board.length && board[i].s >= score) i++;
    return i < 10 ? i : -1;
  }

  function finishEntry() {
    const name = entry.letters.join('').replace(/ +$/, '') || '---';
    const row = { n: name.padEnd(3, ' ').slice(0, 3), s: game.total, c: game.country, r: game.round };
    board.splice(entry.rank, 0, row);
    board = board.slice(0, 10);
    store.set(BOARD_KEY, board);
    highlight = entry.rank;
    entry = null;
    G.audio.play('title');
    go('board');
  }

  // ---------- update ----------
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ. ';
  function update(dt, inp) {
    st += dt; time += dt;
    for (const k of inp.keys) {
      if (k.code === 'KeyM' && state !== 'entry') G.audio.toggleMute();
      if ((k.code === 'KeyP' || k.code === 'Escape') && state === 'event') paused = !paused;
    }
    if (paused) return;
    const any = inp.press || inp.runs.length > 0;
    switch (state) {
      case 'title':
        if (inp.keys.length && !titleMusic) { titleMusic = true; G.audio.play('title'); }
        if (inp.press) { G.audio.sfx.select(); go('select'); }
        else if (st > 14) { highlight = -1; go('board'); }
        break;
      case 'select': {
        const cols = 6, n = G.COUNTRIES.length;
        for (const s of inp.runs) { sel = (sel + (s === 'L' ? n - 1 : 1)) % n; G.audio.sfx.blip(); }
        for (const k of inp.keys) {
          if (k.code === 'ArrowDown') { sel = (sel + cols) % n; G.audio.sfx.blip(); }
        }
        if (inp.press && st > 0.2) {
          // ArrowUp doubles as ACTION in-game; on this screen treat it as "move up"
          if (inp.keys.some(k => k.code === 'ArrowUp')) { sel = (sel - cols + n) % n; G.audio.sfx.blip(); }
          else { G.audio.sfx.select(); newGame(G.COUNTRIES[sel].code); G.audio.stop(); startIntro(); }
        }
        break;
      }
      case 'intro':
        if ((inp.press && st > 0.6) || st > 6) startEvent();
        break;
      case 'event':
        ev.update(dt, inp);
        if (ev.done) endEvent();
        break;
      case 'tally': {
        const rate = 1600;
        if (tally.shown < tally.to) {
          tally.shown = Math.min(tally.to, tally.shown + rate * dt * (any ? 4 : 1));
          if (time - tally.lastTick > 0.05) { G.audio.sfx.tick(); tally.lastTick = time; }
        } else if ((inp.press && st > 1) || st > 7) {
          if (!tally.ok) { go('gameover'); G.audio.play('gameover'); }
          else if (game.idx === G.EVENT_LIST.length - 1) { go('roundclear'); G.audio.play('record'); G.audio.cheer(); }
          else { game.idx++; startIntro(); }
        }
        break;
      }
      case 'roundclear':
        if ((inp.press && st > 1.5) || st > 6) { game.round++; game.idx = 0; startIntro(); }
        break;
      case 'gameover':
        if ((inp.press && st > 1.5) || st > 6) {
          G.audio.crowd(0);
          const r = rankFor(game.total);
          if (r >= 0) { entry = { rank: r, letters: ['A', ' ', ' '], pos: 0, cur: 0 }; G.audio.play('entry'); go('entry'); }
          else { highlight = -1; G.audio.play('title'); go('board'); }
        }
        break;
      case 'entry': {
        const e = entry;
        const setCur = (c) => { e.cur = (c + LETTERS.length) % LETTERS.length; e.letters[e.pos] = LETTERS[e.cur]; G.audio.sfx.blip(); };
        const advance = () => {
          G.audio.sfx.select();
          if (e.pos >= 2) return finishEntry();
          e.pos++; e.cur = 0; e.letters[e.pos] = LETTERS[0];
        };
        for (const k of inp.keys) {
          if (!entry) break;
          if (/^Key[A-Z]$/.test(k.code)) { setCur(LETTERS.indexOf(k.code[3])); advance(); }
          else if (k.code === 'Period') { setCur(LETTERS.indexOf('.')); advance(); }
          else if (k.code === 'ArrowLeft' || k.code === 'ArrowDown' || k.code === 'TouchL') setCur(e.cur - 1);
          else if (k.code === 'ArrowRight' || k.code === 'ArrowUp' || k.code === 'TouchR') setCur(e.cur + 1);
          else if (k.code === 'Space' || k.code === 'Enter' || k.code === 'TouchA') advance();
          else if (k.code === 'Backspace' && e.pos > 0) { e.letters[e.pos] = ' '; e.pos--; e.cur = LETTERS.indexOf(e.letters[e.pos]); }
        }
        if (entry && st > 45) finishEntry();
        break;
      }
      case 'board':
        if ((inp.press && st > 0.5) || st > (highlight >= 0 ? 30 : 10)) { highlight = -1; game = null; go('title'); }
        break;
    }
  }
  let titleMusic = false;

  // ---------- drawing ----------
  const pad = (n, w) => String(Math.floor(n)).padStart(w, '0');
  function topHud() {
    G.rect(ctx, 0, 0, G.W, 16, '#000');
    G.text(ctx, '1UP', 4, 1, '#f04040');
    G.text(ctx, pad(game ? (state === 'tally' ? tally.shown : game.total) : 0, 6), 4, 8, '#f8f8f8');
    G.text(ctx, 'HI', 92, 1, '#f04040');
    G.text(ctx, pad(hiScore(), 6), 92, 8, '#f8f8f8');
    if (game) {
      G.flag(ctx, game.country, 170, 3, 15, 10);
      G.text(ctx, game.country, 189, 5, '#f8f8f8');
      G.text(ctx, 'R' + game.round, G.W - 4, 5, '#f8d038', { align: 'right' });
    }
  }

  function blink(rate) { return Math.floor(time * (rate || 2)) % 2 === 0; }

  function drawTitle() {
    G.rect(ctx, 0, 0, G.W, G.H, '#000018');
    // stars
    for (let i = 0; i < 40; i++) G.rect(ctx, (i * 71) % 256, 18 + (i * 37) % 120, 1, 1, i % 3 ? '#4060a0' : '#a0a0f0');
    const cols = ['#f04040', '#f8d038', '#40f040', '#40c0f8', '#f080f0'];
    TITLE[0].split('').forEach((ch, i) => G.text(ctx, ch, 128 - TITLE[0].length * 9 + i * 18, 26 + Math.round(Math.sin(time * 4 + i * 0.6) * 2), cols[(i + Math.floor(time * 3)) % cols.length], { scale: 3 }));
    G.text(ctx, TITLE[1], 128, 56, '#f8f8f8', { scale: 2, align: 'center', shadow: '#2040a0' });
    // five rings of colour stripes
    ['#2060f0', '#f8d038', '#202020', '#40c040', '#f04040'].forEach((c, i) => G.rect(ctx, 48 + i * 32, 76, 30, 2, c === '#202020' ? '#a0a0a0' : c));
    G.text(ctx, '100M  LONG JUMP  JAVELIN', 128, 84, '#c0c0c0', { align: 'center' });
    G.text(ctx, '110M HURDLES  HAMMER  HIGH JUMP', 128, 93, '#c0c0c0', { align: 'center' });
    // controls panel
    G.box(ctx, 14, 106, 228, 50, '#4060c0', '#000030');
    G.text(ctx, 'CONTROLS', 128, 110, '#f8d038', { align: 'center' });
    const keyCap = (x, y, label) => { G.box(ctx, x, y, 13, 13, '#f8f8f8', '#303060'); G.text(ctx, label, x + 4, y + 3, '#f8f8f8'); };
    keyCap(46, 122, 'Z'); keyCap(122, 122, 'X'); keyCap(198, 122, 'C');
    G.text(ctx, 'RUN', 52, 139, '#40f040', { align: 'center' });
    G.text(ctx, 'JUMP/THROW', 128, 139, '#40c0f8', { align: 'center' });
    G.text(ctx, 'RUN', 204, 139, '#40f040', { align: 'center' });
    G.text(ctx, '<- / SPACE / ->  ALSO WORK', 128, 147, '#8080a0', { align: 'center' });
    // runner crossing the screen
    const rx = ((time * 90) % 340) - 40;
    G.rect(ctx, 0, 186, G.W, 4, '#c05030');
    G.athlete(ctx, rx, 172, G.poses.run(time * 14, 1), G.athleteColors('USA', 0));
    if (blink(2)) G.text(ctx, 'PRESS JUMP (X) TO START', 128, 164, '#f8f8f8', { align: 'center' });
    G.text(ctx, 'M SOUND  P PAUSE', 128, 196, '#606080', { align: 'center' });
    G.text(ctx, '@1983 STYLE - A TRACK TRIBUTE', 128, 208, '#606080', { align: 'center' });
    topHud();
  }

  function drawSelect() {
    G.rect(ctx, 0, 0, G.W, G.H, '#000030');
    topHud();
    G.text(ctx, 'CHOOSE YOUR COUNTRY', 128, 22, '#f8d038', { scale: 1, align: 'center' });
    const cols = 6, fw = 24, fh = 16, gx = 22, gy = 36, sx = 36, sy = 30;
    G.COUNTRIES.forEach((c, i) => {
      const x = gx + (i % cols) * sx, y = gy + Math.floor(i / cols) * sy;
      G.flag(ctx, c.code, x, y, fw, fh);
      G.text(ctx, c.code, x + fw / 2, y + fh + 3, i === sel ? '#f8d038' : '#a0a0a0', { align: 'center' });
      if (i === sel && blink(4)) G.box(ctx, x - 2, y - 2, fw + 4, fh + 4, '#f8d038');
    });
    const c = G.COUNTRIES[sel];
    G.box(ctx, 14, 130, 228, 48, '#4060c0', '#000018');
    G.flag(ctx, c.code, 24, 140, 36, 24);
    G.text(ctx, c.name, 70, 142, '#f8f8f8', { scale: 1 });
    G.text(ctx, 'RIVALS AWAIT IN 6 EVENTS', 70, 156, '#8080c0');
    G.athlete(ctx, 220, 156, G.poses.wave(time), G.athleteColors(c.code, 0));
    G.text(ctx, 'Z/C OR ARROWS: MOVE   X: SELECT', 128, 190, '#8080a0', { align: 'center' });
  }

  function drawIntro() {
    const def = G.EVENT_LIST[game.idx];
    G.stadium(ctx, game.idx * 30, 0, false, time);
    G.track(ctx, game.idx * 30, 0);
    G.rect(ctx, 16, 28, 224, 136, '#000020');
    G.box(ctx, 16, 28, 224, 136, '#f8d038');
    G.text(ctx, 'ROUND ' + game.round + '  EVENT ' + (game.idx + 1) + '/6', 128, 36, '#80c0ff', { align: 'center' });
    G.text(ctx, def.name, 128, 50, '#f8f8f8', { scale: 2, align: 'center', shadow: '#2040a0' });
    const q = G.qualFor(def, game.round);
    G.text(ctx, 'QUALIFY', 40, 74, '#f8d038'); G.text(ctx, G.fmtVal(def, q) + (def.time ? ' SEC' : ''), 216, 74, '#f8d038', { align: 'right' });
    G.text(ctx, "WORLD RECORD '83", 40, 85, '#c0c0c0'); G.text(ctx, def.wr + (def.time ? ' SEC' : 'M'), 216, 85, '#c0c0c0', { align: 'right' });
    const b = bests[def.id];
    G.text(ctx, 'YOUR BEST', 40, 96, '#c0c0c0'); G.text(ctx, b === undefined ? '--' : G.fmtVal(def, b) + (def.time ? ' SEC' : ''), 216, 96, '#c0c0c0', { align: 'right' });
    def.help.forEach((h, i) => G.text(ctx, h, 128, 114 + i * 11, '#40f040', { align: 'center' }));
    if (blink(2)) G.text(ctx, 'PRESS JUMP', 128, 152, '#f8f8f8', { align: 'center' });
    topHud();
    G.rect(ctx, 0, 200, G.W, 24, '#000');
    G.text(ctx, 'TOTAL ' + game.total, 4, 209, '#f8f8f8');
  }

  function drawTally() {
    G.rect(ctx, 0, 0, G.W, G.H, '#000020');
    topHud();
    G.text(ctx, 'SCORE BOARD', 128, 22, '#f8d038', { scale: 2, align: 'center' });
    G.flag(ctx, game.country, 16, 22, 18, 12);
    const rows = game.results.filter(r => r.round === game.round);
    const prevRounds = game.results.filter(r => r.round < game.round).reduce((a, r) => a + r.pts, 0);
    let y = 46;
    G.text(ctx, 'EVENT', 12, y - 9, '#8080c0'); G.text(ctx, 'RESULT', 150, y - 9, '#8080c0', { align: 'right' }); G.text(ctx, 'POINTS', 244, y - 9, '#8080c0', { align: 'right' });
    if (game.round > 1) { G.text(ctx, 'ROUNDS 1-' + (game.round - 1), 12, y, '#a0a0a0'); G.text(ctx, String(prevRounds), 244, y, '#a0a0a0', { align: 'right' }); y += 11; }
    G.EVENT_LIST.forEach((def, i) => {
      const r = rows[i];
      const last = i === rows.length - 1;
      const c = !r ? '#404060' : last ? '#f8f8f8' : '#c0c0c0';
      G.text(ctx, def.name, 12, y, c);
      if (r) {
        G.text(ctx, G.fmtVal(def, r.value), 150, y, r.ok ? c : '#f04040', { align: 'right' });
        G.text(ctx, r.ok ? 'Q' : 'X', 158, y, r.ok ? '#40f040' : '#f04040');
        const shownPts = last ? Math.max(0, Math.floor(tally.shown - tally.from)) : r.pts;
        G.text(ctx, String(shownPts), 244, y, c, { align: 'right' });
      } else G.text(ctx, '-', 244, y, c, { align: 'right' });
      y += 11;
    });
    G.rect(ctx, 12, y + 2, 232, 1, '#4060c0');
    G.text(ctx, 'TOTAL', 12, y + 8, '#f8d038', { scale: 2 });
    G.text(ctx, String(Math.floor(tally.shown)), 244, y + 8, '#f8d038', { scale: 2, align: 'right' });
    // bar chart of points per event
    const bx = 12, by = 186;
    rows.forEach((r, i) => {
      const h = Math.round(Math.min(1200, r.pts) / 1200 * 34);
      G.rect(ctx, bx + i * 14, by - h, 10, h, r.ok ? '#40a0f0' : '#f04040');
    });
    if (tally.shown >= tally.to) {
      const last = rows[rows.length - 1];
      if (last && last.record) G.text(ctx, 'NEW PERSONAL BEST!', 170, 156, blink(4) ? '#f8d038' : '#f04040', { align: 'center' });
      G.text(ctx, tally.ok ? 'QUALIFIED!' : 'DID NOT QUALIFY', 170, 168, tally.ok ? '#40f040' : '#f04040', { scale: 1, align: 'center' });
      if (blink(2)) G.text(ctx, 'PRESS JUMP', 170, 182, '#f8f8f8', { align: 'center' });
    }
  }

  function drawRoundClear() {
    G.stadium(ctx, time * 3, 0, true, time);
    G.track(ctx, time * 3, 0);
    G.rect(ctx, 24, 40, 208, 80, '#000020'); G.box(ctx, 24, 40, 208, 80, '#40f040');
    G.text(ctx, 'ROUND ' + game.round + ' CLEAR!', 128, 50, '#f8d038', { scale: 2, align: 'center' });
    G.text(ctx, 'QUALIFIED IN ALL 6 EVENTS', 128, 74, '#f8f8f8', { align: 'center' });
    G.text(ctx, 'NEXT ROUND: TOUGHER MARKS', 128, 88, '#40c0f8', { align: 'center' });
    G.text(ctx, 'TOTAL ' + game.total, 128, 104, '#f8d038', { align: 'center' });
    G.athlete(ctx, 128, G.GROUND - 14, G.poses.wave(time), G.athleteColors(game.country, game.skin));
    G.flag(ctx, game.country, 140, 130, 30, 20);
    G.rect(ctx, 139, 130, 1, 60, '#c0c0c0');
    topHud();
  }

  function drawGameOver() {
    G.rect(ctx, 0, 0, G.W, G.H, '#000');
    topHud();
    G.text(ctx, 'GAME OVER', 128, 70, '#f04040', { scale: 3, align: 'center', shadow: '#400000' });
    G.flag(ctx, game.country, 104, 104, 48, 32);
    G.text(ctx, 'FINAL SCORE ' + game.total, 128, 148, '#f8f8f8', { align: 'center' });
    G.text(ctx, 'REACHED ROUND ' + game.round + ', EVENT ' + (game.idx + 1), 128, 160, '#a0a0a0', { align: 'center' });
  }

  function drawEntry() {
    const e = entry;
    G.rect(ctx, 0, 0, G.W, G.H, '#000020');
    topHud();
    G.text(ctx, 'CONGRATULATIONS!', 128, 28, '#f8d038', { scale: 2, align: 'center' });
    const ord = ['1ST', '2ND', '3RD'][e.rank] || (e.rank + 1) + 'TH';
    G.text(ctx, 'YOU PLACED ' + ord + ' WITH ' + game.total, 128, 50, '#f8f8f8', { align: 'center' });
    G.text(ctx, 'ENTER YOUR INITIALS', 128, 66, '#40c0f8', { align: 'center' });
    for (let i = 0; i < 3; i++) {
      const x = 80 + i * 36;
      G.rect(ctx, x, 110, 24, 2, i === e.pos ? '#f8d038' : '#606080');
      if (i < e.pos || (i === e.pos && blink(3))) G.text(ctx, e.letters[i] === ' ' ? '_' : e.letters[i], x + 12, 84, i === e.pos ? '#f8d038' : '#f8f8f8', { scale: 3, align: 'center' });
    }
    G.flag(ctx, game.country, 112, 120, 32, 20);
    G.text(ctx, 'TYPE A LETTER, OR', 128, 150, '#a0a0c0', { align: 'center' });
    G.text(ctx, '<- -> TO CHANGE, SPACE TO SET', 128, 160, '#a0a0c0', { align: 'center' });
    G.text(ctx, 'TIME ' + Math.max(0, Math.ceil(45 - st)), 128, 180, '#f04040', { align: 'center' });
  }

  function drawBoard() {
    G.rect(ctx, 0, 0, G.W, G.H, '#000018');
    topHud();
    G.text(ctx, 'BEST ATHLETES', 128, 22, '#f8d038', { scale: 2, align: 'center' });
    G.text(ctx, 'RANK NAME  NATION    SCORE  RND', 128, 44, '#8080c0', { align: 'center' });
    const cols = ['#f8d038', '#c0c0c0', '#d08040'];
    board.forEach((r, i) => {
      const y = 56 + i * 14;
      const hl = i === highlight;
      const c = hl ? (blink(4) ? '#40f040' : '#f8f8f8') : (cols[i] || '#a0a0f0');
      G.text(ctx, String(i + 1).padStart(2, ' '), 26, y, c);
      G.text(ctx, r.n, 58, y, c);
      G.flag(ctx, r.c, 92, y - 1, 13, 9);
      G.text(ctx, r.c, 110, y, c);
      G.text(ctx, String(r.s), 192, y, c, { align: 'right' });
      G.text(ctx, String(r.r || 1), 224, y, c, { align: 'right' });
    });
    if (blink(2)) G.text(ctx, 'PRESS JUMP', 128, 202, '#f8f8f8', { align: 'center' });
  }

  function draw() {
    ctx.imageSmoothingEnabled = false;
    switch (state) {
      case 'title': drawTitle(); break;
      case 'select': drawSelect(); break;
      case 'intro': drawIntro(); break;
      case 'event': ev.draw(ctx); topHud(); break;
      case 'tally': drawTally(); break;
      case 'roundclear': drawRoundClear(); break;
      case 'gameover': drawGameOver(); break;
      case 'entry': drawEntry(); break;
      case 'board': drawBoard(); break;
    }
    if (paused) {
      G.rect(ctx, 78, 96, 100, 24, '#000');
      G.box(ctx, 78, 96, 100, 24, '#f8f8f8');
      G.text(ctx, 'PAUSE', 128, 101, '#f8f8f8', { scale: 2, align: 'center' });
    }
    if (G.audio.muted) G.text(ctx, 'MUTE', G.W - 4, 17, '#f04040', { align: 'right' });
  }

  // ---------- loop ----------
  const STEP = 1 / 60;
  let last = performance.now(), acc = 0;
  function frame(now) {
    acc += Math.min(0.25, (now - last) / 1000);
    last = now;
    let first = true;
    while (acc >= STEP) {
      update(STEP, first ? takeInput() : Object.assign({}, EMPTY, { held: actionHeld }));
      first = false;
      acc -= STEP;
    }
    draw();
    requestAnimationFrame(frame);
  }

  function resize() {
    const touch = document.getElementById('touch');
    const showTouch = window.matchMedia('(pointer: coarse)').matches;
    touch.style.display = showTouch ? 'flex' : 'none';
    const availH = window.innerHeight - (showTouch ? 110 : 0);
    let s = Math.min(window.innerWidth / G.W, availH / G.H);
    if (s >= 1) s = Math.floor(s);
    canvas.style.width = Math.floor(G.W * s) + 'px';
    canvas.style.height = Math.floor(G.H * s) + 'px';
  }
  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);

  // for debugging and automated checks
  G.debug = { get state() { return state; }, get game() { return game; }, get ev() { return ev; }, board: () => board,
    go: (s) => go(s), newGame, startEvent: (i) => { game.idx = i; startEvent(); } };
})(window.G = window.G || {});
