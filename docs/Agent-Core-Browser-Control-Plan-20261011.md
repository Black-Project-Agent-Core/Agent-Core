# Plan Browser Control Agent Core

Tanggal: 11 Oktober 2026  
Status: **SOURCE DIIMPLEMENTASIKAN, VERIFIKASI TERARAH DAN BUILD RESMI LULUS — aktivasi Windows dan canonical live Memory belum diverifikasi**

## Status dan cara membaca

Plan ini disetujui pengguna pada 11 Oktober 2026 dan telah diimplementasikan pada source utama di atas baseline `8250441b7ce195a40390c772b03c5130bf3a391f`. Pengguna juga meminta informasi yang sama disimpan pada Memory lokal dan dokumentasi. Verifikasi source terarah terakhir lulus **171/171 tes pada 19 file**. Kontrak manifest saat ini mencakup **75 tools** termasuk `image_inspect` dari upstream, dengan ukuran **130.342 byte** di bawah batas **128 KiB**, dibanding baseline upstream **127.091 byte**. Build resmi terakhir `npm run build` lulus dengan exit 0: pemeriksaan path mencakup 359 file, dependency Memory terkompilasi, dan TypeScript root terkompilasi. Build dependency tersebut tidak mengaktifkan atau membuat canonical live Memory. Modul pointer/capture hasil build berada pada output kanonis `dist/rdc/browser-control/`; tidak ada dependency pada tree build paralel. Kontrak dan kriteria live di bawah tetap merupakan target penerimaan, bukan klaim bahwa semua perilaku sudah terverifikasi di Windows.

Catatan kemajuan dan batas verifikasi dipelihara dengan isi yang sama pada [CODEBASE](CODEBASE.md#browser-pointer-and-viewport-capture--2026-10-11) dan [MEMORY.md](../MEMORY.md#browser-pointer-and-viewport-capture--2026-10-11). MEMORY.md adalah proyeksi kontinuitas repository; pembaruannya tidak membuktikan bahwa canonical live Memory Windows sudah diperbarui.

Batas implementasi source yang telah diperiksa: jalur MCP eksternal membawa blok gambar bertipe. Metadata provider/adapter Native yang diperiksa saat ini hanya mendukung teks, sehingga input gambar Native dilaporkan tidak didukung secara eksplisit. Tool dapat menghasilkan capture dan menyimpan blok gambar sementara dalam hasil sesi, tetapi request provider hanya menerima metadata serta pemberitahuan `NATIVE_PROVIDER_IMAGE_INPUT_UNSUPPORTED` bahwa controller belum melihat pixel. Dukungan gambar Native tidak boleh diasumsikan dari kemampuan model di luar kontrak adapter. Aktivasi, pengujian Brave Windows, dan sinkronisasi canonical live Memory menunggu eksekusi serta readback pada host yang sebenarnya. Jalur task desktop yang berwenang masih tidak tersedia pada pemeriksaan ulang 11 Oktober 2026 pukul 16:20 UTC. Konektivitas transport operator saja bukan bukti penerimaan Agent Core. `src/memory/host-runtime.ts` hanya dirujuk sebagai pemilik pemilihan Memory yang sudah ada dan tidak diubah dalam tugas browser ini.

## 1. Hasil yang ingin dicapai

Agent Core dapat menggerakkan pointer halaman, hover, klik, drag, scroll, memasukkan teks, dan mengambil gambar tab yang dipilih **tanpa memindahkan kursor mouse utama Windows**. Pengguna tetap dapat bekerja di aplikasi atau tab lain.

Ini adalah perluasan `browser_control` yang sudah ada, bukan browser engine kedua, server MCP baru, sistem Memory baru, atau fitur khusus suatu game. Perubahan masuk ke source utama dan jalur build resmi Agent Core. Tidak ada implementasi paralel yang ditinggalkan di temp.

**Batas:** kontrol konten halaman browser. Toolbar browser, dialog file native, desktop Windows, dan aplikasi native berada di luar jaminan ini. Tab kerja yang sama tidak ditujukan untuk dikendalikan bersamaan oleh manusia dan agent. Operasi pada browser yang diminimalkan/background tidak dijanjikan selalu identik dengan tab terlihat.

## 2. Temuan source yang menjadi dasar

Inspeksi read-only dilakukan pada source browser di checkout cloud dengan HEAD `8a80251fd43234cc9ff82aa8746b65b1ef3bd6b3`. File source browser yang diperiksa sama dengan HEAD; checkout mempunyai perubahan dokumentasi sebelumnya. Ini **bukan verifikasi versi yang aktif di Windows**. Implementasi kemudian direkonsiliasi dengan source upstream tepat pada `8250441b7ce195a40390c772b03c5130bf3a391f` sebelum verifikasi dan build resmi; perubahan dokumentasi lokal sebelumnya tetap dipertahankan.

Sudah tersedia:
- `BrowserControlService`, pemilik sesi dan eksekusi browser.
- Transport browser Chromium terkelola dan transport extension untuk tab pengguna.
- Aksi `open`, `observe`, `act`, `close`, `status`.
- Operasi berbasis elemen teramati: `CLICK`, `TYPE_TEXT`, `SELECT`, `SCROLL`, `WAIT`, `SWITCH_TAB`, `PRESS_KEY`, `HOLD_KEY`, `BACK`.
- Klik dan scroll sudah memakai CDP `Input.dispatchMouseEvent`.
- Pembatasan target, izin `browser.navigate`/`browser.act`, aksi berurutan, dan cleanup sesi.

Yang perlu dilengkapi: pointer move/hover, drag utuh, input koordinat yang terikat observasi, scroll bertarget dua sumbu, screenshot viewport, serta pengiriman gambar ke controller tanpa hilang atau tersimpan tanpa sengaja.

## 3. Keputusan arsitektur

### Jalur utama: extension yang sudah ada

Perluas `extensions/agent-core-browser-bridge`, gunakan tab Brave yang dipilih secara eksplisit. Adapter memakai `chrome.debugger`; tidak perlu menggerakkan mouse Windows atau menambahkan remote-debugging TCP port.

Saat implementasi, periksa instalasi, versi, pairing, dan izin extension yang sebenarnya. Keberadaan folder source tidak berarti extension sudah terpasang. Jangan menginstal extension kedua atau membuat jalur pairing paralel.

### Jalur alternatif yang sudah tersedia

Pertahankan transport Chromium terkelola untuk sesi browser terpisah bila pengguna memilihnya. Jangan otomatis berpindah ke transport ini atau membuka browser lain ketika tab pengguna terputus. Jangan memakai profil yang sama pada dua proses browser sekaligus.

### Kepemilikan

Semua aksi melewati satu `BrowserControlService`. Transport hanya menjalankan perintah yang diizinkan. Tidak ada fallback diam-diam ke `SendInput`, `SetCursorPos`, clipboard OS, atau mouse global.

## 4. Kontrak capability yang direncanakan

Tetap gunakan satu tool `browser_control` dan pertahankan kompatibilitas actionId yang sudah ada.

- `observe`: tambahkan opsi tangkapan viewport beserta metadata; observasi tidak boleh menjalankan klik.
- `act`: tambahkan `POINTER_MOVE`, `HOVER`, `DRAG`, serta variasi klik/scroll bertarget. Mutasi tetap memerlukan izin `browser.act`.
- `status`: tampilkan target terikat, transport, dukungan screenshot, status pause, dan kemampuan controller menerima gambar.
- `close`: lepaskan tombol/modifier yang masih ditahan pada target yang sama, batalkan antrean, dan tutup hanya resource milik sesi.

**Penentuan target:** utamakan actionId hasil observasi. Mode koordinat menjadi opsi eksplisit dalam capability yang sama, bukan mengganti seluruh aksi menjadi koordinat mentah.

Untuk mode koordinat, setiap permintaan membawa `sessionId`, `captureId`, identitas dokumen/target, dan titik dalam **CSS pixel viewport**. Metadata gambar menyertakan ukuran gambar, ukuran viewport CSS, skala, offset crop/visual viewport, zoom/DPR yang relevan, waktu capture, dan versi geometri. Nama field diselaraskan dengan tipe kanonis saat implementasi; jangan menciptakan ID paralel jika kontrak yang ada sudah memilikinya.

Keputusan implementasi 11 Oktober 2026: capture berlaku default **30 detik**, dapat dikonfigurasi melalui `maxAgeMs` dari **1 sampai 120.000 ms**, dan hanya untuk **satu aksi mutasi**. Ini menggantikan default 5 detik pada draft karena round trip model vision eksternal dan tool secara normal dapat melampaui 5 detik. Identitas target/dokumen dan geometri tetap diperiksa ulang; navigasi atau perubahan geometri membatalkan capture. Masa berlaku dapat dipersempit oleh pemanggil. Posisi di luar viewport ditolak, bukan digeser diam-diam ke titik lain. Animasi halaman tetap dapat mengubah objek di dalam masa berlaku; screenshot tidak dianggap membekukan halaman. Perubahan TTL capture ini tidak mengubah batas jadwal drag 5 detik.

`DRAG` merupakan satu transaksi lengkap: tekan, lintasan terbatas, lepas. Batasi durasi maksimal 5 detik dan 120 titik. Jangan membuka mouseDown tanpa batas kepada controller. Respons membedakan perintah berhasil dikirim, hasil teramati, dan hasil yang tidak diketahui. Klik/drag tidak diulang otomatis setelah koneksi terputus.

**Batas implementasi yang harus dilaporkan:** `durationMs <= 5000` membatasi jadwal gesture yang diminta, bukan jaminan bahwa tombol fisik dilepas dalam 5 detik ketika transport macet. Cleanup release bersifat best-effort dengan timeout transport yang ada (10 detik pada host, 8 detik pada debugger extension). Ack yang hilang tetap menghasilkan status tidak pasti; jangan mengulang gesture otomatis atau mengklaim release terkonfirmasi tanpa bukti.

## 5. Penggunaan sehari-hari

1. Pengguna menghubungkan extension yang sudah disiapkan ke tab yang dipilih.
2. Agent Core menampilkan identitas tab/sesi dan status siap, tanpa membocorkan credential.
3. Agent mengambil observasi, memilih target, lalu menjalankan aksi melalui sesi itu.
4. Berpindah tab atau aplikasi oleh pengguna tidak mengubah target agent secara otomatis.
5. Tombol **Pause / Ambil alih / Lepaskan tab** memberikan kendali langsung kepada pengguna. Resume memerlukan observasi baru; perintah lama tidak dimainkan ulang.
6. Tab ditutup, debugger dilepas, atau izin dicabut menghentikan input sesi tersebut. Jangan melakukan reattach berulang setelah pengguna membatalkan.

Tidak memakai `Page.bringToFront` pada setiap gerakan/klik. Bila sebuah operasi memang membutuhkan aktivasi tab, tampilkan kebutuhan itu, bukan diam-diam mencuri fokus.

Penanda cursor berwarna pada halaman/preview boleh ditambahkan sebagai opsi tampilan. Penanda memakai `pointer-events: none`, dapat dimatikan, dan bukan mouse native kedua. Fitur dekoratif ini tidak menunda fungsi kontrol utama.

## 6. Screenshot dan controller visual

Screenshot harus sampai ke controller yang benar-benar menggunakannya. Menambah `Page.captureScreenshot` saja belum cukup.

Temuan jalur saat ini:
- Poll reply extension dibatasi 256 KiB.
- Result budget MCP juga mempunyai batas dan jalur spill ke file; gambar besar dapat terbuang dari respons atau tersimpan sebagai artefak.
- Jalur Native AI saat ini mengambil teks saja pada tool session, controller, dan provider.

Rancangan awal:
- Capture viewport saja; full-page capture bukan ruang koordinat awal.
- Gambar maksimal 128 KiB setelah encoding biner, metadata maksimal 16 KiB, envelope transport maksimal 240 KiB setelah base64/serialisasi. Pertahankan batas global yang ada.
- Gunakan resize/JPEG dengan dimensi dan skala dilaporkan. Jika detail yang diperlukan tidak terbaca atau gambar tidak muat, ambil crop yang diminta secara eksplisit; jangan mengirim gambar terlalu kabur seolah layak untuk menentukan klik.
- Jangan menggandakan bytes gambar dalam JSON teks dan content image sekaligus.
- Jangan memasukkan screenshot ke Memory, log rutin, atau spill disk tanpa kebijakan retensi yang jelas. Default fitur ini memproses gambar secara sementara dalam alur sesi.
- Perluas tipe hasil kanonis agar blok gambar diteruskan, termasuk pada Native AI **hanya bila provider/model yang dipilih mendukung input gambar**. Pertahankan mode actionId/DOM untuk controller text-only dan nyatakan kemampuan visualnya tidak tersedia; jangan mengklaim AI melihat gambar yang dibuang pipeline.

Tidak menambahkan provider baru atau mengganti model pengguna sebagai bagian dari fitur ini.

## 7. File utama dan tanggung jawab

| Lokasi kanonis | Perubahan yang direncanakan |
|---|---|
| `src/rdc/browser-control/service.ts` | Observasi gambar, dispatch pointer, freshness, serialisasi, pembatalan dan cleanup |
| `src/rdc/browser-control/pointer-actions.ts` (baru bila diperlukan) | Helper gesture kecil di bawah owner yang sama; bukan subsystem kedua |
| `src/mcp/rdc-schemas.ts`, `src/rdc/tools/schemas.ts` | Kontrak input konsisten dan kompatibel |
| `src/rdc/handlers/browser-control-handlers.ts`, `src/rdc/types.ts` | Respons aksi dan gambar beserta metadata |
| `src/mcp/rdc-tool-metadata.ts`, `src/agent-capability-catalog.ts`, `src/agent-tool-session.ts` | Iklan kemampuan, pembatasan grant, dan hasil multimodal |
| `src/rdc/browser-control/extension-bridge.ts` | Perintah transport bertipe dan batas data |
| `extensions/agent-core-browser-bridge/protocol.js`, `worker.js` | Allowlist minimum, capture, input, pairing/pause/detach yang sudah ada |
| `src/http/browser-bridge.ts`, `src/mcp/result-budget.ts` | Enforcement ukuran gambar dan cegah spill private pixels yang tidak disengaja |
| `src/agent-controller.ts`, `src/agent-provider.ts` | Penerusan gambar sesuai kemampuan provider; tetap mendukung text-only |
| `src/index.ts` | Gunakan cleanup owner yang sudah terdaftar; jangan tambah service duplikat |

`src/mcp/server.ts` tetap memakai registrasi `browser_control` yang sama. Lokasi source harus dicocokkan ulang dengan checkout Windows saat eksekusi; jangan menimpa integrasi lain yang berjalan.

## 8. Tahapan implementasi yang disetujui

### Tahap 1 — Cocokkan source dan runtime utama
- Petakan source browser, build output resmi, versi extension terpasang, dan runtime aktif.
- Pertahankan perubahan lokal. Jangan membuat checkout aplikasi kedua sebagai tujuan integrasi.
- Hasil: target perubahan dan jalur aktivasi nyata sudah jelas.

### Tahap 2 — Lengkapi kontrak dan input browser
- Perluas schema, owner, metadata, dan helper gesture secara konsisten.
- Implementasikan hover/move/drag/scroll bertarget dengan grant, target binding, dan cleanup yang sudah ada.
- Pertahankan seluruh operasi actionId lama.
- Hasil: fungsi pointer tersedia melalui tool yang dipakai controller, bukan hanya helper internal.

### Tahap 3 — Lengkapi capture hingga diterima controller
- Tambahkan hanya metode CDP/metrics yang dibutuhkan ke kedua allowlist.
- Implementasikan envelope gambar terbatas, geometri capture, validasi freshness, dan penerusan multimodal kanonis.
- Hasil: controller visual yang didukung menerima gambar sebenarnya; controller text-only mendapat kemampuan yang dilaporkan dengan jujur.

### Tahap 4 — Integrasikan kendali pengguna dan lifecycle
- Lengkapi pause/takeover, selected-tab binding, detach, timeout, dan release tombol.
- Jangan menentukan intervensi manusia hanya dari `event.isTrusted`: input CDP juga dapat menghasilkan event trusted.
- Hasil: penghentian kendali bekerja tanpa mengganggu mouse Windows atau proses lain.

### Tahap 5 — Build resmi dan aktivasi nyata
- Bangun source kanonis lewat konfigurasi proyek yang ada.
- Perbarui komponen/extension yang memang berubah, memakai mekanisme normal dan izin yang sesuai. Tidak ada port debugging baru atau perubahan keamanan tersembunyi.
- Pastikan runtime aktif memakai output tersebut. Jangan menyatakan selesai bila hasil hanya berada di temp.
- Laporkan status setiap artefak sementara; pembersihan hanya pada artefak yang terbukti tidak dipakai dan tidak menyimpan pekerjaan unik.

## 9. Kriteria selesai untuk review

- Pada Brave Windows, controller dapat hover, klik, drag, scroll bertarget, dan memasukkan teks pada tab terpilih.
- Saat aksi agent dijalankan, posisi mouse utama Windows tidak berpindah akibat fitur ini; pengguna dapat bekerja di aplikasi lain.
- Mengganti tab aktif tidak mengirim aksi ke tab yang salah.
- Navigasi, resize/zoom, pause, tab close, dan putus koneksi tidak menyebabkan klik lama dimainkan ulang atau tombol tersangkut.
- Screenshot beserta geometri sampai ke controller visual yang didukung; tidak ada klaim visual pada jalur text-only.
- Source utama → output build resmi → entrypoint runtime aktif dapat ditunjukkan, dan tidak ada implementasi paralel yang menjadi ketergantungan tersembunyi.

Pemeriksaan regresi difokuskan pada bagian yang berubah dan perilaku nyata di atas, bukan proyek benchmark. Gunakan rumah pemeriksaan browser yang sudah ada. Temuan rutin diselesaikan dalam implementasi; persetujuan tambahan hanya untuk perubahan akses/keamanan atau keputusan material yang belum diberikan.

## 10. Batas izin dan keputusan review

Izin extension `debugger` bersifat luas. Penguncian satu tab adalah pembatasan aplikasi, bukan isolasi keamanan Windows. Fitur tidak menjamin menahan controller yang juga memiliki akses debugger atau eksekusi lokal tanpa batas.

**Cakupan yang disetujui:** perluas `browser_control` yang sudah ada; jalur utama extension tab Brave; cakupan pointer + capture + pengiriman visual yang didukung + pause; tanpa mouse OS atau VM. Mode koordinat merupakan perluasan eksplisit atas kontrak lama yang hanya menerima actionId.

Status draft awal telah digantikan oleh persetujuan implementasi pengguna. Persetujuan tersebut mencakup perubahan source rutin dan verifikasi terarah sesuai cakupan tugas; ini tidak mengubah batas konfirmasi untuk perubahan keamanan/akses, instalasi extension, credential, release, atau deployment. Build source, publikasi source, aktivasi Windows, dan sinkronisasi canonical live Memory tetap dilaporkan sebagai hasil terpisah berdasarkan bukti aktual.

## Referensi teknis resmi

- Chrome debugger API: https://developer.chrome.com/docs/extensions/reference/api/debugger
- Peringatan izin extension: https://developer.chrome.com/docs/extensions/reference/permissions-list
- Brave extension support: https://support.brave.com/hc/en-us/articles/360017909112-How-can-I-add-extensions-to-Brave
- CDP Input: https://chromedevtools.github.io/devtools-protocol/tot/Input/
- CDP Page: https://chromedevtools.github.io/devtools-protocol/tot/Page/
- Playwright Mouse: https://playwright.dev/docs/api/class-mouse
- Playwright screenshot: https://playwright.dev/docs/api/class-page#page-screenshot
- Playwright input actions: https://playwright.dev/docs/input
