# Agent Core: Diagnosis Koneksi

Panduan ini dipakai sebelum menyatakan Agent Core tidak terhubung. Discovery alat host, status runtime, kesehatan rinci, autentikasi, scope routing, dan log adalah **lapisan terpisah**. Kegagalan pada satu lapisan bukan bukti bahwa lapisan lain mati.

## Jangan menyatakan tidak terhubung sebelum menguji

Lakukan discovery alat Agent Core melalui fasilitas konektor yang tersedia, lalu panggil `agent_core_status`. Keberadaan nama plugin pada prompt bukan bukti koneksi berhasil; tidak adanya satu alat tertentu juga bukan bukti server mati. Simpan error aktual dan bedakan lapisannya.

| Kondisi | Interpretasi dan tindakan |
|---|---|
| Discovery tidak mengekspos alat | Periksa daftar/izin/snapshot host. Jangan mendiagnosis runtime tanpa tes |
| `agent_core_status` sukses | Koneksi nyata berhasil. Lanjutkan ke `agent_core_health_metrics` |
| Status sukses, alat baru tidak ditemukan | Bandingkan `tools/list` terautentikasi pada server dengan Actions yang tersedia bagi host. Tentukan mekanisme pembaruan registrasi yang benar-benar tersedia pada jenis koneksi tersebut |
| HTTP 401 | Periksa refresh, expiry, client/resource binding, dan revocation; jangan langsung menghapus `oauth.json` |
| HTTP 403 pada `/health/metrics` | Perilaku yang benar: metrik rinci hanya untuk loopback. Gunakan `agent_core_health_metrics` |
| `WORKSPACE_PROJECT_AMBIGUOUS` | Routing menolak scope yang ambigu; bukan koneksi putus |
| Health/runtime benar-benar tidak menjawab | Periksa proses, port, dan tunnel dengan bukti aktual |
| `audit_pipeline_degraded` atau `EPERM` | Jangan memakai ketiadaan log baru sebagai bukti ketiadaan kegagalan |

Sebut atau pilih Agent Core secara eksplisit pada pesan yang membutuhkan aksi konektor.

## Custom plugin pada ChatGPT web

Antarmuka custom plugin personal dapat berbeda dari pengelolaan app pada workspace organisasi. Pada koneksi yang diperiksa, menu Manage menampilkan Reconnect, Disconnect, dan Delete tanpa Refresh Actions. Jangan mengarahkan pengguna ke kontrol workspace yang tidak tersedia atau menganggap Reconnect pasti memindai ulang schema tool.

Pengaturan **Allow all actions** menentukan kapan host meminta persetujuan untuk tool yang sudah dikenal. Pengaturan itu tidak membuktikan bahwa tool baru sudah masuk ke daftar Actions. Build paket skill lokal, versi plugin pada halaman detail, status subsistem runtime, dan daftar tool callable pada host juga merupakan bukti yang berbeda.

Jika server menyediakan tool baru tetapi host belum mengenalinya, simpan hasil perbandingan dan identifikasi cara pembuatan koneksi: URL MCP, tunnel, atau paket plugin. Verifikasi mekanisme pembaruan registrasinya sebelum mengubah koneksi. Jangan menghapus koneksi yang masih berfungsi hanya berdasarkan dugaan cache.

Pada setup ini pengguna melaporkan batas satu tunnel/koneksi aktif, sehingga pengujian dengan registrasi duplikat tidak tersedia. Simpan URL tunnel asli dan pengaturan autentikasi sebelum mengganti registrasi custom plugin secara satu-per-satu. Gunakan kembali URL dan tunnel yang sama, lalu periksa hasil discovery dan uji di percakapan baru. Jangan menganggap URL protected resource internal pada konfigurasi sama dengan URL registrasi yang dimasukkan pengguna. Lihat [panduan resmi Plugins](https://developers.openai.com/plugins/deploy/connect-chatgpt).

Pada 2026-09-09 pengguna melaporkan bahwa registrasi ulang berhasil: ChatGPT web mengekspos `craft_source`, `workflow_plan`, dan `workflow_status`, serta berhasil memanggil `agent_core_status`. Ini membuktikan hasil discovery pada koneksi yang dilaporkan; belum merupakan bukti pemanggilan seluruh workflow dari percakapan tersebut. Sesi lain dapat masih membawa definisi tool lama.

### Kapan memperbarui registrasi

| Perubahan | Tindakan |
|---|---|
| Tambah/hapus/ganti nama tool; ubah schema input/output, deskripsi, anotasi, atau metadata autentikasi | Deploy server terbaru, perbarui metadata koneksi, lalu periksa Actions dan uji tool. Pada UI setup ini, registrasi ulang adalah cara yang sudah berhasil digunakan |
| Perbaikan implementasi internal dengan kontrak MCP yang tetap | Build/deploy/restart runtime sesuai perubahan, lalu uji perilakunya. Registrasi ulang biasanya tidak diperlukan |
| README atau pengujian lokal tanpa perubahan runtime maupun metadata plugin | Tidak memerlukan registrasi ulang MCP |

Perubahan skill yang dikemas di dalam plugin mengikuti mekanisme pembaruan paket skill, terpisah dari discovery tool MCP. Hindari menjadikan registrasi ulang sebagai kewajiban untuk setiap perubahan kode.

## Endpoint yang relevan

```text
http://127.0.0.1:8765/health
http://127.0.0.1:8765/health/metrics
http://127.0.0.1:8787/readyz          readiness tunnel
```

## Lifecycle

Pemilik lifecycle Windows hanya satu:

```text
SubProject\Agent-Code\Agent Code Native.exe
```

Jangan menjalankan pengendali kedua dan jangan menjalankan runtime dari worktree kandidat. Restart, reset OAuth, autostart, dan exit dilakukan dari panel Agent Core di dalam Agent Code.

## Scope routing

Untuk proyek ini gunakan hanya `E:\Projects\Agent-Core` sebagai root target pada konteks routing. Jangan menyalin seluruh allowed roots ke satu task lalu menganggap `WORKSPACE_PROJECT_AMBIGUOUS` sebagai koneksi putus.

## Penyimpanan aktif

Generasi penyimpanan aktif dipilih lewat pointer di root proyek:

```text
runtime\persistence.json      schemaVersion + generation aktif
runtime\persistence-<gen>\data
runtime\persistence-<gen>\logs
```

`src/config.ts` memilih generasi tersebut melalui `src/runtime/persistence-paths.ts`, termasuk ketika lifecycle mengirim path bawaan `runtime/data` dan `runtime/logs`. Override shadow yang terpisah tetap dipertahankan.

Jangan menghapus pointer atau mengganti data aktif dengan snapshot lama: grant baru bisa hilang atau credential lama bisa hidup kembali. Cari audit aktif pada generasi yang sedang dipilih, bukan pada direktori log lama.

Startup gagal tertutup dengan `PERSISTENCE_MANIFEST_INVALID` jika generasi tidak lengkap atau tidak dapat dibaca; itu perilaku yang benar, bukan kerusakan koneksi. Perbaiki generasi atau ACL-nya, jangan membuat identitas kosong.

## Monitoring audit

`audit.written` adalah penghitung per proses dan dapat kembali kecil setelah restart. Gunakan sequence audit persisten dan identitas proses untuk memeriksa kemajuan lintas restart, bukan nilai counter mentah.

## Pengamanan

Jangan membaca atau mencetak nilai `.env`, raw API key, access/refresh token, client secret, atau isi penuh penyimpanan autentikasi ke percakapan. Pemakaian credential untuk pengujian yang sah harus tetap di mesin dan tidak masuk ke laporan.

Simulasi dua klien SDK bukan pengganti pengujian dua chat ChatGPT nyata. Jangan menyatakan gate host lulus berdasarkan probe loopback saja.
