(function () {
  var el = document.querySelector('.flap');
  if (!el) return;
  var words = (el.getAttribute('data-words') || '').split('|').filter(Boolean);
  if (!words.length) return;
  el.textContent = ''; // clear the no-JS fallback word

  // Half-width ASCII by default; a CJK page passes a full-width pool via
  // data-glyphs so the riffle keeps the same column metrics as the word.
  var GLYPHS = el.getAttribute('data-glyphs') || '!<>-_/\\[]{}=+*#%&@?§¤±∆◊‡†≡░▒▓';
  var NBSP = ' ';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function ensureCells(n) {
    while (el.children.length < n) {
      var c = document.createElement('span');
      c.className = 'cell';
      c.setAttribute('aria-hidden', 'true');
      c.textContent = NBSP;
      el.appendChild(c);
    }
    while (el.children.length > n) el.removeChild(el.lastChild);
  }
  function show(ch) { return ch === ' ' ? NBSP : ch; }
  function setWord(w) {
    ensureCells(w.length);
    for (var i = 0; i < w.length; i++) {
      el.children[i].className = 'cell';
      el.children[i].textContent = show(w[i]);
    }
  }

  var wi = 0;
  setWord(words[0]);

  // Lock the paragraph to its tallest word so line-count changes
  // don't shift the vertically-centered layout. Measured across all
  // words (synchronously, so no flicker) and re-run on resize / fonts.
  var para = el.parentNode;
  function lockHeight() {
    if (!para) return;
    para.style.minHeight = '0px';
    var max = 0;
    for (var k = 0; k < words.length; k++) {
      setWord(words[k]);
      if (para.offsetHeight > max) max = para.offsetHeight;
    }
    setWord(words[wi]);
    para.style.minHeight = max + 'px';
  }
  var rt;
  function relock() { clearTimeout(rt); rt = setTimeout(lockHeight, 150); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(lockHeight);
  else lockHeight();
  window.addEventListener('resize', relock);

  if (reduce) {
    setInterval(function () { wi = (wi + 1) % words.length; setWord(words[wi]); }, 4500);
    return;
  }

  var STEP = 70;  // ms between glyph riffles
  var BASE = 6;   // min riffles before a column locks
  var busy = false;

  function scrambleTo(next) {
    busy = true;
    ensureCells(next.length);
    var pending = next.length;
    for (var i = 0; i < next.length; i++) {
      (function (i) {
        var cell = el.children[i];
        var target = next[i];
        var lock = BASE + i + (Math.random() * 2 | 0); // decode left -> right
        var n = 0;
        cell.className = 'cell scrambling';
        var t = setInterval(function () {
          n++;
          if (n >= lock) {
            clearInterval(t);
            cell.className = 'cell';
            cell.textContent = show(target);
            if (--pending === 0) busy = false;
          } else {
            cell.textContent = GLYPHS[(Math.random() * GLYPHS.length) | 0];
          }
        }, STEP);
      })(i);
    }
  }

  setInterval(function () {
    if (busy) return;
    wi = (wi + 1) % words.length;
    scrambleTo(words[wi]);
  }, 4500);
})();
