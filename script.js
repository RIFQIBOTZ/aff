'use strict';

const KEY = 'sharelink-tracker-v1';
const M = { manual: 'Manual', gpt: 'IMAGE GPT', claude: 'IMAGE CLAUDE' };
const KEYS = Object.keys(M);
const MIN_LINKS = 30; // patokan kasar: di bawah ini sampel dianggap terlalu kecil
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const sum = arr => arr.reduce((a, b) => a + b, 0);
const num = (n, d = 1) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: d });
const zero = () => ({ manual: 0, gpt: 0, claude: 0 });

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
  save(); renderSesi();
}
function stop() {
  const a = S.active; if (!a) return;
  if (!confirm('Akhiri sesi ini dan simpan ke Riwayat?')) return;
  S.sessions.push({ id: a.id, start: a.startedAt, duration: elapsed(a), links: tapCounts(a), orders: zero() });
  S.active = null; save();
  renderSesi(); renderRiwayat(); showTab('riwayat');
}
function tap(m) {
  const a = S.active; if (!a || !a.resumedAt) return;
  a.taps.push({ m, t: Date.now() }); save(); renderSesi();
  if (navigator.vibrate) navigator.vibrate(10);
}
function undo() {
  const a = S.active; if (!a || !a.taps.length) return;
  a.taps.pop(); save(); renderSesi();
}

const RING = 2 * Math.PI * 136;
function setBtn(el, icon, text) { $('use', el).setAttribute('href', '#i-' + icon); $('span', el).textContent = text; }
function paintClock() {
  const a = S.active, ms = a ? elapsed(a) : 0;
  $('#clock').textContent = fmt(ms);
  $('#ring').style.strokeDashoffset = RING * (1 - (ms % 60000) / 60000);
}
function renderSesi() {
  const a = S.active, running = !!(a && a.resumedAt);
  paintClock();
  $('#status-text').textContent = !a ? 'Siap' : running ? 'Jalan' : 'Dijeda';
  $('#status').classList.toggle('live', running);
  $('#ring').classList.toggle('on', running);
  setBtn($('#btn-main'), running ? 'pause' : 'play', !a ? 'Mulai' : running ? 'Jeda' : 'Lanjut');
  $('#btn-stop').hidden = !a;
  const c = a ? tapCounts(a) : zero();
  KEYS.forEach(k => { $(`[data-n="${k}"]`).textContent = c[k]; });
  $$('.method').forEach(b => b.disabled = !running);
  $('#btn-undo').disabled = !a || !a.taps.length;
  $('#hint').textContent = !a ? 'Tekan Mulai, lalu ketuk metode setiap selesai posting satu sharelink'
    : running ? `${a.taps.length} sharelink di sesi ini` : 'Sesi dijeda, tekan Lanjut untuk mencatat lagi';
}
setInterval(() => { if (S.active && S.active.resumedAt) paintClock(); }, 200);
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderSesi(); });

/* ---------- riwayat ---------- */
const dayLinks = k => sum(S.sessions.filter(s => dayKey(s.start) === k).map(s => sum(KEYS.map(m => s.links[m]))));

function dayInfo(k) {
  const l = dayLinks(k), c = S.dayClicks[k];
  return `${l} sharelink tercatat` + (c != null && l ? `, ${num(c / l)} klik per sharelink` : '');
}

function sessionCard(s) {
  const rows = KEYS.map(k => `
    <div class="m">
      <span class="name">${M[k]}</span>
      <span class="n">${s.links[k]} link</span>
      <label><span>Pesanan</span><input type="number" inputmode="numeric" min="0" data-order="${k}" value="${s.orders[k]}" aria-label="Pesanan ${M[k]}"></label>
    </div>`).join('');
  return `<article class="sess" data-id="${s.id}">
    <div class="row"><strong>${clockOf(s.start)}</strong><span>${fmt(s.duration)}</span><button class="del" data-del aria-label="Hapus sesi"><svg class="ic"><use href="#i-trash"/></svg></button></div>
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
        <label class="clk">Klik Shopee
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
$('#riwayat').addEventListener('click', e => {
  if (!e.target.matches('[data-del]')) return;
  const id = e.target.closest('.sess').dataset.id;
  if (!confirm('Hapus sesi ini? Tidak bisa dibatalkan.')) return;
  S.sessions = S.sessions.filter(x => String(x.id) !== id);
  save(); renderRiwayat();
});

/* ---------- ringkasan ---------- */
function renderRingkasan() {
  const box = $('#ringkasan');
  if (!S.sessions.length) { box.innerHTML = '<p class="empty">Belum ada data. Selesaikan satu sesi, lalu isi pesanannya di Riwayat</p>'; return; }

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
  const max = Math.max(...KEYS.map(rate));
  // aksen hanya untuk yang unggul, dan hanya kalau minimal dua metode sudah punya sampel cukup
  const ok = KEYS.filter(k => t[k].links >= MIN_LINKS);
  const lead = ok.length > 1 ? ok.reduce((b, k) => rate(k) > rate(b) ? k : b) : null;

  const stats = `<div class="stats">
    <div class="stat"><span>Sharelink per jam</span><b>${hours > 0 ? num(links / hours) : '-'}</b></div>
    <div class="stat"><span>Pesanan</span><b>${orders}</b></div>
    <div class="stat"><span>Klik per sharelink</span><b>${clickLinks ? num(clicks / clickLinks) : '-'}</b></div>
  </div>`;

  const rows = KEYS.map(k => {
    const d = t[k], r = rate(k), w = max ? r / max : 0;
    return `<div class="rank">
      <div class="top"><span class="name">${M[k]}</span><b>${d.links ? num(r) : '-'}</b></div>
      <div class="bar"><i class="${k === lead && r > 0 ? 'lead' : ''}" style="transform:scaleX(${w})"></i></div>
      <p class="meta">${d.links} link, ${d.orders} pesanan, ${d.sess} sesi${d.links < MIN_LINKS ? `<span>Sampel kecil, di bawah ${MIN_LINKS} link belum layak dibandingkan</span>` : ''}</p>
    </div>`;
  }).join('');

  box.innerHTML = stats + `<div class="rank-card"><h3>Pesanan per 100 sharelink</h3>${rows}</div>` +
    `<p class="note">Klik Shopee tidak bisa dipecah per tag, jadi hanya pesanan yang dibandingkan antar metode. Pesanan tanpa tag dihitung Manual, sehingga pesanan dari postingan lama yang tidak tercatat ikut masuk Manual dan bisa membuatnya tampak lebih bagus dari aslinya. Kalau klik harian belum diisi, klik per sharelink kosong.</p>`;
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
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!d || !Array.isArray(d.sessions)) throw new Error('format');
      if (!confirm(`Ganti semua data sekarang dengan isi file ini (${d.sessions.length} sesi)?`)) return;
      S = normalize(d); save(); renderAll();
    } catch (e) { alert('File tidak valid. Pakai file hasil Ekspor JSON dari halaman ini.'); }
  };
  r.readAsText(file);
}

/* ---------- tab dan event ---------- */
function showTab(name) {
  $$('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  ['sesi', 'riwayat', 'ringkasan'].forEach(n => { $(`#tab-${n}`).hidden = n !== name; });
  const sec = $(`#tab-${name}`); sec.classList.remove('enter'); void sec.offsetWidth; sec.classList.add('enter');
  if (name === 'riwayat') renderRiwayat();
  if (name === 'ringkasan') renderRingkasan();
}
function renderAll() { renderSesi(); renderRiwayat(); renderRingkasan(); }

$$('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
$('#btn-main').addEventListener('click', startOrToggle);
$('#btn-stop').addEventListener('click', stop);
$('#btn-undo').addEventListener('click', undo);
$$('.method').forEach(b => b.addEventListener('click', () => tap(b.dataset.m)));
$('#btn-export').addEventListener('click', exportJSON);
$('#btn-import').addEventListener('click', () => $('#file-import').click());
$('#file-import').addEventListener('change', e => { importJSON(e.target.files[0]); e.target.value = ''; });

renderAll();
