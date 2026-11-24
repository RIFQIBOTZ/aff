'use strict';

const KEY = 'sharelink-tracker-v1';
const M = { manual: 'Manual', gpt: 'IMAGE GPT', claude: 'IMAGE CLAUDE' };
const KEYS = Object.keys(M);
const MIN_LINKS = 30; // patokan kasar: di bawah ini sampel dianggap terlalu kecil
const IDLE_MIN = 20; // menit tanpa catatan sharelink sebelum muncul peringatan
const MAX_EDIT_MS = 24 * 3600000;
const LABEL = { start: 'Mulai', pause: 'Jeda', resume: 'Lanjut', stop: 'Selesai', edit: 'Edit waktu' };
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const sum = arr => arr.reduce((a, b) => a + b, 0);
const num = (n, d = 1) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: d });
const zero = () => ({ manual: 0, gpt: 0, claude: 0 });

/* ---------- data ---------- */
function cleanLog(l) {
  return (Array.isArray(l) ? l : []).filter(x => x && typeof x.e === 'string' && isFinite(+x.t)).map(x => {
    const o = { e: x.e, t: +x.t, d: +x.d || 0 };
    if (x.from != null) o.from = +x.from;
    if (x.to != null) o.to = +x.to;
    return o;
  });
}
function normalize(d) {
  const clean = v => { const o = zero(); KEYS.forEach(k => o[k] = Math.max(0, parseInt(v && v[k], 10) || 0)); return o; };
  const active = d && d.active && Array.isArray(d.active.taps) ? d.active : null;
  if (active) {
    active.log = cleanLog(active.log);
    if (!active.log.length) active.log.push({ e: 'start', t: active.startedAt, d: 0 });
  }
  return {
    active,
    sessions: (d && Array.isArray(d.sessions) ? d.sessions : []).map(s => ({
      id: s.id || Date.now() + Math.random(),
      start: +s.start || 0,
      duration: +s.duration || 0,
      links: clean(s.links),
      orders: clean(s.orders),
      log: cleanLog(s.log)
    })),
    dayClicks: (d && d.dayClicks && typeof d.dayClicks === 'object') ? d.dayClicks : {}
  };
}
function load() {
  try { return normalize(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return normalize(null); }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage penuh atau diblokir */ } }
let S = load();
// Baca ulang data terbaru dari penyimpanan sebelum tiap aksi, supaya tab lama tidak menimpa tab baru.
function sync() { try { const raw = localStorage.getItem(KEY); if (raw) S = normalize(JSON.parse(raw)); } catch (e) { /* pakai data di memori */ } }

/* ---------- format waktu ---------- */
const fmt = ms => { const s = Math.floor(ms / 1000); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}`; };
const clockOf = ms => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dayKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const wibFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const wib = ms => { const p = {}; wibFmt.formatToParts(ms).forEach(x => { p[x.type] = x.value; }); return `${p.day}-${p.month} ${p.hour}:${p.minute}:${p.second}`; };
const dayLabel = k => { const [y, m, d] = k.split('-').map(Number); return `${DAYS[new Date(y, m - 1, d).getDay()]}, ${pad(d)}-${pad(m)}-${y}`; };

/* ---------- stopwatch (berbasis timestamp, akurat saat HP lock) ---------- */
const elapsed = (a, now = Date.now()) => a.acc + (a.resumedAt ? now - a.resumedAt : 0);
const tapCounts = a => { const c = zero(); a.taps.forEach(t => c[t.m]++); return c; };

const logEv = (a, e, t, extra) => a.log.push(Object.assign({ e, t, d: elapsed(a, t) }, extra || {}));
let idleSnooze = 0;

function doPause(a, now) { a.acc = elapsed(a, now); a.resumedAt = null; logEv(a, 'pause', now); }
function mainAction() {
  sync();
  const a = S.active, now = Date.now();
  const cur = !a ? 'start' : a.resumedAt ? 'pause' : 'resume';
  if ($('#btn-main').dataset.act !== cur) { renderSesi(); return; } // tampilan usang (tab lain): segarkan saja, jangan membalik status
  if (cur === 'start') { S.active = { id: now, startedAt: now, acc: 0, resumedAt: now, taps: [], log: [] }; logEv(S.active, 'start', now); }
  else if (cur === 'pause') doPause(a, now);
  else { a.resumedAt = now; logEv(a, 'resume', now); }
  idleSnooze = 0; save(); renderSesi();
}
function idlePause() {
  sync();
  const a = S.active;
  if (a && a.resumedAt) { doPause(a, Date.now()); save(); }
  renderSesi();
}
function stop() {
  sync();
  if (!S.active) { renderSesi(); return; }
  if (!confirm('Akhiri sesi ini dan simpan ke Riwayat?')) return;
  if (finishSession()) { renderRiwayat(); showTab('riwayat'); }
}
function finishSession() {
  sync();
  const a = S.active; if (!a) { renderSesi(); return false; }
  const now = Date.now();
  logEv(a, 'stop', now);
  S.sessions.push({ id: a.id, start: a.startedAt, duration: elapsed(a, now), links: tapCounts(a), orders: zero(), log: a.log });
  S.active = null; save(); renderSesi();
  return true;
}
function tap(m) {
  sync();
  const a = S.active; if (!a || !a.resumedAt) { renderSesi(); return; }
  a.taps.push({ m, t: Date.now() }); idleSnooze = 0; save(); renderSesi();
}
function undo() {
  sync();
  const a = S.active; if (!a || !a.taps.length) return;
  a.taps.pop(); save(); renderSesi();
}

/* ---------- log waktu (WIB) ---------- */
function logHTML(log) {
  if (!log || !log.length) return '<li><b>Belum ada catatan</b></li>';
  return log.map(x => `<li class="${x.e}"><b>${LABEL[x.e] || x.e}</b><time>${wib(x.t)}</time><span>${x.e === 'edit' ? `${fmt(x.from)} jadi ${fmt(x.to)}` : `durasi ${fmt(x.d)}`}</span></li>`).join('');
}

/* ---------- peringatan idle ---------- */
const lastActivity = a => Math.max(a.taps.length ? a.taps[a.taps.length - 1].t : 0, a.resumedAt || 0, a.startedAt || 0);
function checkIdle() {
  const a = S.active, now = Date.now(), box = $('#idle');
  const idle = !!(a && a.resumedAt) && now - Math.max(lastActivity(a), idleSnooze) >= IDLE_MIN * 60000;
  box.hidden = !idle;
  if (idle) $('#idle-text').textContent = `Sudah ${Math.floor((now - lastActivity(a)) / 60000)} menit tanpa catatan sharelink baru, timer masih jalan. Lupa jeda?`;
}

/* ---------- edit waktu ---------- */
let editTarget = null; // 'active' atau id sesi
const findSess = id => S.sessions.find(x => String(x.id) === String(id));
function openEdit(target) {
  sync();
  const ms = target === 'active' ? (S.active ? elapsed(S.active) : null) : (findSess(target) || {}).duration;
  if (ms == null) return;
  editTarget = target;
  const s = Math.floor(ms / 1000);
  $('#e-h').value = Math.floor(s / 3600); $('#e-m').value = Math.floor(s % 3600 / 60); $('#e-s').value = s % 60;
  $('#edit-err').textContent = '';
  $('#dlg-edit').showModal();
}
function submitEdit(e) {
  e.preventDefault();
  const v = id => { const raw = $(id).value.trim(); return raw === '' ? 0 : Number(raw); };
  const h = v('#e-h'), m = v('#e-m'), s = v('#e-s');
  if (![h, m, s].every(n => Number.isInteger(n) && n >= 0) || m > 59 || s > 59) { $('#edit-err').textContent = 'Isi angka bulat. Menit dan detik maksimal 59.'; return; }
  const ms = ((h * 60 + m) * 60 + s) * 1000;
  if (ms > MAX_EDIT_MS) { $('#edit-err').textContent = 'Maksimal 24 jam.'; return; }
  sync();
  const now = Date.now();
  if (editTarget === 'active') {
    const a = S.active; if (!a) { $('#dlg-edit').close(); renderSesi(); return; }
    const from = elapsed(a, now);
    a.acc = ms; a.resumedAt = a.resumedAt ? now : null;
    logEv(a, 'edit', now, { from, to: ms });
  } else {
    const t = findSess(editTarget); if (!t) { $('#dlg-edit').close(); renderRiwayat(); return; }
    t.log = t.log || [];
    t.log.push({ e: 'edit', t: now, d: ms, from: t.duration, to: ms });
    t.duration = ms;
  }
  save(); $('#dlg-edit').close(); renderSesi(); renderRiwayat(); renderRingkasan();
}

function renderSesi() {
  const a = S.active, running = !!(a && a.resumedAt);
  $('#clock').textContent = fmt(a ? elapsed(a) : 0);
  $('#status').textContent = !a ? 'Belum jalan' : running ? 'Jalan' : 'Dijeda';
  $('#btn-main').textContent = !a ? 'Mulai' : running ? 'Jeda' : 'Lanjut';
  $('#btn-main').dataset.act = !a ? 'start' : running ? 'pause' : 'resume';
  $('#btn-stop').hidden = !a; $('#btn-edit').hidden = !a; $('#log-card').hidden = !a;
  if (a) $('#log').innerHTML = logHTML(a.log);
  const c = a ? tapCounts(a) : zero();
  KEYS.forEach(k => { $(`[data-n="${k}"]`).textContent = c[k]; });
  $$('.method').forEach(b => b.disabled = !running);
  $('#btn-undo').disabled = !a || !a.taps.length;
  $('#hint').textContent = !a
    ? 'Tekan Mulai, lalu tap metode tiap kali selesai posting satu sharelink.'
    : running ? `Total ${a.taps.length} sharelink di sesi ini.` : 'Sesi dijeda. Tekan Lanjut untuk mencatat lagi.';
  checkIdle();
}
setInterval(() => { if (S.active && S.active.resumedAt) $('#clock').textContent = fmt(elapsed(S.active)); }, 200);
setInterval(checkIdle, 10000);
function refreshFromStorage() {
  sync(); renderSesi();
  const f = document.activeElement;
  if (!(f && f.closest && f.closest('#riwayat'))) { renderRiwayat(); renderRingkasan(); }
}
window.addEventListener('storage', e => { if (e.key === KEY || e.key === null) refreshFromStorage(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshFromStorage(); });

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
      <label>Pesanan <input type="number" inputmode="numeric" min="0" data-order="${k}" value="${s.orders[k]}"></label>
    </div>`).join('');
  return `<article class="sess" data-id="${s.id}">
    <div class="row"><strong>${clockOf(s.start)}</strong><span>${fmt(s.duration)}</span><button class="edit" data-edit aria-label="Edit waktu sesi">Edit</button><button class="del" data-del>Hapus</button></div>
    ${rows}
    <details class="logbox"><summary>Log waktu WIB (${(s.log || []).length})</summary><ol class="log">${logHTML(s.log)}</ol></details></article>`;
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
  sync();
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
  const b = e.target.closest('button'); if (!b) return;
  const id = b.closest('.sess') && b.closest('.sess').dataset.id;
  if (b.matches('[data-edit]')) { openEdit(id); return; }
  if (!b.matches('[data-del]')) return;
  if (!confirm('Hapus sesi ini? Tidak bisa dibatalkan.')) return;
  sync();
  S.sessions = S.sessions.filter(x => String(x.id) !== id);
  save(); renderRiwayat();
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

  const all = `<div class="card all"><h3>Semua sesi</h3>
    <div class="stat"><span>Jumlah sesi</span><b>${S.sessions.length}</b></div>
    <div class="stat"><span>Total durasi</span><b>${fmt(ms)}</b></div>
    <div class="stat"><span>Sharelink</span><b>${links}</b></div>
    <div class="stat"><span>Sharelink per jam</span><b>${hours > 0 ? num(links / hours) : '-'}</b></div>
    <div class="stat"><span>Pesanan</span><b>${orders}</b></div>
    <div class="stat"><span>Klik per sharelink</span><b>${clickLinks ? num(clicks / clickLinks) : 'isi klik harian dulu'}</b></div>
  </div>`;

  const per = KEYS.map(k => {
    const d = t[k], small = d.links < MIN_LINKS;
    return `<div class="card ${k}"><h3>${M[k]}</h3>
      <div class="stat"><span>Sharelink</span><b>${d.links}</b></div>
      <div class="stat"><span>Jumlah sesi memakai metode ini</span><b>${d.sess}</b></div>
      <div class="stat"><span>Pesanan</span><b>${d.orders}</b></div>
      <div class="stat"><span>Pesanan per 100 sharelink</span><b>${d.links ? num(d.orders / d.links * 100) : '-'}</b></div>
      ${small ? `<p class="warn">Baru ${d.links} sharelink. Di bawah ${MIN_LINKS}, angkanya masih naik-turun dan belum layak dibandingkan.</p>` : ''}
    </div>`;
  }).join('');

  box.innerHTML = all + per + `<p class="note">Yang dibandingkan antar metode hanya pesanan per sharelink, karena klik Shopee tidak bisa dipecah per tag. Pesanan tanpa tag dihitung Manual, jadi pesanan dari postingan lama yang tidak tercatat di sini ikut masuk Manual dan bisa membuatnya tampak lebih bagus dari aslinya.</p>`;
}

/* ---------- ekspor dan impor ---------- */
function exportJSON() {
  const json = JSON.stringify(S, null, 2), fname = `sharelink-tracker-${dayKey(Date.now())}.json`;
  if (window.AndroidBridge && AndroidBridge.saveFile) { // di dalam app Android, unduhan blob tidak jalan
    if (!AndroidBridge.saveFile(fname, json)) alert('Gagal menyimpan file ke folder Download.');
    return;
  }
  const blob = new Blob([json], { type: 'application/json' });
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
  ['sesi', 'riwayat', 'ringkasan', 'analisis'].forEach(n => { $(`#tab-${n}`).hidden = n !== name; });
  if (name === 'riwayat') renderRiwayat();
  if (name === 'ringkasan') renderRingkasan();
  if (name === 'analisis' && typeof renderAnalisis === 'function') renderAnalisis();
}
function renderAll() { renderSesi(); renderRiwayat(); renderRingkasan(); }

$$('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
$('#btn-main').addEventListener('click', mainAction);
$('#btn-edit').addEventListener('click', () => openEdit('active'));
$('#idle-pause').addEventListener('click', idlePause);
$('#idle-ok').addEventListener('click', () => { idleSnooze = Date.now(); checkIdle(); });
$('#form-edit').addEventListener('submit', submitEdit);
$('#edit-cancel').addEventListener('click', () => $('#dlg-edit').close());
$('#btn-stop').addEventListener('click', stop);
$('#btn-undo').addEventListener('click', undo);
$$('.method').forEach(b => b.addEventListener('click', () => tap(b.dataset.m)));
$('#btn-export').addEventListener('click', exportJSON);
$('#btn-import').addEventListener('click', () => $('#file-import').click());
$('#file-import').addEventListener('change', e => { importJSON(e.target.files[0]); e.target.value = ''; });


/* ---------- jembatan untuk app Android (gelembung melayang) ---------- */
const API = {
  state() {
    sync();
    const a = S.active, counts = a ? tapCounts(a) : zero();
    return { active: !!a, running: !!(a && a.resumedAt), elapsed: a ? elapsed(a) : 0, counts, total: sum(KEYS.map(k => counts[k])), last: a && a.taps.length ? a.taps[a.taps.length - 1].m : null };
  },
  main() {
    sync();
    const a = S.active, now = Date.now();
    if (!a) { S.active = { id: now, startedAt: now, acc: 0, resumedAt: now, taps: [], log: [] }; logEv(S.active, 'start', now); }
    else if (a.resumedAt) doPause(a, now);
    else { a.resumedAt = now; logEv(a, 'resume', now); }
    idleSnooze = 0; save(); renderSesi();
    return API.state();
  },
  tap(m) { if (KEYS.includes(m)) tap(m); return API.state(); },
  undo() { undo(); return API.state(); },
  stopNow() { finishSession(); return API.state(); }
};
window.trackerAPI = API;

if (window.AndroidBridge) { // tombol gelembung hanya muncul di dalam app Android
  const btn = $('#btn-bubble'), msg = $('#bubble-msg');
  const paint = on => { btn.dataset.on = on ? '1' : '0'; btn.textContent = on ? 'Matikan gelembung' : 'Aktifkan gelembung'; };
  $('#bubble-box').hidden = false;
  try { paint(AndroidBridge.isBubbleEnabled()); } catch (e) { paint(false); }
  btn.addEventListener('click', () => {
    let r = 'error';
    try { r = AndroidBridge.setBubble(btn.dataset.on !== '1'); } catch (e) { /* abaikan */ }
    if (r === 'need_permission') msg.textContent = 'Izinkan "Tampil di atas aplikasi lain" untuk app ini, lalu kembali ke sini dan tekan tombol lagi.';
    else if (r === 'on') { paint(true); msg.textContent = 'Gelembung aktif. Tap sekali untuk memunculkan, tap kedua untuk membuka panel.'; }
    else if (r === 'off') { paint(false); msg.textContent = 'Gelembung dimatikan.'; }
    else msg.textContent = 'Gagal mengubah gelembung.';
  });
}

renderAll();
