// Full screen experiment. Loaded after the game; it only adds a full screen toggle and
// replaces the canvas sizing, so the game files stay untouched.
(function (G) {
  const canvas = document.getElementById('screen');
  const root = document.documentElement;
  const btnGo = document.getElementById('fsgo');
  const btnMode = document.getElementById('fsmode');
  const msg = document.getElementById('fsmsg');

  // PIXEL: whole-number scale only, every game pixel is the same size (black borders).
  // FILL: largest size that fits, pixels can differ by one screen pixel.
  // ARCADE: fills a 4:3 box like the 1983 cabinet monitor, so pixels are a bit wider than tall.
  const MODES = ['PIXEL', 'FILL', 'ARCADE'];
  const LABEL = { PIXEL: 'PIXEL-PERFECT', FILL: 'FILL SCREEN', ARCADE: 'ARCADE 4:3' };
  let mode = 'PIXEL';
  try { mode = localStorage.getItem('so83.fsmode') || mode; } catch (e) {}
  if (!MODES.includes(mode)) mode = 'PIXEL';

  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  const canFs = !!(root.requestFullscreen || root.webkitRequestFullscreen) &&
    (document.fullscreenEnabled || document.webkitFullscreenEnabled);

  function say(text) {
    msg.textContent = text; msg.classList.add('show');
    clearTimeout(say.t); say.t = setTimeout(() => msg.classList.remove('show'), 2200);
  }

  function toggleFs() {
    if (!canFs) { say('Full screen is blocked here. Open the page in its own tab.'); return; }
    if (fsElement()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else {
      const p = (root.requestFullscreen || root.webkitRequestFullscreen).call(root, { navigationUI: 'hide' });
      if (p && p.then) p.then(() => {
        // Android Chrome only: keep phones sideways while in full screen
        if (screen.orientation && screen.orientation.lock && matchMedia('(pointer: coarse)').matches)
          screen.orientation.lock('landscape').catch(() => {});
      }).catch(() => say('The browser refused full screen.'));
    }
  }

  function setMode(m) {
    mode = m; try { localStorage.setItem('so83.fsmode', m); } catch (e) {}
    btnMode.textContent = LABEL[m]; layout(); say('Scaling: ' + LABEL[m]);
  }

  function layout() {
    const touch = matchMedia('(pointer: coarse)').matches;
    const availW = window.innerWidth;
    const availH = window.innerHeight - (touch ? 110 : 0);
    let w, h;
    if (mode === 'ARCADE') {
      // 256x224 shown on a 4:3 tube: width = height * 4/3
      h = Math.min(availH, availW * 3 / 4); w = h * 4 / 3;
    } else {
      let s = Math.min(availW / G.W, availH / G.H);
      if (mode === 'PIXEL' && s >= 1) s = Math.floor(s);
      w = G.W * s; h = G.H * s;
    }
    canvas.style.width = Math.floor(w) + 'px';
    canvas.style.height = Math.floor(h) + 'px';
    btnGo.textContent = fsElement() ? 'EXIT FULL SCREEN' : 'FULL SCREEN';
  }

  btnGo.addEventListener('click', (e) => { e.currentTarget.blur(); toggleFs(); });
  btnMode.addEventListener('click', (e) => { e.currentTarget.blur(); setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]); });

  // F = full screen, V = scaling. Both are letters, so they are ignored while initials are typed.
  window.addEventListener('keydown', (e) => {
    if (e.repeat || (G.debug && G.debug.state === 'entry')) return;
    if (e.code === 'KeyF') toggleFs();
    else if (e.code === 'KeyV') setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
  });

  // runs after the game's own resize handler, so this sizing wins
  window.addEventListener('resize', layout);
  document.addEventListener('fullscreenchange', layout);
  document.addEventListener('webkitfullscreenchange', layout);

  // hide the buttons and the mouse pointer when the mouse sits still
  let idleT;
  function wake() {
    document.body.classList.remove('idle');
    clearTimeout(idleT); idleT = setTimeout(() => document.body.classList.add('idle'), 2500);
  }
  window.addEventListener('mousemove', wake);
  window.addEventListener('pointerdown', wake);
  wake();

  btnMode.textContent = LABEL[mode];
  layout();
  if (!canFs) say('Full screen is not available in this browser or frame.');
  else say('Press F for full screen, V to change scaling');
})(window.G);
