/* Analisis performa: impor CSV Shopee Affiliate (laporan klik dan laporan komisi) + evaluasi.
   Semua waktu di laporan Shopee dianggap WIB. Data laporan disimpan terpisah dari data sesi. */
(function () {
'use strict';
const RK = 'sharelink-reports-v1';
const TZ = 7 * 3600;
const MNAME = { manual: 'Manual', gpt: 'IMAGE GPT', claude: 'IMAGE CLAUDE' };
const label = k => MNAME[k] || 'Tag ' + k;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nk = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : 0; };
const pad = n => String(n).padStart(2, '0');
const nf = (n, d = 1) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: d });
const rp = n => 'Rp' + Math.round(n).toLocaleString('id-ID');
const pc = n => nf(n * 100) + '%';
const sumBy = (a, f) => a.reduce((s, x) => s + f(x), 0);

/* ---------- waktu (WIB) ---------- */
function ts(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(v || '').trim());
  return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000 - TZ : null;
}
const wd = s => new Date((s + TZ) * 1000);
const dayOf = s => wd(s).toISOString().slice(0, 10);
const hourOf = s => wd(s).getUTCHours();
const when = s => { const d = wd(s); return pad(d.getUTCDate()) + '-' + pad(d.getUTCMonth() + 1) + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); };
const dmy = d => d.split('-').reverse().join('-');
const shiftDay = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

/* ---------- CSV ---------- */
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const first = text.split('\n', 1)[0];
  const sep = [',', ';', '\t'].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r[0] && r[0].trim() !== ''));
}

/* ---------- penyimpanan ---------- */
let store = null;
const emptyStore = () => ({ v: 1, tags: [], refs: [], regs: [], clicks: [], orders: {} });
function load() {
  if (store) return store;
  try { const r = JSON.parse(localStorage.getItem(RK)); store = r && r.v === 1 ? r : emptyStore(); } catch (e) { store = emptyStore(); }
  return store;
}
function persist() { try { localStorage.setItem(RK, JSON.stringify(store)); return true; } catch (e) { return false; } }
const intern = (arr, v) => { let i = arr.indexOf(v); if (i < 0) { i = arr.length; arr.push(v); } return i; };
const tagOf = raw => String(raw || '').split('-')[0].trim().toUpperCase(); // "GPT----" -> "GPT", "----" -> ""

/* ---------- impor ---------- */
function ingestClicks(rows) {
  const h = rows[0].map(nk), c = n => h.indexOf(n);
  const iId = c('klikid'), iT = c('waktuklik'), iReg = c('wilayahklik'), iTag = c('taglink'), iRef = c('perujuk');
  const st = load(), seen = new Set(st.clicks.map(x => x[0]));
  let added = 0, dup = 0, bad = 0;
  for (const r of rows.slice(1)) {
    const id = String(r[iId] || '').trim().slice(0, 12), t = ts(r[iT]);
    if (!id || t == null) { bad++; continue; }
    if (seen.has(id)) { dup++; continue; }
    seen.add(id);
    st.clicks.push([id, t, intern(st.tags, tagOf(r[iTag])), intern(st.refs, String(r[iRef] || '').trim() || '-'), intern(st.regs, String(r[iReg] || '').trim() || '-')]);
    added++;
  }
  return { type: 'klik', rows: rows.length - 1, added, dup, bad };
}

function ingestOrders(rows) {
  const h = rows[0].map(nk);
  const f = (...n) => { for (const x of n) { const i = h.indexOf(x); if (i >= 0) return i; } for (const x of n) { const i = h.findIndex(y => y.startsWith(x)); if (i >= 0) return i; } return -1; };
  const I = {
    id: f('idpemesanan'), st: f('statuspesanan'), tO: f('waktupemesanan'), tC: f('waktuklik'), shop: f('namatoko'),
    name: f('namabarang'), l1: f('l1kategoriglobal'), qty: f('jumlah'), val: f('nilaipembelianrp'), cp: f('totalkomisiperprodukrp'),
    co: f('totalkomisiperpesananrp'), net: f('komisibersihaffiliaterp'), plat: f('platform'), offer: f('tipepenawaran'),
    t1: f('taglink1'), t2: f('taglink2'), t3: f('taglink3'), t4: f('taglink4'), t5: f('taglink5')
  };
  const cell = (r, k) => (I[k] < 0 ? '' : String(r[I[k]] == null ? '' : r[I[k]]).trim());
  const g = new Map();
  for (const r of rows.slice(1)) { const id = cell(r, 'id'); if (!id) continue; if (!g.has(id)) g.set(id, []); g.get(id).push(r); }
  const st = load();
  let added = 0, updated = 0, same = 0, bad = 0;
  for (const [id, rs] of g) {
    const a = rs[0], tO = ts(cell(a, 'tO'));
    if (tO == null) { bad++; continue; }
    const co = sumBy(rs, r => num(cell(r, 'co'))), cp = sumBy(rs, r => num(cell(r, 'cp')));
    const gross = co > 0 ? co : cp;
    const rec = {
      id, st: cell(a, 'st'), tO, tC: ts(cell(a, 'tC')), shop: cell(a, 'shop'),
      tag: ([1, 2, 3, 4, 5].map(n => cell(a, 't' + n)).filter(Boolean)[0] || '').toUpperCase(),
      plat: cell(a, 'plat') || '-', gross, net: I.net >= 0 ? sumBy(rs, r => num(cell(r, 'net'))) : gross,
      items: rs.map(r => [cell(r, 'name').slice(0, 70), cell(r, 'l1'), '', num(cell(r, 'qty')), num(cell(r, 'val')), num(cell(r, 'cp')), cell(r, 'offer')])
    };
    const prev = st.orders[id];
    if (!prev) added++; else if (JSON.stringify(prev) !== JSON.stringify(rec)) updated++; else same++;
    st.orders[id] = rec;
  }
  return { type: 'komisi', rows: rows.length - 1, orders: g.size, added, updated, same, bad };
}

function importText(text, name) {
  const rows = parseCSV(text);
  if (rows.length < 2) return { name, error: 'File kosong atau bukan CSV.' };
  const h = rows[0].map(nk);
  let r;
  if (h.includes('klikid') && h.includes('waktuklik')) r = ingestClicks(rows);
  else if (h.includes('idpemesanan') && h.includes('statuspesanan')) r = ingestOrders(rows);
  else return { name, error: 'Format tidak dikenali. Pakai Laporan Klik atau Laporan Komisi dari Shopee Affiliate.' };
  r.name = name;
  return r;
}

/* Isi "Total klik hari ini" di Riwayat dari data klik, hanya untuk hari yang masih kosong (input manual tidak ditimpa). */
function fillDayClicks() {
  if (typeof S === 'undefined' || typeof sync !== 'function' || typeof save !== 'function') return 0;
  sync();
  const per = {};
  load().clicks.forEach(c => { const d = dayOf(c[1]); per[d] = (per[d] || 0) + 1; });
  let n = 0;
  for (const d in per) if (S.dayClicks[d] == null) { S.dayClicks[d] = per[d]; n++; }
  if (n) { save(); if (typeof renderRiwayat === 'function') renderRiwayat(); }
  return n;
}

/* ---------- perhitungan ---------- */
function wilson(k, n) {
  if (!n) return [0, 0];
  const z = 1.96, p = k / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
const tally = (a, f) => { const m = {}; a.forEach(x => { const k = f(x); m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((x, y) => y[1] - x[1]); };
const statusKind = s => /batal|cancel/i.test(s) ? 'bad' : /tunda|proses|pending/i.test(s) ? 'wait' : 'ok';

function bounds(st) {
  const d = st.clicks.map(c => dayOf(c[1])).concat(Object.values(st.orders).map(o => dayOf(o.tO))).sort();
  return d.length ? { min: d[0], max: d[d.length - 1] } : null;
}

function compute(st, sessions, rng) {
  const inR = d => (!rng.from || d >= rng.from) && (!rng.to || d <= rng.to);
  const key = t => !t ? 'manual' : /gpt/i.test(t) ? 'gpt' : /claude/i.test(t) ? 'claude' : t;
  const clicks = st.clicks.filter(c => inR(dayOf(c[1])));
  const clickDays = new Set(clicks.map(c => dayOf(c[1])));
  const all = Object.values(st.orders);
  const cancelled = o => statusKind(o.st) === 'bad';
  const byDate = all.filter(o => inR(dayOf(o.tO)));
  const active = byDate.filter(o => !cancelled(o));
  const inCohort = o => o.tC != null && clickDays.has(dayOf(o.tC));
  const cohort = all.filter(o => !cancelled(o) && inCohort(o));
  const R = {
    clicks: clicks.length, cancelled: byDate.length - active.length, active: active.length, comm: sumBy(active, o => o.net),
    aov: active.length ? sumBy(active, o => sumBy(o.items, i => i[4])) / active.length : 0,
    cohort: cohort.length, cohortComm: sumBy(cohort, o => o.net), excluded: active.filter(o => !inCohort(o)).length,
    covered: [...clickDays].sort()
  };
  R.conv = R.clicks ? R.cohort / R.clicks : null;
  R.ci = wilson(R.cohort, R.clicks);

  const keys = new Set(['manual', 'gpt', 'claude']);
  clicks.forEach(c => keys.add(key(st.tags[c[2]])));
  cohort.forEach(o => keys.add(key(o.tag)));
  const sess = sessions.filter(s => inR(dayOf(Math.floor(s.start / 1000))));
  R.methods = [...keys].map(k => {
    const cl = clicks.filter(c => key(st.tags[c[2]]) === k).length, co = cohort.filter(o => key(o.tag) === k);
    return { key: k, clicks: cl, orders: co.length, comm: sumBy(co, o => o.net), conv: cl ? co.length / cl : null, ci: wilson(co.length, cl), links: MNAME[k] ? sumBy(sess, s => s.links[k] || 0) : null };
  });

  R.hClick = Array(24).fill(0); clicks.forEach(c => R.hClick[hourOf(c[1])]++);
  R.hOrder = Array(24).fill(0); active.forEach(o => R.hOrder[hourOf(o.tO)]++);

  const dm = {}, D = d => dm[d] || (dm[d] = { d, clicks: 0, orders: 0, comm: 0 });
  clicks.forEach(c => D(dayOf(c[1])).clicks++);
  active.forEach(o => { const x = D(dayOf(o.tO)); x.orders++; x.comm += o.net; });
  R.days = Object.values(dm).sort((a, b) => b.d.localeCompare(a.d));

  R.refs = tally(clicks, c => st.refs[c[3]]);
  R.regs = tally(clicks, c => st.regs[c[4]]);
  R.plats = tally(active, o => o.plat);
  R.foreign = clicks.filter(c => { const r = st.regs[c[4]]; return r !== 'Indonesia' && r !== '-'; }).length;

  const lags = active.filter(o => o.tC != null && o.tO >= o.tC).map(o => (o.tO - o.tC) / 3600).sort((a, b) => a - b), n = lags.length;
  R.lag = {
    n, med: n ? (n % 2 ? lags[(n - 1) / 2] : (lags[n / 2 - 1] + lags[n / 2]) / 2) : null,
    buckets: [['< 1 jam', 0, 1], ['1-6 jam', 1, 6], ['6-24 jam', 6, 24], ['1-3 hari', 24, 72], ['> 3 hari', 72, 1e9]].map(([t, a, b]) => [t, lags.filter(h => h >= a && h < b).length])
  };

  const cat = {}, prod = {};
  active.forEach(o => {
    const seen = new Set();
    o.items.forEach(i => {
      const c = i[1] || '-', x = cat[c] || (cat[c] = { n: 0, comm: 0 });
      if (!seen.has(c)) { x.n++; seen.add(c); }
      x.comm += i[5];
      const p = prod[i[0]] || (prod[i[0]] = { n: 0, comm: 0, cat: c });
      p.n += i[3] || 1; p.comm += i[5];
    });
  });
  R.cats = Object.entries(cat).map(([k, v]) => Object.assign({ k }, v)).sort((a, b) => b.comm - a.comm);
  R.prods = Object.entries(prod).map(([k, v]) => Object.assign({ k }, v)).sort((a, b) => b.comm - a.comm);

  const stt = {};
  byDate.forEach(o => { const k = o.st || '-', x = stt[k] || (stt[k] = { k, n: 0, comm: 0 }); x.n++; x.comm += o.net; });
  R.status = Object.values(stt).sort((a, b) => b.n - a.n);
  R.orders = byDate.slice().sort((a, b) => b.tO - a.tO);
  R.key = key;
  return R;
}

function insights(R) {
  const out = [], man = R.methods.find(m => m.key === 'manual');
  if (R.excluded) out.push(`${R.excluded} dari ${R.active} pesanan berasal dari klik di luar tanggal klik yang diimpor (data klik: ${R.covered.map(dmy).join(', ') || '-'}). Pesanan itu tidak ikut hitungan konversi. Impor laporan klik untuk tanggal klik tersebut.`);
  if (man && man.clicks >= 30) {
    R.methods.filter(m => m.key !== 'manual' && m.clicks).forEach(m => {
      if (m.clicks < 30) out.push(`${label(m.key)}: baru ${m.clicks} klik, masih terlalu sedikit untuk dibandingkan dengan Manual.`);
      else if (m.ci[0] > man.ci[1]) out.push(`${label(m.key)}: konversinya lebih tinggi dari Manual, dan rentang keyakinan 95% keduanya tidak tumpang tindih.`);
      else if (m.ci[1] < man.ci[0]) out.push(`${label(m.key)}: konversinya lebih rendah dari Manual, dan rentang keyakinan 95% keduanya tidak tumpang tindih.`);
      else out.push(`${label(m.key)} vs Manual: rentang keyakinan 95% tumpang tindih, selisihnya belum bisa dibedakan dari kebetulan.`);
    });
  }
  const top = a => { const m = Math.max(...a); return m > 0 ? [a.indexOf(m), m] : null; };
  const tc = top(R.hClick), to = top(R.hOrder);
  if (tc) out.push(`Klik terbanyak pada jam ${pad(tc[0])}.00 WIB (${tc[1]} klik).`);
  if (to) out.push(`Pesanan terbanyak pada jam ${pad(to[0])}.00 WIB (${to[1]} pesanan)${R.active < 10 ? ', sampel masih kecil' : ''}.`);
  if (R.clicks >= 20 && R.foreign) out.push(`${R.foreign} klik (${pc(R.foreign / R.clicks)}) berasal dari luar Indonesia. Dugaan: sebagian besar bukan calon pembeli. Ini dugaan, bukan data pasti.`);
  if (R.lag.med != null) out.push(`Jeda klik ke pesanan: median ${R.lag.med < 1 ? nf(R.lag.med * 60, 0) + ' menit' : nf(R.lag.med) + ' jam'} (dari ${R.lag.n} pesanan).`);
  return out;
}

window.Analisis = { parseCSV, importText, compute, insights, wilson, bounds, _store: () => load(), _reset: () => { store = emptyStore(); } };

/* ---------- tampilan ---------- */
if (typeof document === 'undefined') return;
let rng = { from: '', to: '' }, showAll = false, msgs = [];
const sessionsNow = () => (typeof S !== 'undefined' && S.sessions) || [];
const ic = p => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${p}"/></svg>`;
const card = (icon, title, inner) => `<div class="dashboard-card an-card"><div class="card-header"><span class="card-icon">${ic(icon)}</span><span>${title}</span></div>${inner}</div>`;
const kpi = (t, v, s) => `<div class="an-kpi"><small>${t}</small><b>${v}</b><span>${s || ''}</span></div>`;
const list = rows => rows.length ? `<ul class="an-list">${rows.map(r => `<li><span>${r[0]}</span><b>${r[1]}</b></li>`).join('')}</ul>` : '<p class="dim">Tidak ada data.</p>';
const bars = a => { const mx = Math.max(...a, 1); return `<div class="an-bars">${a.map((v, h) => `<i style="height:${Math.max(v ? 8 : 2, v / mx * 100)}%" title="${pad(h)}.00: ${v}"></i>`).join('')}</div><div class="an-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>`; };

function importCard(st) {
  const kb = Math.round(JSON.stringify(st).length / 1024), no = Object.keys(st.orders).length;
  const m = msgs.map(x => `<li class="${x.error ? 'bad' : 'ok'}">${esc(x.name)}: ${x.error ? esc(x.error)
    : x.type === 'info' ? `total klik harian diisi untuk ${x.n} hari yang masih kosong`
    : x.type === 'klik' ? `laporan klik, ${x.added} klik baru, ${x.dup} sudah ada${x.bad ? ', ' + x.bad + ' baris dilewati' : ''}`
    : `laporan komisi, ${x.orders} pesanan: ${x.added} baru, ${x.updated} diperbarui, ${x.same} tidak berubah${x.bad ? ', ' + x.bad + ' dilewati' : ''}`}</li>`).join('');
  return card('M12 21V9M7 14l5-5 5 5M5 3h14', 'Impor laporan Shopee', `
    <p class="dim">Pilih Laporan Klik dan Laporan Komisi (CSV) sekaligus. Impor ulang aman: klik yang sama dilewati, status pesanan diperbarui.</p>
    <div class="ctrls"><button class="ghost" data-an="pick">Pilih file CSV</button></div>
    <input type="file" id="an-file" accept=".csv,text/csv,text/comma-separated-values,application/vnd.ms-excel" multiple hidden>
    ${m ? `<ul class="an-msg">${m}</ul>` : ''}
    <p class="dim an-store">Tersimpan: ${st.clicks.length} klik, ${no} pesanan (${kb} KB). Data ini bisa diimpor ulang dari CSV Shopee, jadi tidak ikut Ekspor JSON.
      ${st.clicks.length || no ? '<button class="an-link" data-an="clear">Hapus data laporan</button>' : ''}</p>`);
}

function rangeCard(b) {
  const pressed = v => v === 'all' ? !rng.from && !rng.to : rng.to === b.max && rng.from === shiftDay(b.max, -(+v - 1));
  return card('M3 5h18l-7 8v6l-4 2v-8z', 'Rentang tanggal', `
    <div class="an-chips">${[['all', 'Semua'], ['7', '7 hari'], ['30', '30 hari']].map(([v, t]) => `<button data-an="chip" data-v="${v}" aria-pressed="${pressed(v)}">${t}</button>`).join('')}</div>
    <div class="an-dates"><label>Dari<input type="date" data-an-date="from" min="${b.min}" max="${b.max}" value="${rng.from}"></label>
    <label>Sampai<input type="date" data-an-date="to" min="${b.min}" max="${b.max}" value="${rng.to}"></label></div>
    <p class="dim">Data tersedia ${dmy(b.min)} sampai ${dmy(b.max)}.</p>`);
}

function methodsCard(R) {
  const rows = R.methods.map(m => `<div class="an-meth m-${esc(m.key)}"><div class="an-mh"><b>${esc(label(m.key))}</b><span>${m.links == null ? 'tag dari Shopee' : m.links + ' sharelink dicatat'}</span></div>
    <div class="an-mg"><div><small>Klik</small><b>${m.clicks}</b></div><div><small>Pesanan</small><b>${m.orders}</b></div>
    <div><small>Konversi</small><b>${m.conv == null ? '-' : pc(m.conv)}</b></div><div><small>Komisi</small><b>${rp(m.comm)}</b></div></div>
    <p class="an-sub">${m.clicks ? `Rentang 95%: ${pc(m.ci[0])} sampai ${pc(m.ci[1])}. Komisi per klik ${rp(m.comm / m.clicks)}.` : 'Belum ada klik pada rentang ini.'}${m.links && m.clicks ? ` Klik per sharelink ${nf(m.clicks / m.links)}.` : ''}</p></div>`).join('');
  return card('M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01', 'Per metode (tag link)', rows +
    '<p class="dim">Konversi = pesanan dari klik pada rentang ini ÷ klik. Klik per sharelink itu kasar, karena klik juga datang dari postingan lama.</p>');
}

function orderRow(o, key) {
  const f = o.items[0] ? o.items[0][0] : '-', more = o.items.length > 1 ? ' +' + (o.items.length - 1) : '';
  return `<li><div class="an-ot">${esc(f)}${more}</div><div class="an-om"><span class="st ${statusKind(o.st)}">${esc(o.st || '-')}</span><span>${when(o.tO)}</span><span>${esc(label(key(o.tag)))}</span><b>${rp(o.net)}</b></div></li>`;
}

function body(R, b) {
  const ins = insights(R);
  const kp = `<div class="an-kpis">${kpi('Klik', R.clicks, 'pada rentang')}${kpi('Pesanan', R.active, R.cancelled + ' dibatalkan')}${kpi('Komisi', rp(R.comm), 'tgl pesan, tanpa dibatalkan')}
    ${kpi('Konversi', R.conv == null ? '-' : pc(R.conv), R.cohort + ' pesanan dari ' + R.clicks + ' klik')}${kpi('Komisi per klik', R.clicks ? rp(R.cohortComm / R.clicks) : '-', 'dari pesanan yang cocok')}${kpi('Nilai pesanan', rp(R.aov), 'rata-rata')}</div>`;
  const top3 = a => a.map((v, h) => [h, v]).filter(x => x[1] > 0).sort((x, y) => y[1] - x[1]).slice(0, 3).map(x => `${pad(x[0])}.00 (${x[1]})`).join(', ') || '-';
  return rangeCard(b) +
    card('M12 3l2.5 6 6.5.5-5 4.3 1.6 6.4L12 17l-5.6 3.2L8 13.8 3 9.5 9.5 9z', 'Ringkasan', kp + (ins.length ? `<ul class="an-ins">${ins.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '')) +
    methodsCard(R) +
    card('M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'Pola jam (WIB)', `<p class="dim">Klik per jam</p>${bars(R.hClick)}<p class="dim">Tertinggi: ${top3(R.hClick)}</p>
      <p class="dim">Pesanan per jam (jam pesan)</p>${bars(R.hOrder)}<p class="dim">Tertinggi: ${top3(R.hOrder)}</p>
      ${R.lag.n ? `<p class="dim">Jeda klik ke pesanan</p>${list(R.lag.buckets.map(x => [x[0], x[1] + ' pesanan']))}` : ''}`) +
    (R.days.length > 1 ? card('M3 4h18v16H3zM3 10h18M9 4v16', 'Per hari', list(R.days.map(d => [dmy(d.d), `${d.clicks} klik, ${d.orders} pesanan, ${rp(d.comm)}`]))) : '') +
    card('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18', 'Sumber klik', `<p class="dim">Perujuk</p>${list(R.refs.map(x => [esc(x[0]), `${x[1]} (${pc(x[1] / R.clicks)})`]))}
      <p class="dim">Wilayah</p>${list(R.regs.slice(0, 6).map(x => [esc(x[0]), `${x[1]} (${pc(x[1] / R.clicks)})`]))}
      <p class="dim">Platform pesanan</p>${list(R.plats.map(x => [esc(x[0]), x[1] + ' pesanan']))}`) +
    card('M4 6h16M4 12h16M4 18h10', 'Kategori dan produk', `<p class="dim">Kategori teratas (komisi produk)</p>${list(R.cats.slice(0, 5).map(c => [esc(c.k), `${c.n} pesanan, ${rp(c.comm)}`]))}
      <p class="dim">Produk teratas</p>${list(R.prods.slice(0, 5).map(p => [esc(p.k.slice(0, 44)), `${p.n} pcs, ${rp(p.comm)}`]))}`) +
    card('M5 13l4 4L19 7', 'Status pesanan', list(R.status.map(s => [`<span class="st ${statusKind(s.k)}">${esc(s.k)}</span>`, `${s.n} pesanan, ${rp(s.comm)}`]))) +
    card('M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01', `Daftar pesanan (${R.orders.length})`,
      `<ul class="an-orders">${R.orders.slice(0, showAll ? 500 : 12).map(o => orderRow(o, R.key)).join('')}</ul>` +
      (R.orders.length > 12 ? `<div class="ctrls"><button class="ghost" data-an="more">${showAll ? 'Ringkas' : 'Tampilkan semua'}</button></div>` : '')) +
    `<details class="an-how"><summary>Cara menghitung</summary><ul>
      <li>Waktu di laporan Shopee dianggap WIB.</li>
      <li>Metode dibaca dari Tag link: kosong berarti Manual, GPT dan CLAUDE sesuai tag.</li>
      <li>Konversi memakai pesanan yang klik-nya jatuh pada tanggal klik yang sudah diimpor, supaya pembilang dan penyebutnya satu periode.</li>
      <li>Rentang 95% memakai interval Wilson. Kalau dua rentang tumpang tindih, selisihnya belum bisa dianggap nyata.</li>
      <li>Komisi dihitung dari Komisi Bersih Affiliate, pesanan dibatalkan tidak dihitung. Status selain Tertunda dan Dibatalkan ditampilkan apa adanya di tabel status.</li>
    </ul></details>`;
}

const intro = () => card('M12 21V9M7 14l5-5 5 5M5 3h14', 'Belum ada data', '<p class="dim">Impor Laporan Klik dan Laporan Komisi dari Shopee Affiliate Web untuk melihat analisis di sini.</p>');

function render() {
  const root = document.getElementById('analisis'); if (!root) return;
  const st = load(), b = bounds(st);
  root.innerHTML = importCard(st) + (b ? body(compute(st, sessionsNow(), rng), b) : intro());
}
window.renderAnalisis = render;

function readText(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(f); }); }
async function importFiles(files) {
  msgs = [];
  for (const f of files) {
    try { msgs.push(importText(await readText(f), f.name)); } catch (e) { msgs.push({ name: f.name, error: 'Gagal membaca file.' }); }
  }
  if (!persist()) msgs.push({ name: 'Penyimpanan', error: 'Gagal menyimpan, kemungkinan penuh. Hapus data laporan lama lalu coba lagi.' });
  const n = fillDayClicks();
  if (n) msgs.push({ name: 'Riwayat', type: 'info', n });
  render();
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-an]'); if (!t || !t.closest('#analisis')) return;
  const a = t.dataset.an;
  if (a === 'pick') document.getElementById('an-file').click();
  else if (a === 'clear') { if (confirm('Hapus semua data laporan Shopee yang tersimpan? Data sesi tidak ikut terhapus.')) { store = emptyStore(); persist(); msgs = []; render(); } }
  else if (a === 'more') { showAll = !showAll; render(); }
  else if (a === 'chip') { const b = bounds(load()); if (!b) return; rng = t.dataset.v === 'all' ? { from: '', to: '' } : { from: shiftDay(b.max, -(+t.dataset.v - 1)), to: b.max }; render(); }
});
document.addEventListener('change', e => {
  const t = e.target; if (!t.closest || !t.closest('#analisis')) return;
  if (t.id === 'an-file') { const fs = [...t.files]; t.value = ''; if (fs.length) importFiles(fs); }
  else if (t.dataset.anDate) { rng[t.dataset.anDate] = t.value; if (rng.from && rng.to && rng.from > rng.to) rng[t.dataset.anDate === 'from' ? 'to' : 'from'] = t.value; render(); }
});
})();
