# Spesifikasi draft adopsi referensi Memory

**Status:** PROPOSED / DOCUMENTATION ONLY. Dibuat 11 Oktober 2026 WIB berdasarkan permintaan membuat plan per referensi. Belum merupakan implementasi, migrasi, aktivasi, atau bukti manfaat model.

**Baseline source:** `957077fab260dd58d0cc7cfc0881172d05f84667`, versi source `0.15.0-beta.2`. Runtime Windows dan pemasangan Memory06–11 memiliki verifikasi terpisah. Rencana baru tidak boleh disisipkan ke pemasangan tersebut.

## Tujuan

Memperkuat kesinambungan konteks, ketepatan histori, sintesis berbukti, pelajaran yang berlaku sesuai kondisi, dan ingatan atas niat tertunda. Penyimpanan, retrieval, interpretasi controller, dan keberhasilan tindakan adalah empat hasil berbeda. Tidak menjanjikan ingatan sempurna atau penalaran setara manusia.

## Pilihan arsitektur

Pilihan yang direkomendasikan: adopsi mekanisme kecil melalui owner Agent Core yang sudah ada. Mengganti seluruh backend dengan satu donor memperbesar migrasi dan dependensi; menumpuk semua donor membuat penulis/indeks/otoritas ganda. Kedua pilihan itu tidak menjadi lingkup rencana ini.

MemoryEpisodes/TaskCapsule, MemoryPromotion, temporal/provenance/revisions, Learning review/procedures, dan harness Plan05 tetap menjadi rumah utama masing-masing tanggung jawab. Model pengontrol tetap melakukan sintesis semantik. Tidak ada LLM tersembunyi atau penggantian provider embedding.

## Satu referensi, satu tanggung jawab rencana

| Plan | Referensi | Tanggung jawab unik | Batas dengan rencana lain |
|---|---|---|---|
| 12 | Anthropic long-running harness | Pemakaian checkpoint/restore pada lifecycle controller | Tidak membuat reducer/capsule atau capture cursor baru |
| 13 | memU | Handoff capture/commit yang tahan retry dan kegagalan | Tidak mengambil alih lifecycle/resume Plan12 |
| 14 | Graphiti | Query validAt dan knownAt yang berbeda | Tidak membangun ulang supersession/conflict |
| 15 | Hindsight | Sintesis proyek dengan dependensi bukti dan status stale | Bukan lesson/playbook writer kedua |
| 16 | ACE | Delta kurasi pelajaran terbatas dan counterexample | Tidak mengatur lifecycle atau merangkum seluruh history |
| 17 | OpenAI memory/compaction cookbook | Integritas isi compaction serta batas fakta/artifact/procedure | Tidak memasang framework SDK atau mengulang lifecycle Plan12 |
| 18 | PM-Bench | Kandidat niat dengan kondisi yang dievaluasi saat ada panggilan controller | Tidak menjalankan scheduler/action otonom |
| 19 | REALM | Eksperimen offline hubungan ingatan berdasarkan outcome | Tidak mengubah graph produksi |
| 20 | LongMemEval | Diagnostik recall, lintas sesi, update, waktu, abstention | Memperluas harness Plan05, bukan harness kedua |
| 21 | MemProbe | Diagnostik interference, misinformation, konsolidasi berulang | Berbagi kontrak diagnostik Plan20, bukan duplikasi parser |

Plan20 dan21 adalah adopsi metodologi pengujian. Plan19 tetap eksperimen. Nomor rencana tidak mewajibkan eksekusi otomatis berurutan atau pemasangan semuanya.

## Global constraints

- TypeScript/Node.js sesuai proyek: Node >=24.15.0, Vitest yang sudah terkunci dalam repo. Tidak menambah Python, database graph, service, daemon, atau SDK donor sebagai prasyarat.
- Scope owner/workspace/task tetap dipercaya dari host, bukan dari isi memory atau argumen controller yang mengaku sebagai owner.
- Memory advisory dan Learning fail-soft; kegagalan keduanya tidak mengunci machine-control atau pekerjaan pengguna.
- Bukti sumber, revision, temporal lineage, pinned protection, dan keputusan review tetap dipertahankan. Klaim model bukan verifikasi independen.
- Tidak menyimpan rahasia, raw chain-of-thought, atau menambang percakapan host tanpa akses dan ruang lingkup yang sah. Gunakan input controller/tool yang sudah disetujui.
- Tidak membaca/menulis Memory produksi sebagai fixture. Gunakan data sintetis terisolasi; uji fungsi didahulukan, benchmark CPU/RAM/latency berat ditunda.
- Tidak mengeksekusi repo donor atau memakai dataset/kode berlisensi belum jelas. PM-Bench belum memiliki lisensi tracked yang ditemukan; MemProbe suite40/derivatif bersifat nonkomersial; lisensi subfolder contoh Anthropic perlu klarifikasi sebelum penyalinan. Adopsi ide melalui implementasi dan fixture orisinal.
- Tidak mengubah marker aktivasi, memigrasi store, mengaktifkan opt-in, atau memulai reembedding/cloud calls secara tersirat.
- Runtime/source aktif tetap di folder asli. Tidak ada clone/worktree/backup/stash baru di Windows atau runtime aktif dari temp. Status Git dirty bukan error runtime dan bukan alasan mensyaratkan seluruh checkout bersih.
- Pisahkan source commit, build, artefak terpasang, proses aktif, hasil uji, release dan package. Dokumentasi ini tidak mengubah versi produk; implementasi kelak harus menilai versi berdasarkan perubahan kontrak nyata.

## Ketergantungan dan urutan

Tinjau/terima pemasangan Memory06–11 secara terpisah sebelum mengklaim fondasi resident siap. Implementasi setiap plan memerlukan pemilihan scope eksplisit; satu rencana selesai diuji dan diterima sebelum beralih bila pengguna meminta pengujian satu per satu.

12 dan13 dapat diuji pada fixture terpisah, tetapi integrasi lifecycle harus diserialkan. 14 dapat berdiri sendiri dengan baseline yang ada. 15 tidak wajib menunggu14: jika belum ada knownAt, sintesis harus jujur berbasis bukti terkini. Task2 Plan17 (candidate-purpose) merupakan prasyarat kecil untuk adapter Plan16; nomor bukan urutan wajib. 16 dan17 memiliki owner berbeda; perubahan proposal/review yang bertemu harus direkonsiliasi dalam satu owner. 18 hanya menghasilkan kandidat; penilaian izin tetap terpisah. 19 tidak menjadi dependensi produksi. 20 mendefinisikan ekstensi diagnostik bersama, lalu21 menggunakannya; jangan menduplikasi kontrak atau mengganti parser lama tanpa versioning.

## Kriteria penerimaan setiap rencana

1. Uji terarah dengan nama dan assertion konkret; catat RED awal, GREEN sesudah implementasi, dan regresi terkait. Tidak mengklaim seluruh suite lulus dari subset.
2. Tidak kehilangan catatan/bukti di restart, retry, konflik revisi, atau perubahan scope yang diuji.
3. Tidak ada second writer/second store, provider call tersembunyi, grant baru, atau aktivitas otonom di luar rencana.
4. Dokumentasi/codebase/changelog dan penilaian versi diperbarui sesuai hasil aktual.
5. Handoff Windows mencantumkan commit yang benar-benar telah dipush: fetch/verify > integrasi selektif > build kanonis > aktivasi/restart aman > identitas runtime > uji fungsi. Jangan memakai placeholder SHA sebagai hasil nyata.
6. Restart melalui MCP yang sama tidak boleh memutus satu-satunya kontrol tanpa rute pemulihan independen yang terbukti; jika perlu, berikan satu langkah manual pengguna yang tepat.
7. ZIP laporan tersanitasi di folder laporan permanen, berisi status PASS/FAIL/BLOCKED/NOT RUN, log, identitas source/build/runtime, manifest path/size/SHA256. Tanpa raw Memory/credential atau salinan seluruh proyek. Verifikasi ZIP dengan fresh extraction sebelum menyerahkan.

## Sumber referensi

Snapshot clone dan pembanding dicatat di laporan referensi yang diberikan kepada pengguna. Setiap rencana menyimpan tautan commit-pinned yang diperlukan, sehingga pembaca repo tidak perlu memiliki direktori Linux yang sama. REALM memakai paper karena repo penulis belum terverifikasi. Adanya source terbuka tidak membuktikan fitur lengkap, manfaat produksi, atau hak menyalin semua konten.
