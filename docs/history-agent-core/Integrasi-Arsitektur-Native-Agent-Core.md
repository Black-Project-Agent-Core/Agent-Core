# Integrasi Arsitektur Native Agent Core

## Rekonsiliasi arsip — 2026-10-29

Status: COMPLETED — administrasi scope R4 yang telah CLOSED BY USER DECISION; bukan klaim semua rancangan historis lulus benchmark.

Instruksi pengguna 2026-10-29 meminta tidak ada dokumen proposal/antrean dashboard tersisa. Keputusan eksplisit 2026-10-24 bahwa R4 selesai dan benchmark lanjutan bukan syarat tetap berlaku. Catatan PENDING lama adalah sejarah yang sudah disupersesi, bukan pekerjaan aktif yang dipindahkan diam-diam. Tidak ada benchmark yang dibuka ulang atau hasil inconclusive diubah menjadi PASS.

Native dipakai sebagai partner nyata dalam task penuntasan: observed Opus5.5/max menyelesaikan review retensi dan uji inquiry; build/resident diperiksa terpisah. [Bukti penuntasan](../verification/Proposal-Completion.md), [review Native](../verification/Native-Proposal-Review.md), [uji resident](../verification/Native-Inquiry-Resident-Review.md). Otorisasi arsip berasal dari permintaan antrean nol saat ini; scope R4 tidak diperluas. Revisi administratif 5. Path asal `docs/proposals/Integrasi-Arsitektur-Native-Agent-Core.md`; arsip setelah Learning `docs/history-agent-core/Integrasi-Arsitektur-Native-Agent-Core.md`.

## Riwayat keputusan R4

Tanggal: 2026-10-23 (Asia/Tomsk)  
Revisi: 4  
Status: CLOSED BY USER DECISION (2026-10-24) — scope R4 ditutup; Native dan External Agent Core tersedia untuk operasi; benchmark tambahan tidak menjadi syarat penutupan  
Jenis: Improvement  
Tujuan integrasi: Native Agent Core existing, melalui adopsi pola terpilih dari enam proposal sumber  
Asal dan bukti: enam dokumen pada tabel sumber di bawah, inspeksi source Agent Core lokal, dan keputusan pengguna dalam chat tugas ini

Dokumen ini menyatukan rancangan, keputusan, batas implementasi, dan acceptance. Dokumen bukan bukti bahwa semua gelombang telah diimplementasikan atau diaktifkan. Keenam dokumen sumber tetap dipertahankan sebagai asal analisis; klaim statis tentang donor tidak berubah menjadi klaim kompatibilitas runtime.

## KEPUTUSAN TERAKHIR — CLOSED / USER-ACCEPTED (24 OKTOBER 2026)

**Pengguna secara eksplisit menutup task Native Agent Core Revision 4. Status terkini adalah CLOSED, bukan IN PROGRESS, PARTIAL atau PENDING.** Pengguna menilai kelanjutan benchmark/model-test tidak relevan dengan tujuan improvement Agent Core dan meminta agar sesi berikutnya tidak menganggap pekerjaan ini belum selesai.

**Hasil operasional yang boleh dijadikan dasar:** Native AI Agent Core v0.15.0 dan akses AI eksternal melalui MCP yang terautentikasi tersedia sesuai izin masing-masing; verifikasi sebelumnya mencakup 74/74 regresi terarah, 22/22 regresi provider readiness/pool, compile TypeScript, restart resmi exit0, health Core `ok`, dan Memory/Execution/Native `available`. Rotasi sibling key OpenRouter saat 429 dan satu tool call model bernama juga berhasil dalam uji terisolasi. Bukti tersebut bertanggal dan tidak menjamin semua key/provider selalu tersedia.

**Yang sengaja tidak diwajibkan lagi:** benchmark kualitas model, evaluasi kausal peningkatan Memory coding/research/browser, dan diagnosis ulang HTTP400 historis **bukan tugas aktif ataupun syarat penggunaan**. Hasil omit/reuse yang belum konklusif tetap dicatat sebagai riwayat dan **tidak boleh dinyatakan PASS**. Tidak ada permintaan untuk menambah tes, mengubah kredensial, model produksi, scheduler, permission, source, build, restart, release, atau deploy. Gangguan nyata di pekerjaan pengguna kelak adalah task baru yang harus didiagnosis berdasarkan bukti baru dan otorisasi saat itu.

**Prioritas ke depan:** gunakan Agent Core untuk tugas nyata dan lakukan peningkatan yang relevan dengan kebutuhan pengguna, bukan membuka kembali R4 berdasarkan checklist historis. Semua bagian berlabel PENDING/IN PROGRESS dalam kronologi, tabel lama atau rencana paket berikutnya di bawah adalah **catatan historis yang disupersesi keputusan ini**, bukan pekerjaan menunggu eksekusi.

[Laporan penutupan dan bukti historis R4](Native-Architecture-Integration-Revision-4-Execution.md).

**Checkpoint terverifikasi 2026-10-24:** koreksi admission browser pre-dispatch telah melewati **74/74 tes terarah**, pemeriksaan path **467/0**, kompilasi TypeScript, runner self-check tanpa provider, serta restart resmi `exitCode=0`; Core baru PID `10648` dan `/health ok` membuktikan aktivasi resident. Lihat [laporan R4 terkini](Native-Architecture-Integration-Revision-4-Execution.md). Pada checkpoint eksperimen **sebelum keputusan penutupan**, R4 pernah berstatus **PARTIAL** akibat HTTP 400 dan eksperimen Memory yang tidak konklusif. **Status aktif sekarang adalah CLOSED atas keputusan pengguna**, tanpa mengubah fakta bahwa manfaat kausal Memory belum terbukti. Hasil fixture dan uptime bukan bukti kausal manfaat Memory; cohort sebelumnya tidak diulang.

**KEPUTUSAN EVALUASI HISTORIS SEBELUM PENUTUPAN (2026-10-24; TIDAK LAGI AKTIF):** uji ketiga provider terlebih dahulu; maksimum 120 panggilan model hanya pada jalur free-tier; pakai key aktif hingga terkena limit lalu pilih key lain provider yang sama dan baru provider berikutnya jika perlu; evaluasi Memory **coding/research lebih dulu**, browser nanti. Konfigurasi runtime sudah memuat 18 key Atria, 18 Gonka, 20 OpenRouter dari akun terpisah (angka hanya metadata), dan regresi scheduler/readiness **22/22 PASS**. Uji model gratis OpenRouter Nemotron 3 Ultra menggunakan **5 model requests** dan berhasil melakukan pergantian key pada 429 serta mengembalikan nonce tool yang tepat; status katalog Atria401 dan Gonka200 namun metadata kurang lengkap. Rincian serta keterbatasan uji coding/research dicatat pada [execution record R4](Native-Architecture-Integration-Revision-4-Execution.md). Tidak ada model, API key, cursor produksi, ataupun grants yang diganti.

## Masalah dan tujuan

Enam proposal menjelaskan cara model dipanggil, tool dijalankan, konteks diproyeksikan, dan jawaban dikirim pada enam harness berbeda. Sebagian besar rekomendasi awalnya menghubungkan tool/Memory eksternal ke harness donor. Permintaan pengguna sekarang mengarahkan hasilnya ke Native Agent Core: ambil pola yang berguna sambil mempertahankan satu runtime, satu owner percakapan, dan owner Memory/Learning existing.

Native ditujukan menjadi **partner kerja serbaguna** untuk coding, riset/dokumen, serta browser/komputer: menerapkan pelajaran yang relevan, mengurangi langkah/waktu/biaya, mempertahankan tujuan dan keputusan lintas sesi, dan menunjukkan bukti penggunaan ingatan secara ringkas. Reliability yang telah diverifikasi pada revisi sebelumnya dipertahankan. Urutan engineering Revisi 4 adalah menyelaraskan kontinuitas provider terlebih dahulu, lalu membuktikan reuse pada pekerjaan campuran sambil mengukur waktu dan biaya.

Hasil yang dituju:

- Task mempunyai status, hasil final tersimpan, error, stop, dan recovery yang konsisten dan dapat diperiksa.
- UI terputus tidak membatalkan task ketika Agent Core masih hidup. Setelah restart, hanya checkpoint aman yang dilanjutkan; efek mutasi yang belum diketahui harus direkonsiliasi.
- Recall relevan bekerja otomatis melalui Memory canonical. Penyimpanan pengetahuan tetap melalui Learning existing dengan bukti, provenance, dan review yang sesuai.
- Manfaat pada task berikutnya dinilai dari penggunaan pengetahuan yang benar-benar terjadi dan hasil terverifikasi. Retrieval saja tidak membuktikan manfaat.
- Percepatan dan penghematan hanya dipertahankan bila pembanding menunjukkan manfaat tanpa menurunkan correctness.

## Keputusan pengguna dan scope

Keputusan berikut berasal dari jawaban pengguna pada perencanaan tugas ini. Catatan ini tidak membuat record approval Skill, grant runtime, atau bukti user-message baru.

| Keputusan | Pilihan yang diterima | Konsekuensi implementasi |
| --- | --- | --- |
| Pendekatan | Adopsi pola terbaik | Native existing tetap owner; tidak memasang atau mengganti inti dengan runtime donor. |
| Peran | Partner kerja serbaguna | Acceptance mencakup coding, riset/dokumen, dan browser/komputer. |
| Sasaran pertama | Ketiga target tetap dituju; langkah awal diserahkan pada penilaian engineering | Reliability didahulukan; Memory existing dipakai; metrik dimulai sebagai baseline. Ini pilihan engineering dalam delegasi pengguna. |
| Memory | Otomatis berbasis bukti | Recall relevan otomatis; durable knowledge melalui review Learning existing dan provenance. |
| Provider/key | Satu posisi aktif global untuk seluruh sesi Native | Sukses, sesi baru, disconnect, dan restart tidak memutar key; habiskan key layak provider aktif dahulu. Provider sebelumnya yang pulih tidak mengambil alih. |
| Readiness model | Otomatis ketika konfigurasi key/model berubah | Katalog provider dan probe tool minimal sebelum task; model terkonfigurasi diutamakan, alternatif kompatibel diperiksa bila perlu. Unknown tetap pending/unavailable. |
| Kuota/biaya | Gunakan pool existing tanpa batas nominal baru | Batas eksekusi existing tetap berlaku; quota, outage, model/plan/context mismatch, dan auth dibedakan. Biaya hanya dilaporkan ketika tersedia. |
| Scope pengetahuan | General boleh lintas proyek; detail proyek tetap scoped | Applicability, provenance, perubahan sumber, dan supersession diperiksa; ditemukan, diterapkan, diverifikasi, dan manfaat terukur dipisahkan. |
| Continuation | Lanjut dan pulihkan dengan aman | Disconnect UI berbeda dari stop pengguna; restart menggunakan checkpoint aman; mutasi berstatus unknown tidak diulang buta. |
| Acceptance | Campuran tiga bidang, diikuti penggunaan Memory pada task terkait | Bukti hasil dan efek reuse dipisahkan dari exposure/recall. |
| Prioritas UI | Status jelas, hasil andal | Progress, persisted final, error, stop, dan recovery lebih dahulu; token streaming dipertimbangkan pada gelombang berikutnya. |
| Otorisasi | Implementasi plan pada 2026-10-23 dan pencabutan pembatasan Native pada 2026-10-24 | Native AI Agent Core tersedia untuk pengembangan dan operasi; authentication, task grants, path policy, dan checkpoint tetap berlaku. |

Instruksi eksplisit pengguna adalah **"PLEASE IMPLEMENT THIS PLAN"** untuk Revisi 4. Pengguna kemudian meminta Core tetap hidup selama aplikasi digunakan, termasuk tanpa aktivitas, dan memperbaiki status ON/OFF berulang. Pekerjaan ini terotorisasi; status implementasi dan resident tetap harus dibuktikan terpisah.

## Bukti dan ketidakpastian

### Enam sumber dan identitas historis

| Sumber | Snapshot yang tertulis dalam proposal | Klasifikasi bukti |
| --- | --- | --- |
| [OpenClaw](../plans/architecture_integration_proposal_openclaw.md) | `F:\Workflow\openclaw`, HEAD `b5ae1a4363815be651d639a9d78e480cda6c7a42`, versi `2026.10.6` | Klaim inspeksi statis pada dokumen sumber. Tujuan awal tertulis DeepSeek Harness, bukan aplikasi Agent Core ini. |
| [Odysseus](../plans/architecture_integration_proposal_odysseus.md) | `F:\Workflow\odysseus`, HEAD `01566b158e627748f70ac402571f2f78241fb6f9` | Klaim inspeksi statis pada dokumen sumber. |
| [Kimi Code](../plans/architecture_integration_proposal_kimi_code.md) | `F:\Workflow\kimi-code`, audit 2026-10-23 | Proposal tidak mencantumkan commit sumber terpin; identitas commit donor belum diketahui. |
| [Hermes](../plans/architecture_integration_proposal_hermess.md) | `F:\Workflow\Hermes-Official-20261003`, ditulis 2026-10-23 | Nama folder bukan bukti commit; commit donor belum diketahui. |
| [Grok Build](../plans/architecture_integration_proposal_grok.md) | `F:\Workflow\grok-build`, `SOURCE_REV=559751fdcec02d413e4c57c8832ab275e4f44980` | `SOURCE_REV` adalah identitas yang dicatat proposal; tidak diklaim sebagai hasil verifikasi Git upstream pada tugas ini. |
| [DeepSeek Harness](../plans/architecture_integration_proposal_deepseek.md) | `F:\Workflow\deepseek-harness`, branch `master`, HEAD `687f282e8625c6b8d11ff58211a90524be2e4317` | Klaim inspeksi statis pada dokumen sumber. |

Identitas penerbit upstream telah ditelusuri melalui dokumentasi resmi: [OpenClaw](https://docs.openclaw.ai/) → [openclaw/openclaw](https://github.com/openclaw/openclaw) (MIT), [Odysseus](https://odysseus-dev.github.io/odysseus/) → [odysseus-dev/odysseus](https://github.com/odysseus-dev/odysseus) (AGPL-3.0-or-later), [Kimi Code](https://moonshotai.github.io/kimi-code/en/) → [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) (MIT), [Hermes](https://hermes-agent.nousresearch.com/) → [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) (MIT), [xAI Grok Build](https://x.ai/news/grok-build-open-source) → [xai-org/grok-build](https://github.com/xai-org/grok-build) (Apache-2.0), dan [DeepSeek Harness](https://deepseek.com/en/harness) → [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) (MIT). Ini verifikasi upstream saat penelitian; revisi dan lisensi snapshot lokal serta kompatibilitas runtime tetap bukti terpisah. Tidak ada kode/runtime donor yang dipasang atau disalin. Kesamaan nama paket tidak membuktikan kompatibilitas.

Pemeriksaan lokal 2026-10-24 mencatat HEAD, origin, status tracked worktree, serta header dan SHA-256 LICENSE keenam snapshot pada [bukti snapshot R4](Native-Architecture-Integration-Revision-4-Execution.md#local-donor-snapshot-evidence). Grok mempunyai HEAD `2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8` dan `SOURCE_REV` terpisah sebagaimana tabel di atas. Tidak ada klaim kompatibilitas runtime donor dari pemeriksaan metadata ini.

### Keadaan awal Agent Core yang diperiksa

Inspeksi source lokal sebelum perubahan menunjukkan owner yang dapat dipakai kembali:

- [Native controller](../../src/agent-controller.ts) sudah mempunyai recall otomatis, Learning finalization, capability grants, batas iterasi/attempt, dan continuation berbasis state checkpoint.
- [Chat service](../../src/agent-chat-service.ts) dan [chat store](../../src/agent-chat-store.ts) sudah mempunyai task/turn ownership, persistensi, deduplikasi `clientRequestId`, recovery turn, dan resume manual.
- [Durable turn checkpoint](../../src/agent-turn-checkpoint.ts) sudah mempunyai kontrak continuation DTC-1. Ini dasar recovery, bukan alasan membuat log atau checkpoint engine kedua.
- [Provider](../../src/agent-provider.ts) memakai `stream: false`; tool loop Native existing menjalankan tool secara berurutan. Token streaming dan tool parallel belum boleh dinyatakan tersedia dari proposal donor.
- Pada baseline yang diperiksa, `assistant.final` dari controller dapat mendahului commit jawaban di chat store; startup mengenali checkpoint tetapi belum otomatis menjalankan resume aman.

Temuan source bukan bukti bahwa binary resident sudah diperbarui atau seluruh jalur live lulus. Revisi sumber, hash build, hasil test, dan status runtime aktual harus diisi pada bagian bukti pelaksanaan.

### Baseline yang belum diketahui

Belum ada hasil terukur end-to-end untuk tingkat keberhasilan task campuran, manfaat reuse pada task berikutnya, distribusi latency, tambahan token recall, atau biaya provider dalam tugas ini. Nilai tersebut berstatus **UNKNOWN**, bukan nol dan bukan klaim peningkatan. Tidak ada benchmark berbayar atau provider/model baru yang tersirat dari baseline ini.

## Mekanisme dan owner existing yang dipakai

### Aliran yang dipertahankan

`Permintaan pengguna → chat service/store → Native controller → scheduler/provider existing → tool executor dengan grant/budget → checkpoint/outcome → persistensi final → event/status UI`

Memory dan Learning memakai owner canonical existing. Task outcome dan status Learning dilaporkan terpisah. Keberhasilan pekerjaan tidak dihapus karena finalisasi Learning gagal; kegagalan Learning tetap terlihat dengan jalur pemulihan yang benar.

| Subsystem | Tanggung jawab |
| --- | --- |
| Chat service/store | Identitas request, antrian/sesi, status turn, persistensi final, event hasil yang konsisten dengan data tersimpan. |
| Native controller/runtime | Jalur model/tool existing, validasi hasil, grant dan attempt budget, checkpoint pada batas aman. |
| Provider scheduler | Konfigurasi model/provider dan fallback existing; tidak ada router cerdas baru. |
| Tool session/checkpoint | Identitas call, admission, mutasi yang belum diketahui, pembatalan, dan validasi otoritas saat resume. |
| MemoryService | Recall dan penyimpanan canonical pada `runtime/memory`; tidak ada store atau writer tandingan. |
| Learning existing | Kandidat berbukti, disposition/review, atribusi penggunaan, dan status finalisasi terpisah dari outcome task. |
| UI/transport existing | Status/progress, hasil final persisted, error, stop, serta recovery; disconnect transport bukan stop pengguna. |

### Pemetaan pola donor

**Sudah tersedia** berarti owner/pola dasarnya ditemukan di source Agent Core; bukan klaim seluruh semantik donor sudah sama. **Diadaptasi** berarti masuk perubahan reliability yang dituju; pelaksanaannya tetap membutuhkan bukti. **Ditunda** tetap roadmap terbuka. **Ditolak** tidak menjadi bagian integrasi ini.

| Donor | Sudah tersedia / dipakai kembali | Diadaptasi | Ditunda | Ditolak |
| --- | --- | --- | --- | --- |
| OpenClaw | Satu owner turn, pembatalan, admission tool, Memory canonical. | Pisahkan stream/progress, hasil terminal, dan hasil yang benar-benar tersimpan/dikirim; pertahankan identity dan bounded attempts. | Eksekusi tool asinkron seperti `sessions_yield`, perubahan transport model, dan perluasan plugin tanpa consumer konkret. | Menyalin loop OpenClaw atau menganggap paket `agent-core` donor sebagai aplikasi ini. |
| Odysseus | Persistensi chat dan owner hasil existing. | Final otoritatif harus konsisten dengan chat store; disconnect UI tidak menjadi cancel; recovery tidak menduplikasi jawaban atau efek. | Adopsi protokol SSE donor dan model caller alternatif. | Memasang Python service/orchestrator kedua atau memindahkan completion gate donor secara utuh. |
| Kimi Code | Scope task/session, grant, tool identity, dan budget existing. | Lifecycle final/failed/stopped/recovery yang jelas; timeout/recall opsional tidak merusak task utama. | XState actors, scheduler tool parallel, dan perubahan rendering token. | Mengganti mesin Native dengan Kimi v2 atau menambah pemanggil model paralel. |
| Hermes | Memory/Learning existing, checkpoint, dan owner eksekusi tool. | Hasil pekerjaan dibedakan dari finalisasi Learning; konteks recall diperlakukan sebagai data berbukti; mutasi unknown tidak direplay. | Middleware/provider replacement, MemoryProvider atau sidecar baru tanpa gap nyata. | Builtin memory donor sebagai store kedua, penyalinan transcript mentah, dan thread-pool/orchestrator tambahan. |
| Grok Build | Identitas request, grant, dan budget existing. | Cegah hasil terminal/progress usang; status selesai mengacu pada persistensi dan outcome yang benar. | Bounded tool parallel, stream-drain/token delivery baru, optimasi latency setelah baseline. | Transplantasi Tokio/Rust sampler, pengubahan HTTP provider untuk pekerjaan Memory biasa. |
| DeepSeek Harness | Durable checkpoint DTC-1 dan chat state existing; jalur tool existing. | Hanya outcome committed yang menjadi final; resume memakai identity, budget, dan authority saat ini; kandidat Learning berasal dari hasil terverifikasi. | Cordis plugin tree, NDJSON/protokol SDK donor, serta pengurangan konteks berulang setelah diukur. | Menyalin `ReactLoopAgent`, mengadopsi session log kedua, atau membuat hidden model input/store baru. |

Rekomendasi MCP berulang pada keenam sumber diserap sebagai prinsip **pakai ekstensi dan owner existing jika ada kebutuhan**. Integrasi ini tidak mencakup proyek pemasangan enam MCP server, registry baru, atau platform plugin baru. Satu Memory lookup tidak otomatis menjadi auto-recall; pendaftaran adapter tidak membuktikan consumer telah memakai hasilnya.

Keenam variasi post-turn/session-end/prefetch tidak digabung menjadi enam trigger tulis. Satu jalur terminal dan Learning existing menerima kandidat dengan provenance. Delta, reasoning, output gagal, dan mutasi unknown tidak otomatis dipromosikan menjadi durable fact.

## Pelaksanaan bertahap

### Paket berurutan Revisi 4

Paket berikut memperjelas pekerjaan yang masih terbuka; riwayat gelombang dan bukti revisi sebelumnya di bawah dipertahankan.

1. **A — kontinuitas dan kesiapan model.** Simpan cursor provider/key global melalui state owner existing dengan migrasi dari pemilihan terakhir yang dapat ditelusuri, tanpa mereset quota/history. Sesi A berakhir pada A/key 2 berarti sesi B dimulai pada A/key 2. Limit memindahkan ke key layak berikutnya pada provider yang sama; provider berikutnya mulai dari ordinal layak pertama. Diagnosis outage dan retry terbatas mendahului fallback unavailable. Batas attempts yang menghentikan scan dilaporkan sebagai pause, bukan seluruh key habis. Semua provider tidak tersedia menghasilkan checkpoint dan pause dengan recovery otomatis saat cooldown/reset, tunduk pada stop, authority, dan budget. Model/plan/context mismatch tidak menginvalidasi key. Key/endpoint/model yang berubah memicu pemeriksaan akses, protokol, tool calling, serta kapasitas dari metadata dan probe minimal; katalog saja tidak membuktikan entitlement. Tidak menyimpan secret tambahan.
2. **B — reuse relevan.** Gunakan recall dan Learning existing; general hanya lintas proyek bila scope dan provenance mengizinkan. Tolak/adaptasi pengetahuan usang, superseded, atau berbeda konteks dengan alasan. Simpan penggunaan dan outcome melalui receipt owner existing, tampilkan ringkas di Chat dengan detail evidence. Review Learning tetap diperlukan untuk durable knowledge; tidak mengaktifkan Skill otomatis.
3. **C — pembuktian dan optimasi.** Satu seed episode terverifikasi per bidang, lalu dua pasangan tugas baru per bidang. Kontrol hanya mengecualikan satu lesson yang sedang diuji pada task evaluasi terisolasi sebelum recall/disclosure; Memory produksi tetap utuh. Ukur correctness, pengulangan kesalahan, recall/model/tool time, attempts, token, biaya tersedia, dan confound provider/model. Optimasi awal mengurangi pencarian atau langkah gagal berulang. Parallel tool execution dan token streaming tidak termasuk paket awal.
4. **Keep-alive/status.** Tidak mematikan Core karena pengguna tidak aktif. Pisahkan liveness HTTP dari pemeriksaan diagnostik berat; batasi dan koaleskan probe per owner agar satu pemeriksaan macet tidak mengubah seluruh bridge menjadi OFF. Komponen unavailable tetap terlihat. Penutupan eksplisit aplikasi tetap dihormati.

### Baseline

- Catat revisi/worktree, area Native yang dibuka khusus tugas ini, serta test dan hasil awal yang relevan. Pisahkan perubahan tugas ini dari perubahan pengguna yang sudah ada.
- Jalankan fixture deterministik dan catat keadaan yang sudah tersedia serta gap nyata; tidak mengganti konfigurasi provider atau memanggil model berbayar hanya untuk membuat angka.
- Mulai ledger metrik pada hasil yang memang tersedia: keberhasilan task, kegagalan/recovery, durasi, attempts, tool calls, token/biaya jika provider menyediakannya, dan penggunaan Memory. Yang tidak tersedia tetap unknown.

### Gelombang 1 — Keandalan, continuity, dan status final

- Jadikan final yang terlihat konsisten dengan final yang berhasil disimpan. Jalur controller langsung dan jalur chat service tetap mempunyai owner/event yang jelas; jangan memperbaiki satu jalur dengan menghilangkan hasil pada caller lain.
- Pertahankan progress, error, stop, dan task identity. Hasil pekerjaan dan status finalisasi Learning dipisahkan; Learning fail-soft tanpa menyembunyikan kegagalannya.
- Recall relevan tetap otomatis; kegagalan recall opsional dilaporkan secara terbatas dan tidak memalsukan konteks atau menggagalkan pekerjaan yang dapat dilanjutkan dengan aman.
- Saat Agent Core tetap hidup, UI disconnect tidak membatalkan pekerjaan. Saat startup/restart, gunakan DTC-1 untuk melanjutkan checkpoint aman dengan authority dan budget saat ini.
- Jika mutasi mungkin sudah terjadi tetapi receipt/outcome belum pasti, tahan replay dan lakukan rekonsiliasi. Stop pengguna, checkpoint tidak valid/kedaluwarsa, kontrak berubah, atau authority tidak cocok harus tetap dihormati.
- Gunakan targeted tests yang mencakup cabang normal, failure, stop, disconnect, restart, finalization failure, dan duplikasi request. Lengkapi bukti sebelum mengklaim gelombang selesai.

### Gelombang 2 — Manfaat Memory/Learning

- Gunakan Memory canonical dan review Learning existing pada ketiga kelompok workflow. Jangan membangun memory engine atau katalog Skill paralel.
- Uji task terkait yang lebih baru dengan bukti asal, pengetahuan yang benar-benar diterapkan/diadaptasi/ditolak, serta hasil verifikasi task tersebut.
- Pisahkan correctness hasil, status Learning, recall relevance, actual use, dan efek reuse. Retrieval atau model menyatakan "sudah belajar" tidak membuktikan peningkatan.
- Pertahankan bukti negatif, konflik, dan keterbatasan. Kandidat/proposal tidak otomatis menjadi Skill aktif; mengikuti keputusan dan owner yang sudah ada.

### Gelombang 3 — Kecepatan dan biaya

- Pilih satu perubahan berdasarkan bottleneck terukur, bukan menerapkan seluruh optimasi donor sekaligus.
- Paket awal mengurangi pencarian/konteks dan langkah gagal yang berulang berdasarkan pengukuran. Parallel tool execution dan token streaming berada di luar paket awal. Mutation barrier, identity, cancellation, budget, dan final persistence tetap wajib.
- Bandingkan baseline dengan varian pada task sepadan. Laporkan correctness, latency, attempts, token/biaya yang tersedia, dan batas bukti. Hentikan/rollback varian yang tidak menunjukkan manfaat.
- Perubahan provider/model pada Paket A dibatasi pada kontinuitas dan kompatibilitas, lalu dicatat sebagai confound perbandingan. Intelligent routing berbasis klaim performa tetap ditunda.

## Scope, risiko dan otorisasi

Pada 2026-10-24 pengguna secara eksplisit meminta seluruh pembatasan pengembangan Native dicabut. Native AI Agent Core menjadi target pengembangan dan operasi aktif bersama controller eksternal. Penguncian file/section, baseline, dan penghalang build lama dihapus; path policy, authentication, task grants, source-drift, checkpoint dan perlindungan data tetap berlaku. Status operasional aktual dibuktikan setelah build dan restart resmi, terpisah dari hasil evaluasi manfaat Memory.

Interface publik tetap memakai API/endpoint/tool existing. Pada gelombang pertama tidak diperlukan nama MCP tool baru, provider baru, store baru, format wire donor, atau instalasi dependency donor. Perubahan urutan event internal harus mempertahankan kemampuan caller menerima hasil dan dilindungi targeted regression tests; final chat tidak boleh dinyatakan persisted sebelum commit berhasil.

Risiko utama adalah replay mutasi setelah crash, final UI berbeda dari store, final ganda, perubahan otoritas saat recovery, task stuck tanpa status yang jujur, optional recall menutupi error nyata, serta Learning failure mengubah laporan outcome. Mitigasi adalah owner existing, checkpoint/receipt, pemeriksaan authority saat resume, bounded budgets, dan outcome/learning status terpisah.

Tidak ada izin tersirat untuk menghapus data sesi/Memory, mengubah credentials atau provider, melakukan upload/publish, memasang runtime donor, atau mengirim pesan ke pihak lain. Data produksi bukan fixture acceptance. Artifact uji menggunakan workspace dan target aman yang jelas.

## Manfaat yang diharapkan dan keterbatasan

Manfaat yang diharapkan adalah status task yang lebih dapat dipercaya, recovery yang tidak mengulang efek, dan dasar pengukuran reuse/optimasi yang lebih jelas. Keberadaan source/test belum membuktikan deployment resident, semantic quality, cumulative advantage, atau percepatan.

Integrasi ini tidak menjanjikan seluruh fitur enam harness. Proposal sumber memberikan pola dan risiko; kebutuhan pengguna serta bukti Agent Core menentukan apa yang diadopsi. Klaim end-to-end atau manfaat lintas tugas hanya boleh dinaikkan setelah acceptance yang sesuai benar-benar dijalankan.

## Acceptance, evaluasi dan rollback

### Skenario keandalan

| Skenario | Kriteria penerimaan |
| --- | --- |
| Task normal / jalur final alternatif | Satu hasil final yang benar; pada jalur chat final cocok dengan data persisted. Jalur controller langsung tetap mendapat final. |
| Commit final gagal | UI tidak menerima klaim final persisted; status/error tetap jujur dan tidak menduplikasi hasil saat recovery. |
| Request identik | `clientRequestId` existing tetap mengacu ke turn yang sama; tidak menggandakan eksekusi atau final. |
| Disconnect UI | Core yang masih hidup melanjutkan task; reconnect memakai turn identity yang sama. Stop eksplisit tetap menghentikan task. |
| Restart pada batas aman | DTC-1 valid dilanjutkan dengan authority/budget saat ini; task terminal atau stopped tidak dihidupkan kembali. |
| Restart saat mutasi unknown | Mutasi tidak dieksekusi ulang sebelum efek/receipt direkonsiliasi; unknown terlihat sebagai unknown. |
| Recall unavailable | Recall opsional gagal dengan status terbatas; task yang aman tetap berjalan; tidak ada memory hits atau provenance palsu. |
| Learning gagal | Outcome pekerjaan dan hasil yang sudah diverifikasi tetap tersedia; Learning berstatus gagal/pending dengan bukti dan recovery yang sesuai. |
| Cancel / kontrak atau grant berubah | Tidak ada side effect baru setelah pembatalan/penolakan; resume tidak memperluas otoritas historis. |
| Admission tool gagal dipersist | Tidak ada efek samping sebelum admission tersimpan; tidak menganggap progress sebagai receipt mutasi. |
| Cursor provider/key | Bertahan lintas sesi/restart, sukses tetap pada key aktif, key limit tidak meninggalkan provider terlalu dini; CAS dan late outcome tidak merusak cursor. |
| Model dan outage | Model/plan/context mismatch terpisah dari auth; unavailable tidak dipalsukan sebagai quota/invalid. Readiness belum terbukti tidak dipakai task. |
| Pause provider | Scan belum selesai dilaporkan jelas; reset/cooldown dapat melanjutkan checkpoint aman, tanpa menghidupkan task stopped atau menambah budget. |
| Reuse dan ablation | Lesson relevan membantu tugas baru hanya jika oracle/pembanding mendukung; stale/scope mismatch/similarity saja tidak menjadi aplikasi buta. |
| Aplikasi terbuka tanpa aktivitas | Core tidak berhenti karena idle; polling tidak menumpuk pemeriksaan berat, dan kegagalan komponen tidak memalsukan bridge down. |

### Tiga workflow penerimaan

| Bidang | Contoh tugas aman | Bukti hasil yang diperlukan |
| --- | --- | --- |
| Coding | Perbaikan kecil di workspace fixture dengan failure yang dapat direproduksi. | Diff, runnable check sebelum/sesudah, hasil task, dan status persisted; tanpa perubahan di luar scope. |
| Riset/dokumen | Sintesis beberapa dokumen fixture dengan sumber yang saling melengkapi/bertentangan. | Artifact, rujukan sumber, batas ketidakpastian, dan pemeriksaan bahwa klaim sesuai bahan. |
| Browser/komputer | Workflow terisolasi pada halaman/berkas uji tanpa publish atau komunikasi eksternal. | Target/session identity, hasil inspeksi aktual, receipt tindakan bila tersedia, dan verifikasi keadaan akhir. |
| Task terkait berikutnya | Tugas baru yang relevan dengan pengetahuan terverifikasi dari salah satu workflow di atas. | Sumber Memory, record actual use/adapt/reject, outcome terverifikasi, serta pembanding yang membedakan manfaat dari recall saja. |

Fixture/offline test dapat memverifikasi kontrak recovery dan persistensi. Bukti itu tidak diganti label menjadi task live, provider benchmark, browser resident acceptance, atau peningkatan kecerdasan. Penerimaan live yang belum dijalankan tetap PENDING.

### Evaluasi dan rollback

- Catat baseline dan hasil varian secara terpisah. Correctness dan perlindungan data wajib lulus sebelum perbandingan latency/biaya dipakai untuk keputusan.
- Jalankan path policy dan targeted tests untuk seam yang berubah sebelum aktivasi. Build/test yang tidak dijalankan diberi alasan; tidak menggunakan dokumentasi sebagai pengganti hasil eksekusi.
- Rollback hanya perubahan integrasi milik tugas ini yang sesuai dengan revisi source tersebut. Jangan mengembalikan perubahan pengguna lain, menghapus history/chat/Memory, mereset pending Learning, atau mereset checkpoint supaya terlihat bersih.
- Sebelum mengulang pekerjaan setelah interupsi, rekonsiliasi source/build, process ownership, checkpoint, target state, dan receipt. Unknown mutation tetap unknown sampai ada bukti.
- **Konteks historis:** dahulu dokumen ini dipertahankan aktif selama ada gelombang terbuka. **Keputusan pengguna 2026-10-24 menutup scope Revisi 4 beserta gelombang benchmark lanjutan tanpa mewajibkan tes tambahan.** Jangan jadikan paragraf atau kriteria lama sebagai task otomatis. Dokumen ini dipertahankan pada path existing untuk menjaga tautan/provenance; pemindahan arsip bukan syarat penutupan dan tidak dilakukan.

## Bukti pelaksanaan

Status source dan hasil yang sudah dibuktikan di bawah tidak menggantikan bukti resident. Catatan rinci, kegagalan historis dan hash tetap pada [execution evidence](Native-Architecture-Integration-Execution-20261023.md).

Pelaksanaan Revisi 4 dicatat terpisah pada [Revision 4 execution](Native-Architecture-Integration-Revision-4-Execution.md). Hasil di tabel berikut adalah checkpoint revisi sebelumnya; tidak otomatis memverifikasi provider/readiness/reuse/keep-alive baru.

| Paket / bukti | Status saat dokumen dibuat | Referensi hasil |
| --- | --- | --- |
| Revisi source/worktree dan pemisahan perubahan existing | VERIFIED source checkpoint | HEAD c8a0d306493ecbfaa8a5c9f9ae9df1754d813e98, branch codex/cumulative-learning-workflow; perubahan existing dipertahankan. |
| Baseline fixture / metrik awal | VERIFIED deterministic baseline | 36/36 baseline; reliability serial 49/49 pada checkpoint. Token/biaya dan kualitas model nyata belum disimpulkan. |
| Gelombang 1 source | IMPLEMENTED dan resident pada checkpoint R3 | Final post-commit, startup recovery dan UI; lima baseline entries historis serta satu descriptor capability Native diperbarui secara sempit. Checkpoint R3 mempertahankan grants/policy/provider. Pembatasan pengembangan historis dicabut oleh pengguna pada 2026-10-24. |
| Targeted tests dan pemeriksaan governance historis | VERIFIED scoped pada checkpoint R3 | Source 47/47, owner-isolation 5/5, conversation extension current 0.2.3 17/17, UI 8/8, relay .NET 2/2, recovery metadata Native 20/20; guard historis 31 files/78 sections. Kegagalan pendahulu tetap tersedia pada execution evidence. |
| Build / hash output / resident runtime | VERIFIED | Source/UI build dan launcher publish SDK existing tanpa restore/download; hash root executable cocok dengan kandidat. Tiga restart resmi exit 0: aktivasi launcher, pemuatan descriptor Native, lalu recovery penolakan tool sebelum dispatch. Health kembali ok. |
| Acceptance coding, riset/dokumen, browser/komputer | VERIFIED fixture; live browser dan guided model/tool verified | Coding/riset memverifikasi kontrak fixture. Seluruh 38 kasus browser memiliki hasil akhir pass pada port 61508. Native nyata melalui openrouter/free meminta observe.local, menjalankan satu read_file sukses, mengembalikan nonce/SUM=95 yang benar dan hasil persisted identik; lima iterasi, bukan replay. Kegagalan Native sebelumnya tetap dicatat. Probe minimal Gonka/OpenRouter pass; Atria quota-blocked. Ini belum pembuktian semua tugas/model/provider. |
| Gelombang 2 actual Memory use dan efek reuse | CLOSED BY USER DECISION — benchmark dihentikan sebagai scope R4 | Efek kausal Memory belum terbukti; hasil historis tetap dicatat, bukan tugas aktif atau syarat pemakaian. |
| Gelombang 3 kecepatan/biaya | CLOSED BY USER DECISION — tidak diteruskan pada scope R4 | Tidak ada klaim penghematan; optimasi baru hanya bila muncul kebutuhan/task baru dengan persetujuan terkait. |
| Learning tugas implementasi / review | CHECKPOINT dan REVIEW COMPLETE; kandidat awaiting-verification | Reason verified-recovery; satu kandidat operasional tetap proposal-only, nol durable capture, tanpa aktivasi Skill. Verifier episode eksternal menolak scope; oracle task nyata tetap pass dan tidak diganti klaim verifier host. Kewajiban 28 review sebelumnya dipertahankan. |

## Riwayat revisi

| Tanggal | Revisi | Perubahan dan keputusan |
| --- | --- | --- |
| 2026-10-23 | 1 | Menggabungkan enam sumber menjadi satu roadmap Native; merekam jawaban pengguna dan otorisasi implementasi task-scoped; memisahkan kemampuan existing, adaptasi reliability, roadmap manfaat Memory/Learning, serta optimasi yang menunggu pengukuran. Bukti implementasi masih PENDING saat penulisan awal. |
| 2026-10-23 | 2 | Resume eksplisit dari handoff; memutakhirkan bukti reliability/ownership, OBU default dengan penghapusan isolated engine, bounded snapshot dan keyboard background. Pengguna juga meminta pembuktian model nyata dari .env dan menyatakan JavaScript aktif pada fixture 127.0.0.1:61508. Ini pencatatan pelaksanaan scope existing, bukan aktivasi Skill atau grant baru. |
| 2026-10-23 | 3 | Mencatat tiga restart resmi, hasil browser resident dan guided model nyata yang lulus, diagnosis family salah, metadata family→tool, serta recovery denial sebelum dispatch dari owner existing. Baseline controller diperbarui sempit; grant/policy/provider tetap. Roadmap manfaat Memory dan performa tetap terbuka. |
| 2026-10-23 | 4 | Mengikat keputusan cursor provider/key global, readiness otomatis, pause/recovery, scope pengetahuan, UI evidence dan evaluasi terkontrol tiga bidang. Menambahkan permintaan keep-alive pengguna dan diagnosis health polling. Riwayat serta bukti revisi 1–3 dipertahankan; hasil historis diverifikasi terpisah pada execution R4. |\n| 2026-10-24 | Penutupan scope R4 (bukan revisi arsitektur baru) | **CLOSED atas keputusan eksplisit pengguna**: Native dan MCP eksternal siap digunakan sesuai kemampuan/izin yang terverifikasi; evaluasi model/benchmark Memory dan optimasi lanjutan bukan lagi pekerjaan aktif. Hasil yang belum terbukti tetap tersimpan tanpa klaim PASS. |
