'use strict';

const KEY = 'sharelink-tracker-v1';
const M = { manual: 'Manual', gpt: 'IMAGE GPT', claude: 'IMAGE CLAUDE' };
const KEYS = Object.keys(M);
const MIN_LINKS = 30; // patokan kasar: di bawah ini sampel dianggap terlalu kecil
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const TITLES = { sesi: 'Sesi', riwayat: 'Riwayat', ringkasan: 'Ringkasan' };
const SUBS = {
  sesi: 'Catat sharelink yang kamu posting, lengkap dengan stopwatch',
  riwayat: 'Isi pesanan dan klik harian tiap sesi',
  ringkasan: 'Bandingkan hasil tiap metode posting'
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const sum = arr => arr.reduce((a, b) => a + b, 0);
const num = (n, d = 1) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: d });
const zero = () => ({ manual: 0, gpt: 0, claude: 0 });
const icon = id => `<svg class="ic" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* abaikan */ } };

/* ---------- data ---------- */
function normalize(d) {
  const clean = v => { const o = zero(); KEYS.forEach(k => o[k] = Math.max(0, parseInt(v && v[k], 10) || 0)); return o; };
  return {
    active: d && d.active && Array.isArray(d.active.taps) ? d.active : null,
    sessions: (d && Array.isArray(d.sessions) ? d.sessions : []).map(s => ({
      id: s.id || Date.now() + Math.random(),
      start: +s.start || 0,
      duration: +s.duration || 0,
      links: clean(s.links),
      orders: clean(s.orders)
    })),
    dayClicks: (d && d.dayClicks && typeof d.dayClicks === 'object') ? d.dayClicks : {}
  };
}
function load() {
  try { return normalize(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return normalize(null); }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage penuh atau diblokir */ } }
let S = load();

/* ---------- ui helpers: dialog konfirmasi + toast ---------- */
const dlg = $('#dlg');
function ask(message, okLabel = 'OK', danger = false) {
  if (!dlg || typeof dlg.showModal !== 'function') return Promise.resolve(confirm(message));
  $('#dlg-msg').textContent = message;
  const ok = $('#dlg-ok');
  ok.textContent = okLabel;
  ok.classList.toggle('danger', danger);
  ok.classList.toggle('primary', !danger);
  return new Promise(res => {
    dlg.returnValue = 'cancel';
    dlg.addEventListener('close', () => res(dlg.returnValue === 'ok'), { once: true });
    dlg.showModal();
  });
}
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- format waktu ---------- */
const fmt = ms => { const s = Math.floor(ms / 1000); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}`; };
const clockOf = ms => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dayKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dayLabel = k => { const [y, m, d] = k.split('-').map(Number); return `${DAYS[new Date(y, m - 1, d).getDay()]}, ${pad(d)}-${pad(m)}-${y}`; };

/* ---------- stopwatch (berbasis timestamp, akurat saat HP lock) ---------- */
const elapsed = (a, now = Date.now()) => a.acc + (a.resumedAt ? now - a.resumedAt : 0);
const tapCounts = a => { const c = zero(); a.taps.forEach(t => c[t.m]++); return c; };

function startOrToggle() {
  const now = Date.now(), a = S.active;
  if (!a) S.active = { id: now, startedAt: now, acc: 0, resumedAt: now, taps: [] };
  else if (a.resumedAt) { a.acc = elapsed(a, now); a.resumedAt = null; }
  else a.resumedAt = now;
  save(); renderSesi(); buzz(15);
}
async function stop() {
  const a = S.active; if (!a) return;
  if (!(await ask('Akhiri sesi ini dan simpan ke Riwayat?', 'Selesai'))) return;
  if (S.active !== a) return;
  S.sessions.push({ id: a.id, start: a.startedAt, duration: elapsed(a), links: tapCounts(a), orders: zero() });
  S.active = null; save();
  renderSesi(); renderRiwayat(); showTab('riwayat');
  toast('Sesi tersimpan');
}
function tap(m) {
  const a = S.active; if (!a || !a.resumedAt) return;
  a.taps.push({ m, t: Date.now() }); save(); renderSesi(); buzz(10);
  const el = $(`.method[data-m="${m}"]`);
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}
function undo() {
  const a = S.active; if (!a || !a.taps.length) return;
  const last = a.taps.pop(); save(); renderSesi();
  toast(`${M[last.m]} dibatalkan`);
}

function renderSesi() {
  const a = S.active, running = !!(a && a.resumedAt);
  const state = !a ? 'Belum jalan' : running ? 'Jalan' : 'Dijeda';
  $('#clock').textContent = fmt(a ? elapsed(a) : 0);
  $('#status').textContent = state;
  $('#pill').className = 'pill' + (running ? ' run' : a ? ' pause' : '');
  $('#hero').classList.toggle('run', running);
  const label = !a ? 'Mulai' : running ? 'Jeda' : 'Lanjut';
  $('#btn-main').innerHTML = `${icon(running ? 'pause' : 'play')}<span>${label}</span>`;
  $('#btn-stop').hidden = !a;
  const c = a ? tapCounts(a) : zero();
  KEYS.forEach(k => { $(`[data-n="${k}"]`).textContent = c[k]; });
  $$('.method').forEach(b => b.disabled = !running);
  $('#btn-undo').disabled = !a || !a.taps.length;
  $('#hero-total').textContent = a ? a.taps.length : 0;
  updateRate();
  $('#hint').textContent = !a
    ? 'Tekan Mulai, lalu tap metode tiap kali selesai posting satu sharelink.'
    : running ? `Total ${a.taps.length} sharelink di sesi ini.` : 'Sesi dijeda. Tekan Lanjut untuk mencatat lagi.';
}
function updateRate() {
  const a = S.active, ms = a ? elapsed(a) : 0;
  $('#hero-rate').textContent = a && a.taps.length && ms >= 60000 ? num(a.taps.length / (ms / 3600000)) : '-';
}
setInterval(() => {
  if (S.active && S.active.resumedAt) { $('#clock').textContent = fmt(elapsed(S.active)); updateRate(); }
}, 200);
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderSesi(); });

/* ---------- riwayat ---------- */
const dayLinks = k => sum(S.sessions.filter(s => dayKey(s.start) === k).map(s => sum(KEYS.map(m => s.links[m]))));

function dayInfo(k) {
  const l = dayLinks(k), c = S.dayClicks[k];
  const r = c != null && l ? ` Klik per sharelink: ${num(c / l)}.` : '';
  return `${l} sharelink tercatat.${r}`;
}

function sessionCard(s) {
  const rows = KEYS.map(k => `
    <div class="m ${k}">
      <span class="name">${M[k]}</span>
      <span class="n">${s.links[k]} link</span>
      <label>Pesanan <input type="number" inputmode="numeric" min="0" aria-label="Pesanan ${M[k]}" data-order="${k}" value="${s.orders[k]}"></label>
    </div>`).join('');
  return `<article class="sess" data-id="${s.id}">
    <div class="row"><strong>${clockOf(s.start)}</strong><span>${fmt(s.duration)}</span><button class="del" data-del aria-label="Hapus sesi">${icon('trash')}Hapus</button></div>
    ${rows}</article>`;
}

function renderRiwayat() {
  const box = $('#riwayat');
  if (!S.sessions.length) {
    box.innerHTML = '<p class="empty">Belum ada sesi. Selesaikan satu sesi di tab Sesi, hasilnya muncul di sini dan bisa kamu isi pesanannya.</p>';
    return;
  }
  const groups = {};
  S.sessions.forEach(s => (groups[dayKey(s.start)] = groups[dayKey(s.start)] || []).push(s));
  box.innerHTML = Object.keys(groups).sort().reverse().map(k => {
    const list = groups[k].sort((a, b) => b.start - a.start);
    const c = S.dayClicks[k];
    return `<section class="day" data-day="${k}">
      <header>
        <h3>${dayLabel(k)}</h3>
        <label class="clk">Total klik hari ini dari Shopee
          <input type="number" inputmode="numeric" min="0" data-clicks placeholder="isi" value="${c != null ? c : ''}"></label>
        <p class="dim" data-info>${dayInfo(k)}</p>
      </header>
      ${list.map(sessionCard).join('')}
    </section>`;
  }).join('');
}

$('#riwayat').addEventListener('change', e => {
  const inp = e.target, day = inp.closest('.day');
  if (!day) return;
  const k = day.dataset.day;
  if (inp.matches('[data-clicks]')) {
    const v = parseInt(inp.value, 10);
    if (isNaN(v) || v < 0) delete S.dayClicks[k]; else S.dayClicks[k] = v;
    save(); $('[data-info]', day).textContent = dayInfo(k);
  } else if (inp.matches('[data-order]')) {
    const s = S.sessions.find(x => String(x.id) === inp.closest('.sess').dataset.id);
    if (!s) return;
    s.orders[inp.dataset.order] = Math.max(0, parseInt(inp.value, 10) || 0);
    inp.value = s.orders[inp.dataset.order];
    save();
  }
});
$('#riwayat').addEventListener('click', async e => {
  const btn = e.target.closest('[data-del]');
  if (!btn) return;
  const id = btn.closest('.sess').dataset.id;
  if (!(await ask('Hapus sesi ini? Tidak bisa dibatalkan.', 'Hapus', true))) return;
  S.sessions = S.sessions.filter(x => String(x.id) !== id);
  save(); renderRiwayat(); toast('Sesi dihapus');
});

/* ---------- ringkasan ---------- */
function renderRingkasan() {
  const box = $('#ringkasan');
  if (!S.sessions.length) { box.innerHTML = '<p class="empty">Belum ada data untuk diringkas.</p>'; return; }

  const t = {}; KEYS.forEach(k => t[k] = { links: 0, orders: 0, sess: 0 });
  let ms = 0;
  S.sessions.forEach(s => {
    ms += s.duration;
    KEYS.forEach(k => { t[k].links += s.links[k]; t[k].orders += s.orders[k]; if (s.links[k]) t[k].sess++; });
  });
  const links = sum(KEYS.map(k => t[k].links)), orders = sum(KEYS.map(k => t[k].orders));
  const hours = ms / 3600000;

  let clicks = 0, clickLinks = 0;
  Object.keys(S.dayClicks).forEach(d => { const l = dayLinks(d); if (l) { clicks += S.dayClicks[d]; clickLinks += l; } });

  const rate = k => t[k].links ? t[k].orders / t[k].links * 100 : 0;
  const maxRate = Math.max(...KEYS.map(rate), 0);

  const sc = (c, label, val, small = '') => `<div class="stat-card ${c}"><div class="stat-label">${label}</div><div class="stat-value">${val}</div>${small}</div>`;
  const all = `<div class="kpis">
    ${sc('c1', 'Jumlah sesi', S.sessions.length)}
    ${sc('c2', 'Total durasi', fmt(ms))}
    ${sc('c3', 'Sharelink', links)}
    ${sc('c4', 'Sharelink per jam', hours > 0 ? num(links / hours) : '-')}
    ${sc('c5', 'Pesanan', orders)}
    ${sc('c6', 'Klik per sharelink', clickLinks ? num(clicks / clickLinks) : '-', clickLinks ? '' : '<small>isi klik harian dulu</small>')}
  </div>`;

  const per = KEYS.map(k => {
    const d = t[k], small = d.links < MIN_LINKS;
    const w = maxRate > 0 ? rate(k) / maxRate * 100 : 0;
    return `<div class="card ${k}"><h3>${M[k]}</h3>
      <div class="stat"><span>Sharelink</span><b>${d.links}</b></div>
      <div class="stat"><span>Jumlah sesi memakai metode ini</span><b>${d.sess}</b></div>
      <div class="stat"><span>Pesanan</span><b>${d.orders}</b></div>
      <div class="stat hl"><span>Pesanan per 100 sharelink</span><b>${d.links ? num(rate(k)) : '-'}</b></div>
      <div class="bar" aria-hidden="true"><i style="width:${w}%"></i></div>
      ${small ? `<p class="warn">${icon('alert')}<span>Baru ${d.links} sharelink. Di bawah ${MIN_LINKS}, angkanya masih naik-turun dan belum layak dibandingkan.</span></p>` : ''}
    </div>`;
  }).join('');

  box.innerHTML = all + per + `<p class="note">Yang dibandingkan antar metode hanya pesanan per sharelink, karena klik Shopee tidak bisa dipecah per tag. Pesanan tanpa tag dihitung Manual, jadi pesanan dari postingan lama yang tidak tercatat di sini ikut masuk Manual dan bisa membuatnya tampak lebih bagus dari aslinya.</p>`;
}

/* ---------- ekspor dan impor ---------- */
function exportJSON() {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sharelink-tracker-${dayKey(Date.now())}.json`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function importJSON(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = async () => {
    let d;
    try {
      d = JSON.parse(r.result);
      if (!d || !Array.isArray(d.sessions)) throw new Error('format');
    } catch (e) { toast('File tidak valid. Pakai file hasil Ekspor JSON dari halaman ini.'); return; }
    if (!(await ask(`Ganti semua data sekarang dengan isi file ini (${d.sessions.length} sesi)?`, 'Ganti data', true))) return;
    S = normalize(d); save(); renderAll(); toast('Data diimpor');
  };
  r.readAsText(file);
}

/* ---------- tab dan event ---------- */
function showTab(name) {
  $$('.sidebar-item').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  ['sesi', 'riwayat', 'ringkasan'].forEach(n => { $(`#tab-${n}`).hidden = n !== name; });
  $('#title').textContent = TITLES[name];
  $('#subtitle').textContent = SUBS[name];
  closeMenu();
  if (name === 'riwayat') renderRiwayat();
  if (name === 'ringkasan') renderRingkasan();
  window.scrollTo(0, 0);
}
/* ---------- sidebar (geser di HP, tetap terbuka di layar lebar) ---------- */
const side = $('#sidebar'), scrim = $('#scrim'), burger = $('#btn-menu');
function openMenu() {
  side.classList.add('open'); scrim.hidden = false; burger.setAttribute('aria-expanded', 'true');
  const cur = $('.sidebar-item[aria-selected="true"]'); cur && cur.focus();
}
function closeMenu() {
  if (!side.classList.contains('open')) return;
  const hadFocus = side.contains(document.activeElement);
  side.classList.remove('open'); scrim.hidden = true; burger.setAttribute('aria-expanded', 'false');
  if (hadFocus) burger.focus();
}
burger.addEventListener('click', openMenu);
$('#btn-close').addEventListener('click', closeMenu);
scrim.addEventListener('click', closeMenu);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !dlg.open) closeMenu(); });

function renderAll() { renderSesi(); renderRiwayat(); renderRingkasan(); }

$$('.sidebar-item').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
$('#btn-main').addEventListener('click', startOrToggle);
$('#btn-stop').addEventListener('click', stop);
$('#btn-undo').addEventListener('click', undo);
$$('.method').forEach(b => b.addEventListener('click', () => tap(b.dataset.m)));
$('#btn-export').addEventListener('click', exportJSON);
$('#btn-import').addEventListener('click', () => $('#file-import').click());
$('#file-import').addEventListener('change', e => { importJSON(e.target.files[0]); e.target.value = ''; });

renderAll();
