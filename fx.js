'use strict';
/* Efek tampilan saja: getar HP, animasi angka, dan penutup otomatis menu di HP.
   Tidak menyentuh data atau logika script.js. Kalau file ini dihapus, aplikasi tetap berfungsi penuh. */
(function () {
  try {
    const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.querySelectorAll('[data-n]').forEach(el => {
      let last = el.textContent;
      new MutationObserver(() => {
        if (el.textContent === last) return;
        last = el.textContent;
        if (calm()) return;
        el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });

    document.querySelectorAll('.method').forEach(b =>
      b.addEventListener('pointerdown', () => { if (!b.disabled && navigator.vibrate) navigator.vibrate(12); })
    );

    const toggle = document.getElementById('nav-toggle');
    if (toggle) {
      document.querySelectorAll('.tabs button').forEach(b =>
        b.addEventListener('click', () => { toggle.checked = false; window.scrollTo(0, 0); })
      );
      document.addEventListener('keydown', e => { if (e.key === 'Escape') toggle.checked = false; });
    }
  } catch (e) { /* efek opsional */ }
})();
