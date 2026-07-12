// PIN authentication — runs in <head> before body renders
// Authenticated sessions get data-lela-auth="1" on <html>, which CSS uses to hide the overlay.

(function () {
  var AUTH_KEY  = 'lela_v1';
  var PIN_HASH  = 'a8d0b6f0939cfd883251f62b265f971ef8a5ab97eee32b91460f08b965601d93';

  // ── Synchronous auth check ───────────────────────────────────────────────
  function storedAuth() {
    try { if (localStorage.getItem(AUTH_KEY) === '1') return true; } catch (_) {}
    return document.cookie.split(';').some(function (c) {
      return c.trim() === AUTH_KEY + '=1';
    });
  }

  function saveAuth() {
    try { localStorage.setItem(AUTH_KEY, '1'); } catch (_) {}
    var exp = 'Fri, 31 Dec 2099 23:59:59 GMT';
    document.cookie = AUTH_KEY + '=1; expires=' + exp + '; path=/; SameSite=Strict';
  }

  if (storedAuth()) {
    // Mark before body renders → CSS hides overlay with zero flash
    document.documentElement.setAttribute('data-lela-auth', '1');
    return;
  }

  // ── PIN UI — initialized after DOM is ready ──────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    var entered = '';
    var overlay = document.getElementById('pin-overlay');
    var card    = document.getElementById('pin-card');

    function dots() {
      document.querySelectorAll('.pin-dot').forEach(function (d, i) {
        d.classList.toggle('filled', i < entered.length);
      });
    }

    function shake() {
      card.classList.add('shake');
      setTimeout(function () { card.classList.remove('shake'); }, 500);
    }

    function dismiss() {
      saveAuth();
      document.documentElement.setAttribute('data-lela-auth', '1');
      overlay.classList.add('fading');
      setTimeout(function () { overlay.style.display = 'none'; }, 450);
    }

    async function verify() {
      var buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(entered));
      var hash = Array.from(new Uint8Array(buf))
                      .map(function (b) { return b.toString(16).padStart(2, '0'); })
                      .join('');
      if (hash === PIN_HASH) {
        dismiss();
      } else {
        shake();
        entered = '';
        dots();
      }
    }

    function addDigit(d) {
      if (entered.length >= 4) return;
      entered += d;
      dots();
      if (entered.length === 4) verify();
    }

    function del() {
      entered = entered.slice(0, -1);
      dots();
    }

    document.querySelectorAll('.pin-key[data-digit]').forEach(function (btn) {
      btn.addEventListener('click', function () { addDigit(this.dataset.digit); });
    });
    document.getElementById('pin-del').addEventListener('click', del);

    document.addEventListener('keydown', function (e) {
      if (e.key >= '0' && e.key <= '9') addDigit(e.key);
      if (e.key === 'Backspace') del();
    });
  });
})();
