'use strict';
/* Efek tampilan saja: riak + "+1" melayang saat tap, getar HP, animasi angka, scroll ke atas saat pindah tab, dan navigasi keyboard tab (panah, Home, End).
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

    const spawn = (btn, cls, text, x, y) => {
      const el = document.createElement('i');
      el.className = cls; el.setAttribute('aria-hidden', 'true');
      if (text) el.textContent = text;
      el.style.left = x + 'px'; el.style.top = y + 'px';
      el.addEventListener('animationend', () => el.remove(), { once: true });
      btn.appendChild(el);
    };
    document.querySelectorAll('.method').forEach(b =>
      b.addEventListener('pointerdown', e => {
        if (b.disabled) return;
        if (navigator.vibrate) navigator.vibrate(12);
        if (calm()) return;
        const r = b.getBoundingClientRect();
        spawn(b, 'ripple', '', e.clientX - r.left, e.clientY - r.top);
        spawn(b, 'plus1', '+1', r.width - 52, r.height / 2 - 6);
      })
    );

    document.querySelectorAll('.tabs button').forEach(b =>
      b.addEventListener('click', () => {
        if (navigator.vibrate) navigator.vibrate(8);
        window.scrollTo({ top: 0, behavior: calm() ? 'auto' : 'smooth' });
      })
    );

    // Pola ARIA tabs: hanya tab aktif yang masuk urutan Tab (roving tabindex); panah/Home/End memindahkan tab.
    const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
    const syncTabs = () => tabs.forEach(t => { t.tabIndex = t.getAttribute('aria-selected') === 'true' ? 0 : -1; });
    syncTabs();
    tabs.forEach(t => new MutationObserver(syncTabs).observe(t, { attributes: true, attributeFilter: ['aria-selected'] }));
    const list = document.querySelector('.tabs');
    if (list) list.addEventListener('keydown', e => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const j = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length
        : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
      if (j < 0) return;
      e.preventDefault(); tabs[j].focus(); tabs[j].click();
    });
  } catch (e) { /* efek opsional */ }
})();
