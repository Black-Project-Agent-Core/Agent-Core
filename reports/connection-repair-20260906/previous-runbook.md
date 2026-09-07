# Agent Core: Runbook Koneksi untuk Sesi Baru

Dibuat 6 September 2026. Laporan utama: `reports/connection-review-20260906/Agent-Core-Connection-Review-2026-09-06.md`.

## Jangan menyatakan tidak terhubung sebelum menguji

Lakukan discovery alat Agent Core melalui fasilitas konektor yang tersedia, kemudian panggil `agent_core_status`. Keberadaan nama plugin di prompt bukan bukti koneksi berhasil; tidak adanya alat tertentu juga bukan bukti server mati. Simpan error aktual dan bedakan lapisannya.

| Kondisi | Interpretasi dan tindakan |
|---|---|
| Discovery tidak mengekspos alat | Periksa daftar/izin/snapshot host. Jangan mendiagnosis runtime tanpa tes |
| `agent_core_status` sukses | Koneksi nyata berhasil. Lanjutkan ke `agent_core_health_metrics` |
| Status sukses, alat baru tidak ditemukan | Bandingkan `agent_core_capabilities` dengan definisi konektor. Scan/refresh metadata melalui host bila diperlukan |
| HTTP 401 | Periksa refresh, expiry, client/resource binding dan revocation; jangan langsung menghapus `oauth.json` |
| `WORKSPACE_PROJECT_AMBIGUOUS` | Routing menolak scope yang ambigu; bukan putus koneksi |
| Health/runtime benar-benar tidak menjawab | Periksa proses, port, launcher dan tunnel dengan bukti aktual |
| `audit_pipeline_degraded` atau `EPERM` | Jangan memakai ketiadaan log baru sebagai bukti ketiadaan kegagalan |

Untuk proyek Agent Core, gunakan `projectRoot: E:\Projects\Agent-Core` dan hanya sebut root target itu dalam task/context routing. Jangan menyalin semua workspace roots dari hasil status ke konteks task.

## Temuan penting yang tidak boleh dilupakan

Pada 6 September 2026, konektor dapat dipakai berulang. Runtime mengiklankan 69 alat, tetapi konektor sesi mengekspos 55; `subagentcore` tidak ditemukan oleh discovery walaupun diiklankan runtime. Penyebab host spesifik masih belum dipastikan.

Kode OAuth aktif memiliki race pada baca-ubah-tulis file. Probe sintetis tiga putaran menunjukkan 1/8 token masih valid dan refresh token yang sama diterima dua kali. Kandidat terisolasi memperbaiki race dan penyimpanan penggantian grant, lulus 44/44 tes serta build. **Kandidat belum diterapkan pada produksi.**

Kandidat: `.worktrees/connection-review-20260906`, branch `fix/oauth-concurrency-review-20260906`. Patch terbatas: `reports/connection-review-20260906/oauth-concurrency-candidate.patch`. Worktree memuat overlay perubahan sebelumnya; jangan commit seluruhnya.

Audit aktif memiliki `EPERM` dan pencatatan terhenti. Snapshot review mencatat entri terakhir pada 6 September 2026 pukul 00:50:02.873 WIB. Perbaikan audit masih diperlukan. Klaim “semua stabil” belum dapat dibuat.

## Pengamanan

Jangan mencetak `.env`, raw access/refresh token, API key, client secret, atau isi penuh OAuth store. Jangan mereset OAuth, restart/rebuild produksi, menimpa pekerjaan sesi lain, atau mengganti identitas resource sebagai percobaan tanpa bukti. Gunakan credential sintetis untuk tes, pertahankan grant produksi, dan simpan hasil uji beserta hash file.

Baca laporan utama sebelum cutover. Uji akhir perlu dua chat ChatGPT nyata dan log baru yang sehat; simulasi SDK bukan pengganti penuh pengujian tersebut.
