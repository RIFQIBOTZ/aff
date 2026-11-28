<div align="center">

<img src="icon-512.png" alt="Logo Tracker Sharelink" width="120">

# Tracker Sharelink

**Jurnal sesi posting untuk affiliator Shopee yang main lewat sharelink.**
Catat berapa link yang diposting, metode apa yang dipakai, lalu bandingkan hasilnya dengan data asli dari Shopee.

[![Live](https://img.shields.io/badge/live-rifqibotz.github.io%2Faff-b8ff3a?style=for-the-badge&labelColor=050d0b)](https://rifqibotz.github.io/aff/)

![PWA](https://img.shields.io/badge/PWA-installable-2cf5b0?style=flat-square&labelColor=050d0b)
![Vanilla JS](https://img.shields.io/badge/vanilla-HTML%20%2F%20CSS%20%2F%20JS-b8ff3a?style=flat-square&labelColor=050d0b)
![No backend](https://img.shields.io/badge/backend-none-52d6ff?style=flat-square&labelColor=050d0b)
![Hosting](https://img.shields.io/badge/hosting-GitHub%20Pages-ff3d8b?style=flat-square&labelColor=050d0b)

</div>

---

## Kenapa ada ini

Dashboard Shopee Affiliate cuma menunjukkan total klik, pesanan, dan komisi. Dari situ nggak kelihatan:

- berapa sharelink yang sebenarnya diposting dalam sehari,
- berapa lama waktu yang dihabiskan,
- metode mana (manual, gambar buatan GPT, gambar buatan Claude, koleksi) yang menghasilkan pesanan lebih banyak per sharelink.

Tracker ini menutup celah itu. Sisi posting dicatat di sini, sisi hasil dicocokkan dari Shopee.

## Fitur

- **Stopwatch** berbasis timestamp, jadi tetap akurat walau HP dikunci atau tab di-minimize. Ada Mulai, Jeda, Lanjut, dan Selesai.
- **Tap per metode**: Manual, IMAGE GPT, IMAGE CLAUDE, KOLEKSI. Tiap tap tercatat +1 lengkap dengan jamnya, dan ada tombol batalkan tap terakhir.
- **Riwayat per tanggal**: isi pesanan per metode di tiap sesi, dan total klik harian dari Shopee. Semua bisa diedit kapan saja karena data Shopee datang belakangan.
- **Ringkasan performa**: sharelink per jam, klik per sharelink, dan kartu per metode (jumlah sharelink, sesi, pesanan, pesanan per 100 sharelink).
- **Log waktu WIB**: kapan sesi dimulai, dijeda, dilanjut, diakhiri, dan diedit, lengkap dengan durasi pada saat itu.
- **Edit waktu**: kalau timer ternyata keliru, durasi bisa dikoreksi (jam, menit, detik) dan perubahan tercatat di log.
- **Peringatan idle**: kalau timer jalan tanpa ada tap sharelink dalam 20 menit, muncul banner untuk jeda.
- **Sinkron antar tab**: data dibaca ulang sebelum tiap aksi, jadi tab lama tidak menimpa tab baru.
- **Ekspor dan impor JSON** untuk cadangan data.
- **Analisis**: impor Laporan Klik dan Laporan Komisi (CSV) Shopee Affiliate, lalu lihat konversi per metode.
- **Navigasi keyboard**: tab bawah bisa dipindah dengan panah kiri/kanan, Home, dan End.
- **Bisa diinstal** sebagai aplikasi (PWA) di Android lewat Chrome.

## Cara pakai

1. Buka tab **Sesi**, tekan **Mulai**.
2. Tiap selesai posting satu sharelink, tap tombol metodenya.
3. Selesai posting, tekan **Selesai**. Sesi masuk ke **Riwayat**.
4. Beberapa jam atau hari kemudian, buka rincian pesanan di Shopee Affiliate dan isi:
   - **pesanan per metode** di tiap sesi (lihat bagian di bawah soal Tag link),
   - **total klik hari itu** di header tanggal.
5. Buka **Ringkasan** untuk melihat perbandingannya.

## Cara membaca hasil

**Pesanan per metode** dibaca dari kolom **Tag link** di rincian pesanan Shopee Affiliate:

| Tag link di Shopee | Dihitung sebagai |
| --- | --- |
| `GPT` | IMAGE GPT |
| `CLAUDE` | IMAGE CLAUDE |
| kosong (`----`) | Manual |

**Klik tidak bisa dipecah per metode.** Dashboard Shopee hanya menampilkan total klik per hari, jadi klik diinput per tanggal, bukan per sesi. Yang dibandingkan antar metode adalah **pesanan per sharelink**.

### Batasan yang perlu diingat

- Pesanan tanpa tag dihitung Manual. Pesanan dari postingan lama yang tidak tercatat di sesi ikut masuk Manual, sehingga Manual bisa tampak lebih bagus dari aslinya.
- Pesanan baru menghasilkan komisi setelah selesai dan divalidasi, jadi angka sesi hari ini baru lengkap beberapa hari kemudian. Perbarui pesanan di Riwayat secara berkala.
- Sampel kecil bikin angka naik-turun. Kartu metode menampilkan peringatan kalau sharelink-nya masih di bawah 30. Angka 30 itu patokan kasar, bukan standar statistik.
- Total klik harian dari Shopee ikut menghitung klik dari postingan lama, bukan hanya dari sesi yang dicatat.

## Pasang sebagai aplikasi

Di Android (Chrome):

1. Buka [rifqibotz.github.io/aff](https://rifqibotz.github.io/aff/).
2. Menu titik tiga, lalu **Instal aplikasi** (atau **Tambahkan ke layar utama**).

Service worker memakai strategi **network-first dengan batas waktu 4 detik**: mengambil versi terbaru kalau jaringan cepat, dan memakai cache kalau jaringan lambat atau mati (cache tetap diperbarui di belakang). Font (Sora dan JetBrains Mono) disajikan dari folder `fonts/`, jadi tampilan sama persis saat offline.

## Data dan privasi

Semua data disimpan di `localStorage` browser kamu. Tidak ada server, akun, atau pelacakan.

Konsekuensinya: data hilang kalau cache atau data situs dihapus, atau kalau ganti HP. **Ekspor JSON berkala** dari tab Ringkasan, dan impor lagi kalau perlu memulihkan.

## Struktur file

```
aff/
├── index.html              halaman dan markup
├── style.css               tampilan
├── analisis.css            tampilan tab Analisis
├── script.js               logika: stopwatch, riwayat, ringkasan, log, ekspor/impor
├── analisis.js             impor CSV Shopee dan analisis
├── fx.js                   efek visual dan navigasi keyboard tab (ripple, +1, getar), opsional
├── fonts/                  Sora dan JetBrains Mono (woff2, lisensi OFL)
├── manifest.webmanifest    metadata PWA
├── sw.js                   service worker (network-first)
├── icon-192.png
├── icon-512.png
├── icon-maskable-512.png
└── apple-touch-icon.png
```

Tanpa build step dan tanpa dependensi. `fx.js` bisa dihapus tanpa mengganggu fungsi aplikasi.

## Konfigurasi

Beberapa angka bisa diubah langsung di bagian atas `script.js`:

| Konstanta | Default | Fungsi |
| --- | --- | --- |
| `MIN_LINKS` | `30` | Batas sharelink sebelum peringatan "sampel kecil" hilang |
| `IDLE_MIN` | `20` | Menit tanpa tap sebelum muncul peringatan idle |
| `MAX_EDIT_MS` | 24 jam | Batas maksimal durasi saat edit waktu |

## Jalankan atau deploy sendiri

**Lokal:** buka `index.html` di browser. Untuk mencoba PWA dan service worker, jalankan lewat server lokal (misalnya `python3 -m http.server`), karena service worker butuh `localhost` atau HTTPS.

**GitHub Pages:** push semua file ke repo, lalu aktifkan Pages (Settings, Pages, pilih branch dan folder root). Semua path di proyek ini relatif, jadi aman dipakai di subfolder seperti `/aff/`.

---

<div align="center">

Dibuat oleh **RIFQIBOTZ**

</div>
