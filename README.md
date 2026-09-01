# Klikfun

Repository aplikasi web Klikfun. Kondisi implementasi aktual harus dibaca dari branch aktif dan file yang benar-benar dimuat oleh `index.html`.

## Source aktif

Urutan runtime browser:

1. `klikfun-db.js` — bank pertanyaan utama.
2. `klikfun-extra.js` — bank pertanyaan dan konfigurasi tambahan.
3. `klikfun-heroes-v12.js` — data Hero.
4. `klikfun-skills-artifacts-v12.js` — data skill dan artifact.
5. `klikfun-core-v15.js` — alur utama aplikasi.
6. `klikfun-member.js` — antarmuka akun dan sinkronisasi progres.
7. `klikfun-game-v12.js` — peningkatan visual dan mekanik GAME.
8. `klikfun-reward.js` — antarmuka Reward Camera.

Runtime server:

- `_worker.js` — routing API, ronde, grup, laporan, telemetry, dan AI Transform.
- `klikfun-member-api.js` — akun, sesi member, pemulihan, dan state progres.
- `_routes.json` — hanya rute `/api/*` yang masuk Worker.

App shell:

- `manifest.webmanifest`
- `sw.js`
- `klikfun-icon.svg`

## File legacy

- `index-fixed-loading.html` adalah snapshot lama dan dialihkan ke halaman utama melalui `_redirects`.
- `klikfun-core-v13.js` adalah snapshot lama dan tidak dimuat oleh `index.html`.

File legacy tidak boleh dijadikan dasar perubahan baru tanpa keputusan eksplisit untuk memulihkannya.

## Aturan verifikasi

Status pengujian harus menyebut jenisnya secara eksplisit: `STATIC CHECK`, `SYNTAX CHECK`, `INTEGRATION CHECK`, `RUNTIME CHECK`, `USER-FLOW CHECK`, atau `DEPLOYMENT CHECK`. Pemeriksaan source tidak boleh dilaporkan sebagai runtime test.
