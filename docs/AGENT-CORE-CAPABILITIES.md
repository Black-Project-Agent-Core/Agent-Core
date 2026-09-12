# Kemampuan Bawaan Agent-Core

**Inventaris kanonis · diperiksa 2026-09-10 · versi source 0.7.0 · kebijakan workflow-v1 / engineering-v1**

Dokumen ini menjadi titik awal untuk membandingkan, menambah, mengurangi, atau mengubah kemampuan Agent-Core. Isinya merangkum implementasi produk, kondisi aktivasi, kegunaan, batas kemampuan, dan lokasi source yang menjadi authority. Perubahan berikutnya cukup memeriksa entri yang terdampak beserta pemanggilnya; inventaris ini tidak menggantikan grounding source sebelum perubahan kode.

Dasar inventaris adalah pembacaan source, laporan acceptance yang sudah tersimpan, dan [diagnostik MCP read-only](../reports/capability-inventory-20260910/status.json) saat penyusunan. Tidak ada test, benchmark, build, restart, atau acceptance Web baru untuk dokumen ini. Versi source berasal dari [package.json](../package.json). Hasil pemeriksaan bukan jaminan kesehatan proses pada waktu lain atau sertifikasi seluruh repository/release.

Pembaruan CAP-013 mencatat parser `2.0.0`, [121 kasus lokal yang lulus dari hasil terakhir per file](../reports/output-projection/test-verification.json), build yang berhasil, serta [runtime pasca-restart sehat](../reports/output-projection/runtime-after.json). Acceptance ChatGPT Web untuk perluasan output masih pending. Hasil tersebut menggabungkan pengujian fungsi, regresi, dan rerun terarah setelah perbaikan; bukan satu invocation 121 test. Snapshot runtime awal di bawah tetap merupakan bukti historis terpisah.

## Navigasi

- [Cara membaca aktivasi](#cara-membaca-aktivasi)
- [Alur kerja bawaan](#alur-kerja-bawaan)
- [Koneksi, scope, dan kewenangan](#koneksi-scope-dan-kewenangan): CAP-001–003
- [Engineering dan craft](#engineering-dan-craft): CAP-004–009
- [Rencana, execution, dan bukti](#rencana-execution-dan-bukti): CAP-010–014
- [Memori dan continuity](#memori-dan-continuity): CAP-015–022
- [Operasi, integrasi, dan pengelolaan runtime](#operasi-integrasi-dan-pengelolaan-runtime): CAP-023–030
- [Default konfigurasi dan batas global](#default-konfigurasi-dan-batas-global)
- [Buku bukti dan perubahan](#buku-bukti-dan-perubahan)
- [Cara memelihara inventaris](#cara-memelihara-inventaris)

## Cara membaca aktivasi

| Label | Arti praktis |
|---|---|
| **Wajib internal** | Server memeriksa kontrak pada operasi yang relevan. Bukti yang kurang dapat menahan implementasi atau closure. |
| **Default aktif, bersyarat** | Konfigurasi bawaan mengaktifkan layanan. Perilakunya berjalan saat ada operasi/pemicu yang sesuai, bukan terus mengerjakan task sendiri. |
| **Eksplisit** | AI pengendali atau operator harus memanggil tool/operasinya. Tersedia tidak berarti selalu dipakai. |
| **Opsional konfigurasi** | Implementasi tersedia, tetapi membutuhkan konfigurasi, credential, atau layanan yang sesuai. |
| **Katalog/deferred** | Infrastruktur pencarian atau daftar kemampuan; bukan bukti bahwa setiap entri sudah menjadi implementasi produk. |

**Pasif** di sini berarti pemeriksaan atau pencatatan otomatis yang mengikuti operasi: validasi scope, freshness, resource claims, provenance, parsing hasil, dan lifecycle. Agent-Core tidak menambahkan model inferensi untuk berpikir sendiri. AI pengendali tetap memilih solusi, menulis kode/command, dan memberi alasan; server mengumpulkan fakta serta memvalidasi kontraknya.

Kewajiban berlaku pada jalur yang dikendalikan Agent-Core. Server tidak dapat memaksa perilaku AI di luar tool tersebut. Membaca dokumen ini juga tidak menggantikan pemeriksaan schema custom plugin yang benar-benar callable di koneksi pengguna.

## Alur kerja bawaan

```text
Brief + projectRoot
  |
  v
Koneksi terautentikasi -> scope proyek -> route terikat principal
  |
  v
Health / memory preflight -> recall -> konteks untuk routing + pengendali
  |
  +-- diagnostic / recovery yang dikecualikan tetap tersedia
  |
  v
Klasifikasi kewajiban task dan operasi aktual
  |
  +-- coding: discovery -> fasilitas -> caller impact -> assessment
  +-- transplant: donor terdaftar -> source receipts -> mappings
  |
  v
Rencana diterima -> operasi terencana / DAG sesuai kewajiban
  |
  v
Resource claims -> proses -> raw logs + hasil setiap attempt
  |
  v
Rekonsiliasi perubahan -> correctness / artifact verification
  |
  v
Review kompleksitas -> perbaiki atau pertahankan dengan bukti
  |
  v
Keputusan memori -> checkpoint -> sinkronisasi -> durable closure
```

Pemeriksaan health/preflight di atas mengikuti mode memori efektif. Default adalah `enforce`; mode konfigurasi lain tetap tersedia dan dijelaskan di [batas konfigurasi](#default-konfigurasi-dan-batas-global). DAG dan craft mengikuti kewajiban task; lima pemeriksaan engineering aktif pada coding meskipun task tidak mengambil donor.

## Koneksi, scope, dan kewenangan

### CAP-001 — MCP dan autentikasi

**Aktivasi:** wajib pada akses terproteksi; mekanisme autentikasi mengikuti koneksi. **Berguna untuk:** menghubungkan AI pengendali melalui MCP Streamable HTTP, API key atau OAuth2, termasuk registrasi client, authorization code/PKCE, dan refresh token.

**Batas:** koneksi berhasil tidak membuktikan semua layanan eksternal sehat atau schema client sudah terbaru. Daftar tool yang terdaftar dan konfigurasi efektif adalah pemeriksaan berbeda.

**Authority:** [server MCP](../src/mcp/server.ts), [HTTP app](../src/http/app.ts), [OAuth store](../src/oauth/store.ts).

### CAP-002 — Routing dan scope proyek

**Aktivasi:** eksplisit melalui `capability_route`, kemudian validasi scope menjadi wajib internal. **Berguna untuk:** memilih domain/tool dan mengikat seluruh task ke proyek yang tepat. `projectRoot` absolut yang eksplisit dapat memilih folder anak di dalam root yang diizinkan; direktori dan real path diperiksa sebelum route/preflight dibuat.

**Batas:** menyebut folder dalam teks tidak setara dengan mengisi `projectRoot`. Akses induk, sibling, atau junction keluar scope ditolak oleh operasi file terkelola. Root yang diizinkan bukan izin universal bagi setiap task; shell umum bukan sandbox filesystem OS.

**Authority:** [workspace policy](../src/runtime/workspace.ts), [capability route](../src/mcp/capability-tools.ts), [router](../src/capabilities/router.ts), [project scope](../src/mcp/project-scope.ts).

### CAP-003 — Gate operasi dan klasifikasi aktual

**Aktivasi:** wajib internal pada operasi routed. **Berguna untuk:** memeriksa principal, masa berlaku route, allowed tools, kewajiban workflow, serta kesesuaian nama operasi dengan payload sebenarnya. Klaim read-only tidak boleh menyembunyikan command atau mutation fields.

**Batas:** status, diagnostics, pembatalan, dan recovery tertentu sengaja dikecualikan agar pekerjaan yang tertahan dapat diperiksa. File read/search biasa tetap termasuk analisis bermakna dan bukan pengecualian umum untuk preflight. Hard guardrail dari isi memori mempunyai switch konfigurasi terpisah.

**Authority:** [route context](../src/runtime/route-context-store.ts), [workflow guard](../src/mcp/workflow-guard.ts), [meaningful-work classification](../src/memory/meaningful-work.ts), [memory lifecycle guard](../src/mcp/memory-lifecycle-guard.ts).

## Engineering dan craft

### CAP-004 — Discovery implementasi existing

**Aktivasi:** wajib internal untuk coding; collector dijalankan melalui `craft_source(operation=discover)`. **Berguna untuk:** menemukan fungsi, service, pola, dan dependency sebelum membuat implementasi baru.

**Batas:** receipt mencatat inventory/hash, query, hasil, exclusions, read failures, dan truncation. Pencarian kosong hanya sah ketika cakupan selesai diperiksa. Source yang belum dilacak Git dapat masuk; credentials, live memory, build/cache/output, dan direktori referensi dikecualikan. Perubahan inventory dapat membuat bukti stale.

Aktivasi engineering dan penerbitan evidence pertama memakai satu commit versi workflow. Kegagalan koleksi atau konflik versi tidak menyisakan aktivasi kosong. Cache immutable yang belum direferensikan dapat tetap ada setelah konflik; keberadaannya bukan receipt yang diterima.

**Authority:** [engineering discovery](../src/workflow/engineering-discovery.ts), [engineering types](../src/workflow/engineering-types.ts), [assessment enforcement](../src/workflow/engineering-enforcement.ts).

### CAP-005 — Prioritas reuse dan fasilitas bawaan

**Aktivasi:** wajib internal dalam assessment coding. **Berguna untuk:** menimbang kebutuhan berurutan: implementasi existing → standard library/platform → dependency terpasang → adaptasi donor → kode baru. Pilihan dan penolakan opsi sebelumnya disertai alasan serta evidence receipts.

**Batas:** server memeriksa kelengkapan dan hubungan bukti; AI pengendali menilai kesesuaian solusi. Ini tidak membuktikan secara universal bahwa desain terpilih paling sederhana atau melarang kode baru yang memang diperlukan.

**Authority:** [engineering policy/assessment schema](../src/workflow/engineering-policy.ts), [assessment validation](../src/workflow/engineering-enforcement.ts).

### CAP-006 — Analisis caller dan dampak perubahan

**Aktivasi:** wajib internal pada assessment/review coding; pengumpulan lewat `craft_source(operation=impact)`. **Berguna untuk:** menelusuri identitas simbol TS/JS, referensi caller, import alias, re-export, namespace, serta keputusan dampak terhadap caller yang ditemukan.

**Batas:** parser lokal TypeScript `7.0.2` memakai adapter `typescript/unstable/async` dan filesystem snapshot terbatas. Parser tidak menjalankan kode/plugin proyek. Dynamic dispatch, reflection, external consumers, dan bahasa yang belum didukung menjadi limitations; gagal/truncated bukan hasil lengkap. “Semua caller” berarti semua yang terbukti dalam inventory yang dicatat.

**Authority:** [parser adapter](../src/workflow/engineering-parser.ts), [caller dispositions](../src/workflow/engineering-enforcement.ts), [dependency runtime](../package.json).

### CAP-007 — Pembatasan perubahan berdasarkan kebutuhan

**Aktivasi:** wajib internal pada coding, termasuk direct edit, command, dan DAG. **Berguna untuk:** mengikat setiap target mutation ke kebutuhan dan langkah plan; menahan perubahan di luar scope dan perubahan yang memakai baseline stale.

**Batas:** klasifikasi atomic/direct tidak menghapus assessment jika operasi aktual mengubah source atau menjalankan command umum. Revisi plan diperlukan untuk perluasan scope. Perubahan lintas file tetap boleh jika beralasan; jumlah baris bukan ukuran kelulusan. Dokumen atomik yang benar-benar hanya dokumentasi dapat mengikuti klasifikasi berbeda.

**Authority:** [workflow service](../src/workflow/service.ts), [engineering enforcement](../src/workflow/engineering-enforcement.ts), [operation ledger](../src/workflow/operation-ledger.ts).

### CAP-008 — Review kompleksitas hasil akhir

**Aktivasi:** wajib internal sebelum closure coding; `craft_source(operation=review)` mengeluarkan findings, `workflow_plan(operation=review)` menyerahkan dispositions. **Berguna untuk:** memeriksa duplikasi struktur, forwarding wrapper, abstraksi dengan penggunaan terbatas, konfigurasi baru, dan dependency baru.

**Batas:** temuan adalah kandidat struktural; sebagian pemeriksaan bersifat leksikal, berbeda dari identitas compiler pada CAP-006. Findings harus diperbaiki atau dipertahankan dengan alasan berbukti. Wrapper yang menjaga API/security/recovery boleh dipertahankan. Perubahan sesudah review membuat review stale. Default scope adalah perubahan dan dampaknya; review seluruh proyek hanya ketika brief memintanya.

**Authority:** [complexity collector dan finding schema](../src/workflow/engineering-policy.ts), [review gate](../src/workflow/engineering-enforcement.ts).

### CAP-009 — Craft dari source donor

**Aktivasi:** wajib internal ketika task memang transplant/adaptasi donor; `craft_source(list/read)` tetap tersedia. **Berguna untuk:** membaca implementasi donor yang terdaftar, menghasilkan snapshot/read receipts, lalu mengikat kebutuhan donor ke target melalui mapping dan integration checks.

**Batas:** dokumentasi donor saja tidak menggantikan grounding implementasi. Kesesuaian source/ref/current hash diperiksa. `requiredCraft:true` pada status merupakan kemampuan/kebijakan layanan; kewajiban task aktual adalah `craftRequired`. Coding tanpa donor tetap menjalankan CAP-004–008.

**Authority:** [workflow classification](../src/workflow/classification.ts), [source snapshots](../src/workflow/source.ts), [mapping validation](../src/workflow/service.ts), [workflow tools](../src/mcp/workflow-tools.ts).

## Rencana, execution, dan bukti

### CAP-010 — Plan yang diterima dan kewajiban DAG

**Aktivasi:** wajib internal sesuai klasifikasi task dan operasi aktual; `workflow_plan` menerima plan/assessment. **Berguna untuk:** memberi identitas revision/hash pada langkah, target, dependensi, serta correctness/integration checks sebelum implementasi.

**Batas:** tidak semua diagnosis memerlukan DAG. Task dengan kewajiban DAG harus memakai execution graph; command langsung tidak boleh melewatinya. Task lama yang terbuka perlu memenuhi engineering sebelum mutation berikutnya; record tertutup tidak diberi klaim engineering secara retrospektif.

**Authority:** [workflow service](../src/workflow/service.ts), [workflow classification](../src/workflow/classification.ts), [workflow types/store](../src/workflow/types.ts).

### CAP-011 — Multi-command, dependensi, dan resource claims

**Aktivasi:** execution default aktif; create/start dilakukan eksplisit, scheduling dan rekonsiliasi otomatis. **Berguna untuk:** menjalankan node independen bersamaan, menahan read/write yang bertabrakan, dan menunggu dependency berhasil sebelum node lanjutan.

**Batas:** konfigurasi default maxConcurrency adalah 4; setiap run dan resource governor dapat membatasi lebih rendah. Kapasitas paralel tidak membuktikan overlap pada semua run. Claims adalah koordinasi antaroperasi terkelola, bukan sandbox OS. Plan tidak diganti selama run lama masih aktif; perubahan writer lain menunggu receipt/reconciliation yang sesuai.

**Authority:** [execution service](../src/execution/service.ts), [scheduler](../src/execution/scheduler.ts), [resource claims](../src/execution/resource-claims.ts), [DAG](../src/execution/dag.ts).

### CAP-012 — Bukti attempt, artifact, dan correctness

**Aktivasi:** wajib internal pada workflow completion. **Berguna untuk:** membedakan proses sukses dari bukti yang verified/current; mengikat run, node, attempt, input, toolchain file, target output, dan artifacts ke plan yang sama.

**Batas:** exit code 0 saja tidak cukup. Perubahan input/artifact dapat membuat bukti stale. `toolchain` adalah daftar path file untuk provenance, bukan nama executable atau module. Hasil test historis tidak dijadikan bukti attempt produksi yang belum dijalankan.

**Authority:** [provenance](../src/execution/provenance.ts), [artifact/evidence](../src/execution/evidence.ts), [runtime attempt reconciliation](../src/runtime/services.ts), [completion gate](../src/runtime/workflow-completion.ts).

### CAP-013 — Raw logs dan ringkasan output terstruktur

**Aktivasi:** otomatis setelah attempt managed; `execution_status`, `execution_logs`, dan `execution_artifact_find` menyediakan pemeriksaan eksplisit. Implementasi parser `2.0.0` tersedia di source dan sudah diuji lokal; deployment/acceptance Web perluasan ini masih pending. **Berguna untuk:** menyimpan stdout/stderr asli, menyajikan format/quality/coverage, mengelompokkan TypeScript diagnostics dan baris identik, serta menunjuk raw detail dengan identitas attempt yang sama.

**Batas:** hash/ukuran seluruh raw stream diverifikasi, tetapi parsing mempertahankan paling banyak 128 KiB per stream dari head/tail dengan batas baris utuh. Coverage `complete/partial`, rentang byte, omissions, dan quality `full/degraded/unknown` terlihat; counts hanya berlaku pada rentang yang diperiksa. Dedup memakai baris persis per stream, tanpa menormalkan UUID/path/nilai. Presentation dibatasi byte UTF-8, bukan ukuran token. Ringkasan tidak mengganti exit code, artifact/current-attempt evidence, atau completion gate. Status dapat memulihkan paling banyak dua proyeksi terminal yang belum tersedia per panggilan, tanpa rerun command; record lama tanpa coverage tetap `legacy_unknown`. `safeDerivedText` membatasi sampel turunan, bukan jaminan seluruh raw log telah diredaksi. Tidak ada inferensi, database, atau tool baru.

**Authority:** [kontrak output projection](execution-output-projection.md), [output parser](../src/execution/output-parser.ts), [projection](../src/execution/output-projection.ts), [log store](../src/execution/log-store.ts), [persistensi/binding](../src/execution/store.ts), [status recovery](../src/execution/service.ts), [safe derived text](../src/runtime/safe-derived-text.ts).

### CAP-014 — Pengelolaan proses dan tekanan resource

**Aktivasi:** penjagaan proses mengikuti eksekusi; resource governance default aktif. **Berguna untuk:** membatasi wall-clock/output, menangani process tree saat cancel/timeout, dan menurunkan dispatch baru ketika CPU, memori, storage, audit, atau sync queue tertekan.

**Batas:** evidence menyatakan hard wall-clock/output limit; hard CPU-time dan hard memory limit bukan jaminan yang disediakan. Ini pengendalian kapasitas dan recovery, bukan target kecepatan, benchmark, atau bukti peningkatan performa. `execution_retry` eksplisit; hasil sukses yang masih sah direkonsiliasi tanpa sengaja mengulang implementasi.

**Authority:** [process governance](../src/runtime/process-governance.ts), [resource governor](../src/execution/resource-governor.ts), [runner](../src/execution/runner.ts), [execution recovery](../src/execution/recovery.ts), [governance evidence](../src/execution/log-store.ts).

## Memori dan continuity

### CAP-015 — Vault sebagai penyimpanan memori lokal

**Aktivasi:** memory default aktif. **Berguna untuk:** menyimpan pengetahuan, revisions, relations, provenance, dan state pendukung melalui file/vault, atomic writes, serta transaction recovery.

**Batas:** “Obsidian sehat” berarti vault dapat digunakan; aplikasi Obsidian tidak perlu terbuka. Validasi malformed files/integrity tetap penting. Catatan task/log operasional berbeda dari pengetahuan semantik yang dipromosikan. Backend memiliki operasi backup lokal yang menyalin vault; keberadaan operasi ini bukan bukti backup berjalan terjadwal atau semua state runtime ikut disalin.

**Authority:** [file-native backend](../src/memory/file-native/backend.ts), [vault repository](../src/memory/file-native/vault-repository.ts), [atomic writer](../src/memory/file-native/atomic-writer.ts), [transaction journal](../src/memory/file-native/transaction-journal.ts).

### CAP-016 — Preflight, Graphify, dan recall kontekstual

**Aktivasi:** otomatis ketika route membuka konteks memori; default lifecycle `enforce` menahan pekerjaan substantif jika komponen wajib tidak sehat. **Berguna untuk:** menggabungkan pencarian vault, skor deterministik, relasi Graphify, keputusan terdahulu, dan failure relevan; subset bounded dimasukkan ke konteks routing dan hasil dikirim ke pengendali.

**Batas:** Graphify harus sesuai fingerprint vault/index, bukan sekadar paket terpasang. Recall kosong yang berhasil berbeda dari recall gagal. Budget recall/injection membatasi hasil; AI pengendali tetap harus mengevaluasinya. Default enforcement mewajibkan vault, Graphify, Supabase sehat dan tidak ada sync pending; mode alternatif dijelaskan di bawah.

Health komponen tidak memperpanjang lease task. Preflight juga memeriksa scope, expiry, closure, snapshot recall, lifecycle lain yang pending, serta validitas projection workflow ketika kontraknya ada. Pembacaan source target tetap dapat memanggil pemeriksaan Supabase yang dikonfigurasi; pengambilan source lokal tidak berarti seluruh tool bekerja tanpa network.

**Authority:** [preflight/recall backend](../src/memory/file-native/backend.ts), [retriever](../src/memory/file-native/retriever.ts), [Graphify adapter](../src/memory/file-native/graphify-adapter.ts), [routing injection](../src/mcp/memory-injection.ts).

### CAP-017 — Remember more dan inspeksi memori

**Aktivasi:** eksplisit melalui `memory_remember_more`, `memory_search`, `memory_get`, `memory_explain`, dan `memory_export`. **Berguna untuk:** memperluas konteks dari query/seed yang relevan, menelusuri relations, membaca record, serta menjelaskan alasan pencocokan/provenance.

**Batas:** bukan pencarian tak terbatas yang otomatis terus berjalan ketika brief kabur. Pengendali memanggil perluasan dengan context yang sah; hop/item/character budget, principal dan project scope tetap berlaku. Empty recall tidak otomatis berarti meminta model lain.

**Authority:** [memory tools](../src/mcp/memory-tools.ts), [rememberMore backend](../src/memory/file-native/backend.ts), [memory service](../src/memory/service.ts).

### CAP-018 — Keputusan pengetahuan dan revisi

**Aktivasi:** eksplisit melalui commit/revise/forget atau promosi checkpoint. **Berguna untuk:** menyimpan informasi berguna, menghindari duplikasi, merevisi pengetahuan, melacak provenance/conflict, serta mencatat keputusan tidak menyimpan yang sah.

**Batas:** setiap task tidak harus menghasilkan memory semantik baru. `NO_DURABLE_MEMORY` hanya sah dengan alasan/explanation yang sesuai; log mentah atau statement “sudah disimpan” tidak menjadi bukti durable knowledge. Redaksi dan kebijakan write berlaku pada jalur memori yang relevan, bukan janji membersihkan semua file proyek.

**Authority:** [write policy](../src/memory/write-policy.ts), [memory redaction](../src/memory/redaction.ts), [backend postflight](../src/memory/file-native/backend.ts), [checkpoint promoter](../src/continuity/promoter.ts).

### CAP-019 — Supabase sebagai memori kedua

**Aktivasi:** opsional konfigurasi; Supabase Direct otomatis berpartisipasi pada write/recall/closure ketika enabled. **Berguna untuk:** semantic projection/search, sinkronisasi antrean, dan durability workflow melalui generation/logical-state hash. Jalur Supabase Second terpisah menyediakan snapshot full-vault terenkripsi/bertanda tangan dan pemulihan eksplisit dengan konfigurasi khusus. Sinkronisasi durability memilih jalur Second ketika dikonfigurasi, lalu Direct bila tersedia.

**Batas:** default konfigurasi Direct adalah false, memerlukan URL dan server secret yang sah. Pada default lifecycle enforce, komponen yang belum dikonfigurasi menjadi blocker; tidak diam-diam dianggap sehat. Canonical local revision/tombstone menang atas projection remote. Fixture transport/PGlite tidak membuktikan komunikasi produksi; saved sync receipt juga bukan fresh remote-read test. Opsi remote generik saja tidak merupakan jalur backup remote yang siap pada backend ini. Jalur Second tidak diklaim sedang dikonfigurasi atau digunakan hanya karena source-nya tersedia.

Sinkronisasi semantic memory dan durability workflow adalah pemeriksaan berbeda. Workflow dapat membawa source blobs immutable yang direferensikan evidence ke Supabase; byte/hash dipertahankan, metadata dan kredensial yang terdeteksi tetap divalidasi. Pengecualian source sangat terbatas pada deklarasi computed-template label yang dapat diperiksa scanner lokal; literal, static text, dan sintaks ambigu tetap mengikuti detektor konservatif. Ini bukan klaim pendeteksian universal semua rahasia.

**Authority:** [Supabase Direct](../src/memory/file-native/supabase-direct.ts), [file second memory](../src/memory/file-native/supabase-second-memory.ts), [sync/recall backend](../src/memory/file-native/backend.ts), [configuration](../src/config.ts).

### CAP-020 — Checkpoint dan durable closure

**Aktivasi:** wajib untuk menutup lifecycle pekerjaan bermakna dalam mode enforce; `task_checkpoint` atau finalize yang sesuai dipanggil pengendali. **Berguna untuk:** mengikat status task, keputusan memori, evidence, checkpoint, dan remote durability; kegagalan sync tetap membuat closure pending.

**Batas:** `interrupted`, run completed, workflow closed, lifecycle closed, dan remote synced adalah lapisan berbeda. Task completed memerlukan completion gate; outcomes tidak boleh dipakai untuk menyamarkan interrupted menjadi sukses. Recovery melanjutkan pencatatan yang tertunda, bukan mengulang pekerjaan yang sudah berhasil.

Checkpoint yang tercatat lokal tetapi gagal durability diulang dengan request identik dan route asli. `memory_status(sync=true)` yang sehat tidak sendirinya menutup checkpoint atau membuktikan generation workflow sudah synced.

**Authority:** [task checkpoint service](../src/memory/task-checkpoint.ts), [lifecycle backend](../src/memory/file-native/backend.ts), [continuity tools](../src/mcp/continuity-tools.ts), [finalize tool](../src/mcp/memory-turn-tools.ts).

### CAP-021 — Continuity, resume, dan pemulihan sesi

**Aktivasi:** default bersama memory; route menangkap/melanjutkan task, status/get/frontier eksplisit. **Berguna untuk:** mempertahankan objective, acceptance, constraints, blockers, turn/checkpoint, dan kandidat pekerjaan antar sesi; continuation ambigu tidak membuka pekerjaan baru sembarangan.

**Batas:** project/principal dan task identity harus cocok. Route lama yang expired tidak memberikan izin implementasi baru; recovery closure memakai authority lifecycle tersimpan yang sesuai. Hydration/restore remote merupakan operasi recovery eksplisit dengan pemeriksaan lease, generation/hash, dan scope, bukan unduhan yang selalu berjalan pada setiap task. Frontier merupakan daftar bounded, bukan semua histori. State lama tetap dibaca tanpa klaim telah memenuhi kebijakan baru.

**Authority:** [continuity route](../src/mcp/capability-tools.ts), [continuity snapshot](../src/continuity/snapshot.ts), [continuity backend](../src/memory/file-native/backend.ts), [continuity tools](../src/mcp/continuity-tools.ts).

### CAP-022 — Lease konteks untuk HTTP internal

**Aktivasi:** eksplisit untuk pemanggil internal yang menggunakan jalur lease; validasi wajib pada operasi terkait. **Berguna untuk:** menghubungkan operasi internal ke persisted memory context, workspace, serta workflow authority yang sama dengan MCP.

**Batas:** endpoint dibatasi lokal dan bukan jalur bypass assessment atau plan. Client tidak bisa menyatakan sebuah operasi aman hanya lewat label read-only; mutation payload, lease freshness, dan scope tetap diperiksa.

**Authority:** [HTTP memory-context lease](../src/http/memory-context-lease.ts), [HTTP app](../src/http/app.ts), [context lease](../src/memory/context-lease.ts).

## Operasi, integrasi, dan pengelolaan runtime

### CAP-023 — File, pencarian, dan proses langsung

**Aktivasi:** eksplisit: workspace/list/read/multiple-read/write/edit/create/move/info/search, execute/start/read-output/stop/list-process. **Berguna untuk:** melakukan inspeksi dan operasi lokal melalui tool yang memiliki scope dan pencatatan workflow.

**Batas:** tersedianya `execute_command` tidak menghilangkan kewajiban DAG pada task yang membutuhkannya. Recovery stop/status punya pengecualian terkontrol; file read biasa tetap memerlukan route/preflight sesuai kebijakan. AI pengendali yang menentukan kode dan arguments.

**Authority:** [operational tools](../src/mcp/tools.ts), [filesystem](../src/runtime/filesystem.ts), [search](../src/runtime/search.ts), [process manager](../src/runtime/process-manager.ts).

### CAP-024 — Operasi GitHub

**Aktivasi:** adapter default enabled, operasi eksplisit. **Berguna untuk:** repository, Git, issue, PR, Actions, release, packages, dan API GitHub melalui keluarga `github_*`.

**Batas:** membutuhkan credential, izin, dan koneksi yang bekerja. Pemakaian credential dari `gh` merupakan opsi konfigurasi dan default false. Coding tidak otomatis membuat commit, publish package, atau release. Kapabilitas ini bukan bukti integritas histori repository.

**Authority:** [GitHub tools](../src/mcp/github-tools.ts), [GitHub service](../src/github/service.ts), [configuration](../src/config.ts).

### CAP-025 — Operasi Langflow

**Aktivasi:** adapter default enabled; pemanggilan eksplisit dan layanan eksternal harus tersedia. **Berguna untuk:** memeriksa project/flow/component, membuat atau memperbarui flow, menambah node/koneksi graph, dan menjalankan flow.

**Batas:** Langflow merupakan integrasi opsional, bukan dependency inferensi bagi workflow engineering. Flow yang dipilih pengguna dapat memiliki credential/model/dependency sendiri; keberadaan adapter tidak membuat dependency tersebut menjadi wajib bagi Agent-Core.

**Authority:** [Langflow tools](../src/mcp/langflow-tools.ts), [Langflow service](../src/langflow/service.ts), [graph operations](../src/langflow/graph.ts).

### CAP-026 — Directive operator yang persisten

**Aktivasi:** layanan default enabled; set/revoke/status eksplisit, route memakai snapshot yang relevan. **Berguna untuk:** menyimpan directive terstruktur per principal, revisions/hash, serta menginvalidasi route terkait ketika directive berubah.

**Batas:** authority mengikuti katalog directive dan scope yang didukung. Teks bebas bukan otomatis policy executable. Perubahan directive tidak membenarkan melewati memory/workflow gates.

**Authority:** [operator directive tools](../src/mcp/operator-directive-tools.ts), [directive store](../src/operator-directives/store.ts), [route invalidation](../src/runtime/route-context-store.ts).

### CAP-027 — Status, audit, metrik, dan diagnosis

**Aktivasi:** instrumentation/audit otomatis pada jalur layanan; status/health metrics eksplisit. **Berguna untuk:** melihat subsistem, antrean, failures, latency yang teramati, audit pipeline, serta rekomendasi yang menunjuk bukti.

**Batas:** diagnosis memberi rekomendasi; bukan jaminan self-repair atau perintah melakukan optimasi. Threshold latency dalam kode bukan target kecepatan yang harus dikejar pada hardware pengguna. Status merupakan snapshot saat dipanggil, bukan sertifikat kesehatan abadi.

**Authority:** [server status](../src/mcp/server.ts), [health metrics](../src/runtime/health-metrics.ts), [diagnosis](../src/runtime/diagnosis.ts), [audit logger](../src/logging/audit-log.ts).

### CAP-028 — Maintenance terjadwal dan telemetry opsional

**Aktivasi:** opsional konfigurasi. Maintenance default false; OTLP aktif hanya ketika endpoint dikonfigurasi. **Berguna untuk:** pemeriksaan integrity berkala, menyusun retention dry-run plan, serta mengekspor telemetry ke endpoint yang diizinkan.

**Batas:** maintenance ini tidak otomatis menghapus data berdasarkan usia. Retention plan memerlukan peninjauan/aplikasi terpisah. Entri statik di daftar capabilities tidak cukup untuk menyatakan scheduler/exporter sedang aktif.

**Authority:** [maintenance coordinator](../src/runtime/maintenance.ts), [retention planning](../src/execution/retention.ts), [configuration](../src/config.ts).

### CAP-029 — Native controller, tray, dan watchdog

**Aktivasi:** otomatis ketika Agent Code Native berjalan dan state menginginkan layanan berjalan; tombol start/stop/restart eksplisit. **Berguna untuk:** mengelola MCP runtime/tunnel, menampilkan health, mengadopsi proses yang identitasnya terbukti, serta memulihkan layanan sesuai watchdog.

**Batas:** companion native berbeda dari server Node yang diluncurkan standalone. Intent stop pengguna tetap dihormati. Metadata proses tidak tersedia bukan bukti proses hilang; controller tidak boleh restart/stop proses yang identitasnya belum aman.

**Authority:** [native controller](../SubProject/Agent-Code/src-tauri/src/agent_core.rs), [catatan verifikasi controller](../reports/native-process-query-20260910/verification.md).

### CAP-030 — Katalog audited dan deferred capability

**Aktivasi:** katalog/deferred; `capability_search/get/dependencies/coverage` dan `skill_load` eksplisit. **Berguna untuk:** menemukan metadata kemampuan, memeriksa dependency/risk, serta memuat instruksi hanya untuk entri audited native-ready yang memenuhi gate.

**Batas:** katalog yang tidak tersedia menghasilkan coverage kosong. Jumlah entri katalog bukan jumlah fitur source produk. Kategori `git.semantic_tools`, `gui.automation`, `registry.system_admin`, dan `app.adapters` masih dinyatakan deferred pada surface layanan; jangan dipromosikan menjadi fitur aktif hanya dari namanya. Lima kemampuan engineering di CAP-004–008 tidak memerlukan pemanggilan skill.

**Authority:** [capability registry](../src/capabilities/registry-service.ts), [capability tools](../src/mcp/capability-tools.ts), [surface capabilities](../src/mcp/server.ts).

## Default konfigurasi dan batas global

Nilai berikut adalah **default source**, bukan pembacaan `.env` atau jaminan konfigurasi proses aktif. Authority: [src/config.ts](../src/config.ts).

| Pengaturan | Default source | Implikasi |
|---|---|---|
| Engineering coding | wajib `engineering-v1` | Tidak ada switch off/advisory untuk assessment/review coding. |
| `AGENT_CORE_MEMORY_ENABLED` | `true` | Memory service diaktifkan. |
| `AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE` | `enforce` | `disabled` dan `advisory` masih diterima konfigurasi. Klaim fail-closed harus menyebut mode efektif. |
| `AGENT_CORE_MEMORY_ENFORCE_HARD_GUARDRAILS` | `false` | Enforcement guardrail yang tersimpan di memori terpisah dari kewajiban preflight/lifecycle. |
| `AGENT_CORE_MEMORY_SUPABASE_DIRECT_ENABLED` | `false` | URL/secret dan enablement diperlukan; default enforce menahan kerja bila komponen wajib belum siap. |
| `AGENT_CORE_EXECUTION_ENABLED` | `true` | Engine tersedia, tetapi run tidak dibuat tanpa operasi yang memintanya. |
| `AGENT_CORE_EXECUTION_MAX_CONCURRENCY` | `4` | Batas atas konfigurasi, bukan target atau bukti overlap. |
| `AGENT_CORE_EXECUTION_RESOURCE_GOVERNANCE_ENABLED` | `true` | Dispatch mengikuti kondisi resource yang teramati. |
| GitHub / Langflow / operator directives enabled | `true` | Adapter/service tersedia; operasi dan prerequisites tetap bersyarat. |
| `AGENT_CORE_GITHUB_USE_GH_CLI` | `false` | Penggunaan credential CLI harus dikonfigurasi. |
| `AGENT_CORE_MAINTENANCE_ENABLED` | `false` | Scheduled maintenance tidak aktif secara default. |
| OTLP | tanpa endpoint: nonaktif | Bukan ekspor telemetry wajib. |

`agent_core_capabilities.enabled` memuat sejumlah deklarasi statik termasuk subsistem yang dapat dimatikan melalui konfigurasi. Gunakan status efektif masing-masing layanan dan schema callable untuk menentukan keadaan aktual. `engineeringRequiredForCoding`, `requiredCraft`, dan `multiStepDag` pada status layanan tidak menggantikan kewajiban/phase/bukti task yang dibaca melalui `workflow_status`.

### Snapshot saat inventaris dibuat

[Status tersimpan](../reports/capability-inventory-20260910/status.json) diperiksa pada `2026-09-09T23:56:45.420Z` atau 2026-09-10 waktu lokal melalui MCP lokal terautentikasi. Server melaporkan versi 0.7.0, Node v24.16.0, engineering-v1 wajib untuk coding, memory/Graphify/continuity/execution sehat, Supabase Direct enabled/healthy dengan pending 0, dan storage workflow ready. Discovery lokal mengembalikan 72 tools; craft mempunyai `list/read/discover/impact/review`, plan mempunyai `submit/review`. Katalog saat itu berisi 0 entri. Ini verifikasi koneksi lokal tersebut, bukan impor schema ChatGPT Web baru.

File yang sama juga memuat konfigurasi dari `loadRuntimeConfig` dengan `.env` dan tanpa process overrides: lifecycle enforce, hard guardrails false, Direct/execution/resource governance enabled; maintenance dan OTLP disabled; adapter GitHub/Langflow/directives enabled; credential `gh` disabled. Bagian konfigurasi itu **bukan dump environment proses berjalan**. Bedakan nilai konfigurasi file tersebut dari field yang benar-benar dilaporkan live; kesehatan GitHub/Langflow tidak dibuktikan oleh pemeriksaan ini.

Tidak ada klaim bahwa seluruh desain paling sederhana, seluruh caller di luar inventory telah ditemukan, semua output aman/teredaksi, seluruh task selalu paralel, atau hardware menjadi lebih cepat. Kekuatan sistem berada pada pengumpulan fakta, keputusan berbukti, koordinasi execution, serta penutupan yang dapat diperiksa.

**Mekanisme output terpilih dari penilaian RTK sudah diimplementasikan secara internal dan dibangun ke runtime.** CAP-013 mencatat pengujian lokal serta pemeriksaan runtime yang berhasil; acceptance Web masih pending. Paket/runner/tracker donor tidak dipasang. Kandidat lain dan batas integrasi tetap dicatat di [assessment RTK](roadmap/rtk-integration-assessment.md).

[Presentation Bridge](../SubProject/Presentation-Bridge/README.md) merupakan proyek konversi PPTX yang berdiri sendiri. Folder `SubProject/Super-Runtime` dan isi `referensi` juga tidak otomatis dihitung sebagai kemampuan MCP bawaan hanya karena tersedia di checkout. Entri baru memerlukan bukti sambungan runtime dan perilaku aktual. Companion native pada CAP-029 dicatat terpisah karena memang menangani lifecycle server/tunnel.

## Buku bukti dan perubahan

Buku ini mencatat perilaku yang telah diperiksa, bukan daftar janji. Tanggal pada baris inventaris menunjukkan tanggal pencatatan; tanggal peristiwa dan rincian test mengikuti laporan tertaut.

Percobaan awal [Web tertahan sebelum plan](../reports/output-projection/web-acceptance-blocked.md) tetap merupakan histori. Pada investigasi berikutnya, pengguna melaporkan source yang sama berhasil dibaca. [Perbaikan dan bukti terbaru](../reports/workflow-lifecycle-recovery-20260910/verification.md) menangani atomic engineering capture dan false positive source projection yang memblokir preflight/durability; 111 kasus terkait lulus dan build berhasil. Task acceptance asli sekarang interrupted/DISCOVERY; checkpoint diagnostik child masih pending untuk retry melalui request aslinya. Runtime sempat sehat setelah restart, lalu sengaja ditutup pengguna dan dibiarkan mati. Pemeriksaan live berikutnya menunggu aplikasi dinyalakan kembali. Tidak ada klaim bahwa patch ini menyelesaikan penolakan safety Web atau acceptance CAP-013.

| Dicatat | ID terkait | Perilaku / bukti | Batas bukti |
|---|---|---|---|
| 2026-09-10 | CAP-001–030 | Baseline inventaris source versi 0.7.0; lokasi authority tercantum pada tiap entri. | Audit pembacaan source, bukan test baru atau sertifikasi runtime seluruhnya. |
| 2026-09-10 | CAP-001–003, CAP-015–021, CAP-027, CAP-030 | [Snapshot MCP lokal](../reports/capability-inventory-20260910/status.json): status sehat untuk subsistem yang dilaporkan, schema engineering tersedia, 72 tools dan katalog kosong. | Tidak membuka route, membuat task/run, menjalankan test, atau membuktikan kesehatan seluruh integrasi eksternal. |
| 2026-09-10 | CAP-004–012, CAP-015–021 | [Acceptance engineering-v1 Web](../reports/engineering-v1/web-acceptance-final.md): existing reuse, native basename, alias/namespace caller, dua target terencana, wrapper retained; task `89abd2a5-9aa7-4a51-a784-ed3e53896da8` ditutup completed. | Satu fixture child project; dynamic/external consumers di luar bukti. Run Web tidak membuktikan overlap writer. |
| 2026-09-10 | CAP-012, CAP-020–021 | Laporan yang sama mencatat final run `193d0c96-b8dc-4290-aac2-65595f95ab92`, 5 assertions, artifact verified/current, checkpoint `4d416734-eb23-474a-81f5-d2e9e9060684`, enam memory readback, dan closure synced. | Bukti historis yang dibaca ulang; bukan fresh remote verification atau restart/test baru saat menyusun inventaris. |
| 2026-09-10 | CAP-013; hubungan CAP-012/014 dipertahankan | Parser `2.0.0`, full raw hash validation, bounded head/tail coverage, severity-preserving diagnostics, projection/dedup per attempt, raw access dan bounded recovery. [121 kasus/13 file](../reports/output-projection/test-verification.json) lulus berdasarkan hasil terakhir per file; build berhasil, 167 pasangan source/build cocok sekitar restart, 72 schema tool tetap sama, [runtime sehat](../reports/output-projection/runtime-after.json). | [Acceptance Web](../reports/output-projection/chatgpt-web-verification.txt) masih pending. Regresi luas mendahului perbaikan akhir yang diuji terarah; histori test gagal dipertahankan. Tidak mengklaim semantic full-log scan, token saving, benchmark, atau completion seluruh proyek. |
| 2026-09-10 | CAP-004, CAP-016, CAP-019–021 | Aktivasi/capture satu commit; validasi source computed-label mempertahankan byte/hash dan pemeriksaan kredensial. [111 kasus/9 file](../reports/workflow-lifecycle-recovery-20260910/test-verification.json) lulus; build berhasil; local workflow snapshot yang gagal kini valid tanpa perubahan fixture/state diagnostik. | Health komponen bukan lease atau synced checkpoint. [Restart dan penghentian berikutnya](../reports/workflow-lifecycle-recovery-20260910/verification.md) dicatat terpisah; recovery checkpoint produksi dan acceptance Web masih pending. Schema/nama tool tetap; pemisahan target/donor belum diterapkan. |

Laporan acceptance membedakan run awal yang gagal sebelum mutation dari run sukses berikutnya. Hasil sukses tidak menghapus failure historis. Ledger ini tidak menyatakan integritas seluruh histori Git pulih, package/release terbaru diterbitkan, ataupun repository mendapat sertifikasi stabil menyeluruh.

## Cara memelihara inventaris

Pertahankan ID CAP yang sama ketika implementasi berubah. Saat kemampuan baru ditambahkan, berikan ID baru; jangan mengubah arti ID lama agar bukti lama terlihat mendukung fitur baru. Perubahan dokumentasi saja tidak meningkatkan status verifikasi sebuah kemampuan.

Untuk setiap perubahan kemampuan, perbarui entri yang relevan dan tambahkan catatan ringkas dengan format:

```text
Tanggal:
ID kemampuan:
Perilaku sebelum -> sesudah:
Aktivasi/default dan pemicu:
Source authority:
Bukti pemeriksaan dan hasil aktual:
Batas analisis / acceptance yang belum diuji:
Dampak schema, konfigurasi, atau kebutuhan registrasi client:
```

Sebelum membandingkan kandidat baru, cocokkan tugasnya dengan ID yang ada, identifikasi overlap dan perilaku yang benar-benar belum tersedia, lalu buka source authority pada entri tersebut. Jika source berubah setelah bukti dibuat, perbarui freshness dan jalankan pemeriksaan relevan; jangan memperluas grounding atau mengulang seluruh test tanpa alasan dari perubahan yang sedang dilakukan.
