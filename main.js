(() => {
  const deck = document.getElementById('deck');
  const rail = document.getElementById('rail');
  const panels = [...deck.querySelectorAll('.panel')];
  const segs = [...rail.querySelectorAll('.rail__seg')];
  const wordmark = document.querySelector('.wordmark');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const pageH = () => deck.clientHeight;
  const current = () => clamp(Math.round(deck.scrollTop / pageH()), 0, panels.length - 1);

  document.getElementById('year').textContent = new Date().getFullYear();

  /* ---------- Przejście do sekcji ---------- */

  const SETTLE_MS = 140;  // ms bez scrolla = przewijanie skończone

  let target = 0;
  let navigating = false;
  let settleTimer;

  const scrollToTarget = () => deck.scrollTo({
    top: target * pageH(),
    behavior: reduced.matches ? 'auto' : 'smooth',
  });

  function goTo(i) {
    target = clamp(i, 0, panels.length - 1);
    navigating = true;
    lockedAt = performance.now();
    scrollToTarget();
    armSettle(); // gdy cel = obecna sekcja, nie będzie żadnego zdarzenia scroll
  }

  function armSettle() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, SETTLE_MS);
  }

  function settle() {
    const arrived = Math.abs(deck.scrollTop - target * pageH()) < 2;
    if (navigating && !arrived && !isTouchScroll()) {
      scrollToTarget(); // bezwładność przerwała przejście, dokańczamy je
      return;
    }
    navigating = false;
    target = current();
  }

  /* ---------- Pasek + stan sekcji ---------- */

  function sync() {
    const max = deck.scrollHeight - pageH();
    const progress = max > 0 ? clamp(deck.scrollTop / max, 0, 1) : 0;
    rail.style.setProperty('--p', progress.toFixed(4));

    const active = current();
    segs.forEach((seg, i) => {
      if (i === active) seg.setAttribute('aria-current', 'true');
      else seg.removeAttribute('aria-current');
    });

    // Obie sekcje widoczne w trakcie przewijania, inaczej przy swipe'ie
    // wjeżdżałaby pusta sekcja i treść pojawiałaby się dopiero w połowie.
    const pos = deck.scrollTop / pageH();
    [Math.floor(pos), Math.ceil(pos)].forEach((i) => panels[i]?.classList.add('is-seen'));
  }

  /* ---------- Scroll, który nie przeszedł przez nasz handler kółka ----------
     Nad odtwarzaczem SoundCloud zdarzenia wheel trafiają do iframe'a, a do
     strony dochodzi tylko sam scroll. Snap cofnąłby go do tej samej sekcji,
     więc każde takie przesunięcie zamieniamy w przejście o jedną sekcję.
     Dotyk zostaje natywny: tam snap robi dokładnie to, co trzeba. */

  const FINE_POINTER = matchMedia('(hover: hover) and (pointer: fine)');
  const TOUCH_GRACE = 1500; // ms: po puszczeniu palca trwa jeszcze bezwładność

  let touching = false;
  let lastTouch = -Infinity;
  const onTouch = (active) => () => { touching = active; lastTouch = performance.now(); };
  addEventListener('touchstart', onTouch(true), { passive: true });
  addEventListener('touchend', onTouch(false), { passive: true });
  addEventListener('touchcancel', onTouch(false), { passive: true });

  const isTouchScroll = () => touching || performance.now() - lastTouch < TOUCH_GRACE;

  deck.addEventListener('scroll', () => {
    requestAnimationFrame(sync);
    armSettle();

    if (navigating || !FINE_POINTER.matches || isTouchScroll()) return;
    const drift = deck.scrollTop - target * pageH();
    if (Math.abs(drift) > 6) goTo(target + Math.sign(drift));
  }, { passive: true });

  /* ---------- Kółko / trackpad: jeden gest = jedna sekcja ----------
     Touchpad po puszczeniu palców wysyła jeszcze przez ok. sekundę
     wygasające zdarzenia. Blokada trzyma do końca animacji, a potem
     zwalnia się po ciszy albo gdy delta wyraźnie rośnie, czyli gdy
     zaczął się nowy gest. */

  const MIN_LOCK = 520;   // ms: czas samego przejścia
  const MAX_LOCK = 1500;  // ms: bezpiecznik
  const QUIET = 120;      // ms bez zdarzeń = koniec gestu

  let lockedAt = -Infinity;
  let lastEvent = -Infinity;
  let lastDelta = 0;

  deck.addEventListener('wheel', (e) => {
    if (e.ctrlKey) return; // pinch-zoom
    e.preventDefault();

    const now = performance.now();
    const delta = Math.abs(e.deltaY);
    const sinceLock = now - lockedAt;
    const quiet = now - lastEvent > QUIET;
    const rising = delta > lastDelta * 1.5 && delta > 24;
    lastEvent = now;
    lastDelta = delta;

    if (delta < 4) return;
    const free = sinceLock > MAX_LOCK || (sinceLock > MIN_LOCK && (quiet || rising));
    if (!free) return;

    lockedAt = now;
    goTo(current() + Math.sign(e.deltaY));
  }, { passive: false });

  /* ---------- Klawiatura ---------- */

  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const step = {
      ArrowDown: 1, ArrowRight: 1, PageDown: 1, ' ': e.shiftKey ? -1 : 1,
      ArrowUp: -1, ArrowLeft: -1, PageUp: -1,
    }[e.key];

    if (step) goTo(current() + step);
    else if (e.key === 'Home') goTo(0);
    else if (e.key === 'End') goTo(panels.length - 1);
    else return;
    e.preventDefault();
  });

  /* ---------- Linki wewnętrzne (pasek, „Na górę") ---------- */

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const i = panels.findIndex((p) => `#${p.id}` === a.getAttribute('href'));
    if (i < 0) return;
    e.preventDefault();
    goTo(i);
  });

  /* ---------- Wordmark na pełną szerokość kolumny ---------- */

  function fitWordmark() {
    const box = wordmark.parentElement.clientWidth;
    // Ograniczenie wysokością, żeby napis nie zjadł ekranu w poziomie na telefonie.
    const maxSize = innerHeight * 0.42;
    wordmark.style.fontSize = '100px';
    const range = document.createRange();
    range.selectNodeContents(wordmark);
    const textW = range.getBoundingClientRect().width;
    wordmark.style.fontSize = `${Math.min(maxSize, (100 * box) / textW)}px`;
  }

  fitWordmark();
  if (document.fonts?.ready) document.fonts.ready.then(fitWordmark);

  /* ---------- Resize: trzymamy się bieżącej sekcji ---------- */

  let resizeFrame;
  addEventListener('resize', () => {
    const i = target;
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      fitWordmark();
      deck.scrollTo({ top: i * pageH(), behavior: 'auto' });
      sync();
    });
  });

  /* ---------- Start (także z linku z #kotwicą) ---------- */

  const fromHash = panels.findIndex((p) => `#${p.id}` === location.hash);
  if (fromHash > 0) {
    target = fromHash;
    deck.scrollTo({ top: fromHash * pageH(), behavior: 'auto' });
  }
  sync();
})();
