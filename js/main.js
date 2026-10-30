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
  // Placeholder entries from earlier versions. Boards now start empty, and these exact entries are
  // removed from boards already saved in a browser; real players' results are kept.
  const OLD_BOARD = [
    ['ACE', 9000, 'USA'], ['KEN', 8000, 'JPN'], ['ZAP', 7000, 'URS'], ['MAX', 6000, 'FRG'], ['SUE', 5000, 'GBR'],
    ['LEE', 4000, 'KOR'], ['ANA', 3000, 'BRA'], ['OLA', 2500, 'SWE'], ['ROY', 2000, 'CAN'], ['DOT', 1500, 'ITA'],
  ].map(([n, s, c]) => ({ n, s, c, r: 1 }));
  const isOldBoardRow = (r) => OLD_BOARD.some(d => d.n === r.n && d.s === r.s && d.c === r.c);
  let board = store.get(BOARD_KEY, []);
  if (!Array.isArray(board)) board = [];
  board = board.filter(r => !isOldBoardRow(r));
  let bests = store.get(BESTS_KEY, {});
  // Top 5 results of every event (placeholders from earlier versions are removed the same way).
  const EVENTS_KEY = 'sa83.events', NAME_KEY = 'sa83.name';
  const OLD_SEED = {
    dash: [10.20, 10.60, 11.00, 11.40, 11.80], long: [7.60, 7.20, 6.80, 6.40, 6.00], jav: [78, 72, 66, 60, 55],
    hurdles: [13.90, 14.40, 15.00, 15.80, 16.60], hammer: [70, 65, 60, 55, 50], high: [2.20, 2.12, 2.04, 1.96, 1.88],
  };
  let eventTop = store.get(EVENTS_KEY, null);
  if (!eventTop || typeof eventTop !== 'object') eventTop = {};
  G.EVENT_LIST.forEach((def, i) => {
    const old = OLD_SEED[def.id].map((v, k) => { const d = OLD_BOARD[(k * 2 + i) % OLD_BOARD.length]; return { n: d.n, v, c: d.c }; });
    const list = Array.isArray(eventTop[def.id]) ? eventTop[def.id] : [];
    eventTop[def.id] = list.filter(r => !old.some(o => o.n === r.n && o.v === r.v && o.c === r.c));
  });
  store.set(BOARD_KEY, board); store.set(EVENTS_KEY, eventTop);
  let lastName = store.get(NAME_KEY, 'AAA');
  if (typeof lastName !== 'string' || lastName.length !== 3) lastName = 'AAA';
  const ordinal = (r) => ['1ST', '2ND', '3RD'][r] || (r + 1) + 'TH';
  function eventRank(def, v) {
    if (v === null || v === undefined) return -1;
    const list = eventTop[def.id];
    let i = 0;
    while (i < list.length && !G.isBetter(def, v, list[i].v)) i++;
    return i < 5 ? i : -1;
  }
  // ---------- shared leaderboards ----------
  // The boards live on the server (api/scores.js), so every player sees the same ones. The copy in
  // localStorage is a cache, shown until the server answers and used when it can't be reached.
  const API = 'api/scores';
  let posting = 0, lastFetch = -1e9;
  function applyShared(d) {
    if (!d || !Array.isArray(d.board) || !d.events) return false;
    board = d.board.slice(0, 10);
    G.EVENT_LIST.forEach(def => { if (Array.isArray(d.events[def.id])) eventTop[def.id] = d.events[def.id].slice(0, 5); });
    store.set(BOARD_KEY, board); store.set(EVENTS_KEY, eventTop);
    return true;
  }
  function refreshBoards() {
    const now = performance.now();
    if (location.protocol === 'file:' || posting || now - lastFetch < 5000) return;
    lastFetch = now;
    fetch(API, { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      .then(d => { if (!posting) applyShared(d); }).catch(() => {});
  }
  // Sends one result; onRank gets its place on the shared board (-1 if it no longer makes it).
  function submitShared(o, onRank) {
    if (location.protocol === 'file:') return;
    posting++;
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) })
      .then(r => r.ok ? r.json() : null)
      .then(d => { posting--; if (applyShared(d)) onRank(d.rank); })
      .catch(() => { posting--; });
  }
  refreshBoards();
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
  let sel = 0, tally = null, entry = null, highlight = -1, highlightEvt = null;

  function go(s) {
    state = s; st = 0;
    if (s === 'title' || s === 'board' || s === 'records' || s === 'intro') refreshBoards();
  }

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
    G.audio.play('running');
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
    const r = eventRank(def, v);
    // after the result jingle, a new event top 5 brings in the Olympic theme for the initials screen
    G.audio.play(ok ? (record ? 'record' : 'qualify') : 'fail', () => { if (state === 'entry' || state === 'evtboard') G.audio.theme(); });
    G.audio.crowd(0.15);
    ev = null;
    if (r >= 0) { entry = newEntry({ mode: 'event', def, value: v, rank: r }); go('entry'); }
    else go('tally');
  }

  function newEntry(o) {
    const letters = lastName.split('');
    return Object.assign({ letters, pos: 0, cur: Math.max(0, LETTERS.indexOf(letters[0])) }, o);
  }

  function rankFor(score) {
    if (score <= 0) return -1;
    let i = 0;
    while (i < board.length && board[i].s >= score) i++;
    return i < 10 ? i : -1;
  }

  function finishEntry() {
    const name = (entry.letters.join('').replace(/ +$/, '') || '---').padEnd(3, ' ').slice(0, 3);
    lastName = name; store.set(NAME_KEY, name);
    if (entry.mode === 'event') {
      const list = eventTop[entry.def.id];
      list.splice(entry.rank, 0, { n: name, v: entry.value, c: game.country });
      eventTop[entry.def.id] = list.slice(0, 5);
      store.set(EVENTS_KEY, eventTop);
      highlightEvt = { id: entry.def.id, rank: entry.rank };
      const hl = highlightEvt;
      submitShared({ kind: 'event', id: entry.def.id, n: name, v: entry.value, c: game.country }, rank => { hl.rank = rank; });
      entry = null;
      go('evtboard');
      return;
    }
    const row = { n: name, s: game.total, c: game.country, r: game.round };
    board.splice(entry.rank, 0, row);
    board = board.slice(0, 10);
    store.set(BOARD_KEY, board);
    highlight = entry.rank;
    submitShared(Object.assign({ kind: 'board' }, row), rank => { if (state === 'board') highlight = rank; });
    entry = null;
    G.audio.theme();
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
        if (inp.keys.length) G.audio.theme();
        if (inp.keys.some(k => k.code === 'KeyH')) { G.audio.sfx.select(); highlightEvt = null; go('records'); }
        else if (inp.press) { G.audio.sfx.select(); go('select'); }
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
          if (!tally.ok) { go('gameover'); G.audio.theme(); }
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
          if (r >= 0) { entry = newEntry({ mode: 'game', rank: r }); go('entry'); }
          else { highlight = -1; go('board'); }
        }
        break;
      case 'entry': {
        const e = entry;
        const setCur = (c) => { e.cur = (c + LETTERS.length) % LETTERS.length; e.letters[e.pos] = LETTERS[e.cur]; G.audio.sfx.blip(); };
        const advance = () => {
          G.audio.sfx.select();
          if (e.pos >= 2) return finishEntry();
          e.pos++; e.cur = Math.max(0, LETTERS.indexOf(e.letters[e.pos]));
        };
        // ignore keys for a moment so mashing from the event doesn't type letters
        for (const k of (st < 0.8 ? [] : inp.keys)) {
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
        if (inp.press && st > 0.5) { highlight = -1; game = null; go('title'); }
        else if (st > (highlight >= 0 ? 30 : 10)) { highlight = -1; game = null; highlightEvt = null; go('records'); }
        break;
      case 'records':
        if ((inp.press && st > 0.5) || st > 12) { highlightEvt = null; go('title'); }
        break;
      case 'evtboard':
        if ((inp.press && st > 0.8) || st > 6) { G.audio.stop(); go('tally'); }
        break;
    }
  }

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
  const fmtUnit = (def, v) => G.fmtVal(def, v);

  function drawTitle() {
    G.daylight(ctx, time);
    G.panel(ctx, 16, 19, 224, 56);
    const cols = ['#f04040', '#f8d038', '#40f040', '#40c0f8', '#f080f0'];
    TITLE[0].split('').forEach((ch, i) => G.text(ctx, ch, 128 - TITLE[0].length * 9 + i * 18, 23 + Math.round(Math.sin(time * 4 + i * 0.6) * 1.5), cols[(i + Math.floor(time * 3)) % cols.length], { scale: 3 }));
    G.text(ctx, TITLE[1], 128, 50, '#f8f8f8', { scale: 2, align: 'center', shadow: '#2040a0' });
    ['#2060f0', '#f8d038', '#202020', '#40c040', '#f04040'].forEach((c, i) => G.rect(ctx, 48 + i * 32, 68, 30, 2, c));
    G.panel(ctx, 12, 79, 232, 76);
    G.text(ctx, '100M  LONG JUMP  JAVELIN', 128, 83, '#f8f8f8', { align: 'center' });
    G.text(ctx, '110M HURDLES  HAMMER  HIGH JUMP', 128, 92, '#f8f8f8', { align: 'center' });
    const keyCap = (x, y, label) => { G.box(ctx, x, y, 13, 13, '#f8f8f8', '#303060'); G.text(ctx, label, x + 4, y + 3, '#f8f8f8'); };
    keyCap(46, 103, 'Z'); keyCap(122, 103, 'X'); keyCap(198, 103, 'C');
    G.text(ctx, 'RUN', 52, 119, '#40f040', { align: 'center' });
    G.text(ctx, 'JUMP/THROW', 128, 119, '#40c0f8', { align: 'center' });
    G.text(ctx, 'RUN', 204, 119, '#40f040', { align: 'center' });
    G.text(ctx, '<- / SPACE / ->  ALSO WORK', 128, 130, '#a0b0e0', { align: 'center' });
    G.text(ctx, 'H RECORDS   M SOUND   P PAUSE', 128, 142, '#f8d038', { align: 'center' });
    if (blink(2)) { G.panel(ctx, 50, 159, 156, 15); G.text(ctx, 'PRESS JUMP (X) TO START', 128, 163, '#f8f8f8', { align: 'center' }); }
    G.rect(ctx, 0, 207, G.W, 17, 'rgba(10,26,80,0.75)');
    G.text(ctx, '@1983 STYLE - A TRACK TRIBUTE', 128, 212, '#c0d0ff', { align: 'center' });
    topHud();
  }

  function drawSelect() {
    G.daylight(ctx, time);
    topHud();
    G.panel(ctx, 8, 18, 240, 124);
    G.text(ctx, 'CHOOSE YOUR COUNTRY', 128, 22, '#f8d038', { align: 'center' });
    const cols = 6, fw = 24, fh = 16, gx = 22, gy = 33, sx = 36, sy = 27;
    G.COUNTRIES.forEach((c, i) => {
      const x = gx + (i % cols) * sx, y = gy + Math.floor(i / cols) * sy;
      G.flag(ctx, c.code, x, y, fw, fh);
      G.text(ctx, c.code, x + fw / 2, y + fh + 2, i === sel ? '#f8d038' : '#c0c8e8', { align: 'center' });
      if (i === sel && blink(4)) G.box(ctx, x - 2, y - 2, fw + 4, fh + 4, '#f8d038');
    });
    const c = G.COUNTRIES[sel];
    G.panel(ctx, 14, 146, 228, 42);
    G.flag(ctx, c.code, 22, 157, 30, 20);
    G.text(ctx, c.name, 58, 160, '#f8f8f8', { scale: 2, shadow: '#102050' });
    G.athlete(ctx, 226, 166, G.poses.wave(time), G.athleteColors(c.code, 0));
    G.rect(ctx, 0, 196, G.W, 13, 'rgba(10,26,80,0.75)');
    G.text(ctx, 'Z/C OR ARROWS: MOVE   X: SELECT', 128, 199, '#f8f8f8', { align: 'center' });
  }

  function drawIntro() {
    const def = G.EVENT_LIST[game.idx];
    G.stadium(ctx, game.idx * 30 + time, 0, false, time);
    G.track(ctx, game.idx * 30 + time, 0);
    G.panel(ctx, 16, 26, 224, 140);
    G.text(ctx, 'ROUND ' + game.round + '  EVENT ' + (game.idx + 1) + '/6', 128, 32, '#80c0ff', { align: 'center' });
    G.text(ctx, def.name, 128, 45, '#f8f8f8', { scale: 2, align: 'center', shadow: '#2040a0' });
    const q = G.qualFor(def, game.round);
    const unit = def.time ? ' SEC' : '';
    G.text(ctx, 'QUALIFY', 36, 66, '#f8d038'); G.text(ctx, fmtUnit(def, q) + unit, 220, 66, '#f8d038', { align: 'right' });
    G.text(ctx, "WORLD RECORD '83", 36, 77, '#c0c8e8'); G.text(ctx, def.wr + (def.time ? ' SEC' : 'M'), 220, 77, '#c0c8e8', { align: 'right' });
    const top = eventTop[def.id][0];
    G.text(ctx, 'TOP SCORE', 36, 88, '#c0c8e8');
    if (top) { G.text(ctx, fmtUnit(def, top.v) + unit, 220, 88, '#c0c8e8', { align: 'right' }); G.text(ctx, top.n, 150, 88, '#c0c8e8', { align: 'right' }); }
    const b = bests[def.id];
    G.text(ctx, 'YOUR BEST', 36, 99, '#c0c8e8'); G.text(ctx, b === undefined ? '--' : fmtUnit(def, b) + unit, 220, 99, '#c0c8e8', { align: 'right' });
    def.help.forEach((h, i) => G.text(ctx, h, 128, 115 + i * 11, '#40f040', { align: 'center' }));
    if (blink(2)) G.text(ctx, 'PRESS JUMP', 128, 154, '#f8f8f8', { align: 'center' });
    topHud();
    G.rect(ctx, 0, 200, G.W, 24, '#000');
    G.text(ctx, 'TOTAL ' + game.total, 4, 209, '#f8f8f8');
  }

  function drawTally() {
    G.daylight(ctx, time);
    topHud();
    G.panel(ctx, 4, 18, 248, 186);
    G.text(ctx, 'SCORE BOARD', 128, 23, '#f8d038', { scale: 2, align: 'center' });
    G.flag(ctx, game.country, 12, 23, 18, 12);
    const rows = game.results.filter(r => r.round === game.round);
    const prevRounds = game.results.filter(r => r.round < game.round).reduce((a, r) => a + r.pts, 0);
    let y = 48;
    G.text(ctx, 'EVENT', 12, y - 9, '#80a0e0'); G.text(ctx, 'RESULT', 150, y - 9, '#80a0e0', { align: 'right' }); G.text(ctx, 'POINTS', 244, y - 9, '#80a0e0', { align: 'right' });
    if (game.round > 1) { G.text(ctx, 'ROUNDS 1-' + (game.round - 1), 12, y, '#a0b0e0'); G.text(ctx, String(prevRounds), 244, y, '#a0b0e0', { align: 'right' }); y += 11; }
    G.EVENT_LIST.forEach((def, i) => {
      const r = rows[i];
      const last = i === rows.length - 1;
      const c = !r ? '#506090' : last ? '#f8f8f8' : '#c0c8e8';
      G.text(ctx, def.name, 12, y, c);
      if (r) {
        G.text(ctx, fmtUnit(def, r.value), 150, y, r.ok ? c : '#ff6060', { align: 'right' });
        G.text(ctx, r.ok ? 'Q' : 'X', 158, y, r.ok ? '#40f040' : '#ff6060');
        const shownPts = last ? Math.max(0, Math.floor(tally.shown - tally.from)) : r.pts;
        G.text(ctx, String(shownPts), 244, y, c, { align: 'right' });
      } else G.text(ctx, '-', 244, y, c, { align: 'right' });
      y += 11;
    });
    G.rect(ctx, 12, y + 2, 232, 1, '#4060c0');
    G.text(ctx, 'TOTAL', 12, y + 8, '#f8d038', { scale: 2 });
    G.text(ctx, String(Math.floor(tally.shown)), 244, y + 8, '#f8d038', { scale: 2, align: 'right' });
    const bx = 12, by = 194;
    rows.forEach((r, i) => {
      const h = Math.round(Math.min(1200, r.pts) / 1200 * 34);
      G.rect(ctx, bx + i * 14, by - h, 10, h, r.ok ? '#40a0f0' : '#f04040');
    });
    if (tally.shown >= tally.to) {
      const last = rows[rows.length - 1];
      if (last && last.record) G.text(ctx, 'NEW PERSONAL BEST!', 170, 160, blink(4) ? '#f8d038' : '#ff6060', { align: 'center' });
      G.text(ctx, tally.ok ? 'QUALIFIED!' : 'DID NOT QUALIFY', 170, 172, tally.ok ? '#40f040' : '#ff6060', { align: 'center' });
      if (blink(2)) G.text(ctx, 'PRESS JUMP', 170, 186, '#f8f8f8', { align: 'center' });
    }
  }

  function drawRoundClear() {
    G.daylight(ctx, time);
    G.panel(ctx, 24, 40, 208, 80);
    G.text(ctx, 'ROUND ' + game.round + ' CLEAR!', 128, 50, '#f8d038', { scale: 2, align: 'center' });
    G.text(ctx, 'QUALIFIED IN ALL 6 EVENTS', 128, 74, '#f8f8f8', { align: 'center' });
    G.text(ctx, 'NEXT ROUND: TOUGHER MARKS', 128, 88, '#40c0f8', { align: 'center' });
    G.text(ctx, 'TOTAL ' + game.total, 128, 104, '#f8d038', { align: 'center' });
    G.flag(ctx, game.country, 140, 128, 30, 20);
    G.rect(ctx, 139, 128, 1, 60, '#e0e0e0');
    G.athlete(ctx, 128, G.GROUND - 14, G.poses.wave(time), G.athleteColors(game.country, game.skin));
    topHud();
  }

  function drawGameOver() {
    G.daylight(ctx, time);
    topHud();
    G.panel(ctx, 36, 48, 184, 128);
    G.text(ctx, 'GAME OVER', 128, 60, '#ff6060', { scale: 3, align: 'center', shadow: '#400000' });
    G.flag(ctx, game.country, 104, 94, 48, 32);
    G.text(ctx, 'FINAL SCORE ' + game.total, 128, 138, '#f8f8f8', { align: 'center' });
    G.text(ctx, 'REACHED ROUND ' + game.round + ', EVENT ' + (game.idx + 1), 128, 152, '#c0c8e8', { align: 'center' });
  }

  function drawEntry() {
    const e = entry;
    G.daylight(ctx, time);
    topHud();
    G.panel(ctx, 12, 18, 232, 178);
    const ord = ordinal(e.rank);
    if (e.mode === 'event') {
      G.text(ctx, 'NEW TOP 5!', 128, 24, '#f8d038', { scale: 2, align: 'center' });
      G.text(ctx, e.def.name + '  ' + fmtUnit(e.def, e.value), 128, 44, '#f8f8f8', { align: 'center' });
      G.text(ctx, ord + ' PLACE IN THE EVENT RECORDS', 128, 55, '#f8f8f8', { align: 'center' });
    } else {
      G.text(ctx, 'CONGRATULATIONS!', 128, 24, '#f8d038', { scale: 2, align: 'center' });
      G.text(ctx, 'YOU PLACED ' + ord + ' WITH ' + game.total, 128, 46, '#f8f8f8', { align: 'center' });
    }
    G.text(ctx, 'ENTER YOUR INITIALS', 128, 68, '#40c0f8', { align: 'center' });
    for (let i = 0; i < 3; i++) {
      const x = 80 + i * 36;
      G.rect(ctx, x, 108, 24, 2, i === e.pos ? '#f8d038' : '#506090');
      const ch = e.letters[i] === ' ' ? '_' : e.letters[i];
      if (i !== e.pos || blink(3)) G.text(ctx, ch, x + 12, 82, i === e.pos ? '#f8d038' : i < e.pos ? '#f8f8f8' : '#8090c0', { scale: 3, align: 'center' });
    }
    G.flag(ctx, game.country, 112, 118, 32, 20);
    G.text(ctx, 'TYPE A LETTER, OR', 128, 148, '#c0c8e8', { align: 'center' });
    G.text(ctx, '<- -> TO CHANGE, SPACE TO SET', 128, 158, '#c0c8e8', { align: 'center' });
    G.text(ctx, 'TIME ' + Math.max(0, Math.ceil(45 - st)), 128, 178, '#ff6060', { align: 'center' });
  }

  function drawBoard() {
    G.daylight(ctx, time);
    topHud();
    G.panel(ctx, 12, 18, 232, 200);
    G.text(ctx, 'BEST ATHLETES', 128, 22, '#f8d038', { scale: 2, align: 'center' });
    G.text(ctx, 'RANK NAME  NATION    SCORE  RND', 128, 42, '#80a0e0', { align: 'center' });
    const cols = ['#f8d038', '#e0e0e0', '#e09050'];
    board.forEach((r, i) => {
      const y = 54 + i * 14;
      const c = i === highlight ? (blink(4) ? '#40f040' : '#f8f8f8') : (cols[i] || '#c0c8e8');
      G.text(ctx, String(i + 1).padStart(2, ' '), 26, y, c);
      G.text(ctx, r.n, 58, y, c);
      G.flag(ctx, r.c, 92, y - 1, 13, 9);
      G.text(ctx, r.c, 110, y, c);
      G.text(ctx, String(r.s), 192, y, c, { align: 'right' });
      G.text(ctx, String(r.r || 1), 224, y, c, { align: 'right' });
    });
    if (!board.length) G.text(ctx, 'NO SCORES YET. BE THE FIRST!', 128, 110, '#e0e4f8', { align: 'center' });
    if (blink(2)) G.text(ctx, 'PRESS JUMP', 128, 200, '#f8f8f8', { align: 'center' });
  }

  // Top 5 of every event on one screen, three events per column.
  function drawRecords() {
    G.daylight(ctx, time);
    topHud();
    G.panel(ctx, 4, 18, 248, 204);
    G.text(ctx, 'EVENT RECORDS', 128, 22, '#f8d038', { scale: 2, align: 'center' });
    G.EVENT_LIST.forEach((def, i) => {
      const x = i < 3 ? 10 : 132, y = 42 + (i % 3) * 54;
      G.text(ctx, def.name, x, y, '#40c0f8');
      if (!eventTop[def.id].length) G.text(ctx, 'NO RESULTS YET', x, y + 10, '#8090c0');
      eventTop[def.id].forEach((r, k) => {
        const yy = y + 10 + k * 8;
        const hl = highlightEvt && highlightEvt.id === def.id && highlightEvt.rank === k;
        const c = hl ? (blink(4) ? '#40f040' : '#f8f8f8') : k === 0 ? '#f8d038' : '#e0e4f8';
        G.text(ctx, (k + 1) + ' ' + r.n, x, yy, c);
        G.flag(ctx, r.c, x + 32, yy, 10, 7);
        G.text(ctx, fmtUnit(def, r.v), x + 112, yy, c, { align: 'right' });
      });
    });
    if (blink(2)) G.text(ctx, 'PRESS JUMP', 128, 210, '#f8f8f8', { align: 'center' });
  }

  // Shown mid-game when a result makes an event's top 5.
  function drawEventBoard() {
    const def = G.EVENT_LIST.find(d => d.id === highlightEvt.id);
    G.daylight(ctx, time);
    topHud();
    G.panel(ctx, 28, 30, 200, 140);
    G.text(ctx, def.name, 128, 36, '#f8d038', { scale: 2, align: 'center' });
    G.text(ctx, 'TOP 5', 128, 54, '#40c0f8', { align: 'center' });
    eventTop[def.id].forEach((r, k) => {
      const y = 70 + k * 16;
      const hl = highlightEvt.rank === k;
      const c = hl ? (blink(4) ? '#40f040' : '#f8f8f8') : k === 0 ? '#f8d038' : '#e0e4f8';
      G.text(ctx, String(k + 1), 44, y, c, { scale: 1 });
      G.text(ctx, r.n, 60, y, c);
      G.flag(ctx, r.c, 88, y - 1, 13, 9);
      G.text(ctx, r.c, 106, y, c);
      G.text(ctx, fmtUnit(def, r.v), 212, y, c, { align: 'right' });
    });
    if (blink(2)) G.text(ctx, 'PRESS JUMP', 128, 154, '#f8f8f8', { align: 'center' });
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
      case 'records': drawRecords(); break;
      case 'evtboard': drawEventBoard(); break;
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
