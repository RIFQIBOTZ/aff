'use strict';
/* Efek tampilan saja (getar + animasi angka). Tidak menyentuh data atau logika script.js.
   Kalau file ini dihapus, aplikasi tetap berfungsi penuh. */
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
  } catch (e) { /* efek opsional */ }
})();
