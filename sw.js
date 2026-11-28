"use strict";
// Network-first dengan batas waktu: ambil versi terbaru kalau jaringan cepat; kalau lambat atau mati, pakai cache supaya app tetap terbuka.
const CACHE = "sharelink-v2";
const NET_TIMEOUT = 4000; // ms; lewat ini, cache dipakai sambil jaringan tetap memperbarui cache di belakang
const FILES = ["./", "index.html", "style.css", "script.js", "fx.js", "analisis.js", "analisis.css", "manifest.webmanifest",
  "fonts/sora-latin-wght-normal.woff2", "fonts/jetbrains-mono-latin-wght-normal.woff2",
  "icon-192.png", "icon-512.png", "apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Cadangan saat offline. index.html hanya untuk navigasi halaman; berkas lain yang tidak ada di cache dibiarkan gagal apa adanya
// (sebelumnya script.js yang hilang diganti HTML, yang malah memicu galat sintaks).
const fromCache = req => caches.match(req)
  .then(r => r || (req.mode === "navigate" ? caches.match("index.html") : undefined))
  .then(r => r || Response.error());

function networkFirst(req) {
  return new Promise(resolve => {
    let settled = false, timer = null;
    const done = res => { if (!settled) { settled = true; clearTimeout(timer); resolve(res); } };
    timer = setTimeout(() => { caches.match(req).then(r => { if (r) done(r); }); }, NET_TIMEOUT);
    fetch(req, { cache: "no-cache" }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      done(res);
    }).catch(() => fromCache(req).then(done));
  });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(networkFirst(req));
});
