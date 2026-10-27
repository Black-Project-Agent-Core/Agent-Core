# Penerimaan External Learning dan kartu proposal — 19 Oktober 2026

Status: source, build, aktivasi resident dan operasi UI Refresh tools selesai;
batas descriptor cache dicatat di bawah. Permintaan menyetujui urutan
P08 → P01 → P02, owner existing, Native tersedia untuk pengembangan dan operasi, serta proposal Markdown/card.
P03–P07 tetap usulan.

## Perubahan dan owner

- P08: direct external recall menggunakan budget lokal 15 detik dan signal
  waiter. Scope lookup ikut budget; hasil provider terlambat tidak membuka
  admission baru. Ledger memakai append durable setelah admission, dengan
  preparation histori lama terpisah. Ini tidak membatalkan provider, mempreempt
  syscall sinkron atau membuktikan delivery jaringan.
- P01: `description(goal)` pada start/reconnect Learning menghubungkan episode
  Memory existing secara idempotent. Tanpa description, task_start manual tetap
  berlaku. Constraint/failed-path/blocker/next-action dan capsule menggunakan
  Memory event/checkpoint existing. Paused/completed tidak otomatis dibuka.
- P02: opt-in claim_review pada facade Memory eksternal memisahkan HOW dari
  WHEN, attempt dari last-success dan disposition dari tindakan. Canonical
  `state/claim-reviews` memakai transaksi Memory existing. Unavailable tetap
  unresolved, source availability bukan kebenaran semantik, dan fakta utama
  tidak ditulis ulang. Histori, revision CAS dan complete backup dipertahankan.
- Proposal: explicit external Skill publication menghasilkan proyeksi `.md`
  dalam `docs/proposals/skills`; generic improvement tetap dokumen. Default
  runtime Native tidak direlokasi. Dashboard membaca daftar/isi exact digest
  melalui route loopback/UI-token dan launcher transport existing. Cards tidak
  menjadi bukti persetujuan atau tombol aktivasi.

Panduan assistant: [alur Memory](memory/EXTERNAL-LEARNING-PRIORITIES.md) dan
[penulisan/revisi/review proposal](proposals/REVIEW-GUIDE.md). Bootstrap/context
dan capability guide mengungkap rujukan ini.

## Bukti pengujian dan review

- Deadline/cache tahap awal: 84 pass (`recall-green.json`).
- Kontinuitas tahap awal: 37 pass (`continuity-green.json`).
- Main acceptance awal: 55 pass, 1 scale case dikecualikan (`main-acceptance.json`).
- Integrasi akhir Main: 109 pass/2 skip (`integration-acceptance.json`), ditambah
  137 pass (`disclosure-acceptance.json`). Setelah deduplikasi nama test/file:
  **242 root test pass, 2 skip**, termasuk regresi penutupan terminal tambahan.
  UI acceptance **15 pass** (`ui-acceptance.json`).
  Dua skip terkait privilege/setup fixture filesystem; tidak dihitung pass.
- Raka menangani proposal slice dan review independen Main. Tiga temuan review
  ditutup: mirror lambat setelah disclosure, kontrak review pada revisi note lama,
  dan admission saat antre commit. Regresi baru menguji batas tersebut. Mirror
  RED terbukti sebelum koreksi; laporan GREEN tersimpan dalam evidence folder.
- Pemeriksaan awal transfer: 24 pass, 1 existing case 501-record timeout
  (`claim-review-transfer.json`). Case tersebut tidak dinyatakan pass; focused
  transfer/claim backup berikutnya lulus. Belum ada diagnosis atau klaim regresi
  atas timeout scale case itu.

Evidence detail berada di `runtime/build/learning-priorities-20261019`. Tidak
ada benchmark manfaat learning/proaktif atau peningkatan kecerdasan. Pengujian
fungsional membuktikan kontrak yang diuji saja.

## Aktivasi dan penerimaan resident

- Core build/typecheck, UI build dan self-contained win-x64 launcher publish
  berhasil. SDK sistem tidak tersedia; recovery memakai SDK lokal existing
  `runtime/dotnet-sdk`, tanpa instalasi. Release intent minor ditambahkan;
  release apply/version bump/commit/push/publish tidak dijalankan.
- Historical governance check **31 wholefiles/78 shared sections PASS**, path policy **450
  authored files/0 exceptions PASS**, release-intent check `ok=true`. Baseline
  Native tidak diubah.
- Restart resmi pertama `95613e38cb8e4d6896c38ee13719486b`, exit 0. Pending launcher
  dipasang melalui restart owner dan executable lama tersimpan pada backup
  existing. SHA-256 root executable baru:
  `7507b77509120fbbf14fd17411885ab0d0a48fe5951a92b93f23e1d2d86bc4f9`.
  Listener Core 127.0.0.1:8765 PID 22704; `/health=ok`, Memory canonical/index/
  embedding available, zero Memory issues. Probe awal memakai 8767 keliru;
  konfigurasi source membuktikan port Core 8765.
- Penutupan Learning nyata mengungkap kesalahan urutan hook dokumen baru:
  `recordLearningReview` menutup episode sebelum admission publikasi diperiksa,
  sehingga hasil publikasi keliru `unavailable`. Review/checkpoint canonical
  tetap tersimpan. Regresi terminal terbukti RED, lalu 22 tes reconnect/closure
  GREEN (`terminal-publication-red.json`, `terminal-publication-green.json`).
  Publikasi kini sesudah review durable dan sebelum mirror penutupan; kegagalan
  publikasi tetap hasil terpisah. Raka mereview koreksi tanpa temuan material.
- Core dibuild ulang dengan freeze/path/typecheck PASS, lalu restart resmi
  kedua `2dcb5a81d89c4c51891f045f57db3fe7`, exit 0, memuat koreksi internal ini.
  Launcher tidak perlu dipublish ulang; SHA executable tetap seperti di atas.
  Listener akhir PID **14768**, `/health=ok`, 224 note canonical dan zero issues.
  Handshake diulang; canonical Memory 170 workspace entries dapat dibaca setelah
  satu transient internal error. Task recovery yang sama tersambung kembali ke
  episode `3f1d1323-9b41-478f-8bd1-869fd24f9eea`; tidak ada restart buta.
- Penerimaan akhir melalui capability resident berhasil: checkpoint 437 dan
  keyed review task recovery mengembalikan `complete=true`,
  `proposalDocuments.status=not-required` dengan daftar dokumen/failure kosong,
  serta `externalEpisodeLinkage=recorded`. Episode ditutup pada
  `2026-10-18T19:41:09.883Z`, pendingLearning=false. Sebanyak 28 review lama
  tetap utuh. Review no-new-knowledge tidak menyatakan perbaikan ini manfaat
  learning baru; verifier independen tetap unavailable. Audit pra-review dan
  hasil nyata terpisah: `finalization-recovery-audit.json` dan
  `finalization-recovery-outcome.json`; audit asli tidak ditimpa.
- Handshake baru mengungkap guide Memory/proposal pada bootstrap. Capability
  call mengungkap claim_review version 1 dan structured guide. Recall nyata
  mengembalikan 3 hasil. Reconnect task yang sama mengembalikan Memory episode
  `bef64084-54ee-4c46-ad98-90a07d0c25ce` revision 2, capsule freshness current dan
  continuity ready, dengan goal/constraint/current-state/blocker/next-action.
  Ready tidak berarti task selesai atau izin mengabaikan blocker.
- Setelah Refresh tools selesai, blocker diselesaikan melalui correction event
  yang mempertahankan SourceRef lama. Attempt upsert critical biasa ditolak oleh
  `MEMORY_PRESERVATION_REQUIRED` tanpa mengubah revision; recovery memakai
  correction+retained refs. Episode Memory kemudian completed revision 4 dan
  checkpoint akhir berhasil. Ini koreksi penggunaan kontrak existing, bukan
  perubahan reducer/Native.
- Satu klaim terbatas tentang preferensi lokasi/format proposal pada Memory
  `05a192d3-fb37-46f3-93aa-3794039181eb` direview sebagai **controller-assessed
  supported**. Kontrak/attempt dan last-success dapat dibaca kembali. Primary
  semantic revision tetap `sha256:0635b9fe5f596d755eb4f8d3f63e13b999785939ffcb4bd79bc7b2f380c6b630`.
  Ini tidak memvalidasi seluruh note, status HOLD historis atau semua Memory.
- GET `/agent/proposals` tanpa token pada resident menghasilkan 401. Backend
  read/auth/exact-digest serta transport launcher dikompilasi/diuji terarah.
  Pembuktian visual memakai built Dashboard + temporary WebView message shim ke
  compiled reader atas dua dokumen proposal lokal, dengan katalog Skill fixture
  kosong; ini bukan klaim interaksi langsung pada WebView resident. Chrome
  existing dijalankan headless untuk QA lalu ditutup, tanpa dependency baru atau
  pengambilan alih layar. Reader membuka exact proposal dan structured guide;
  console aplikasi tidak memiliki error. Panel proposal diperiksa pada 1440×1000
  dan 420×900; clipping tombol yang ditemukan diperbaiki hanya pada CSS proposal.
  Layout mobile seluruh aplikasi tidak diklaim lulus. Bukti PNG/JSON ada di
  folder evidence, `ui-render-acceptance.json`.
- Graph provider melaporkan current/integrity-accepted; impact menemukan satu
  production caller registrar, `createAgentCoreMcpServer`. Source exact dan
  guard/tests memverifikasi cabang external opt-in dan Native tetap. Snapshot
  graph lama bukan bukti semua helper baru terindeks; tidak ada reindex luas.

## Browser Refresh tools dan discovery

Percobaan latar pertama tidak mendapat koneksi OBU terverifikasi dan tidak
meluncurkan browser. Setelah pengguna menyatakan extension Connected, retry
berhasil dengan OBU 1.1.0, background=true dan task tab 589865747. Halaman exact
settings Agent Core dibuka, panel digulir sampai **Refresh tools** terlihat,
lalu tombol ditekan **sekali**. Loading diamati (aksi Refresh tools hilang), lalu
observasi berikutnya mengembalikan tombol enabled/actionable tanpa pesan error.
Tab milik task ditutup melalui capability dan browser pengguna dipertahankan.
Satu respons scroll mengalami
network error; state diobservasi ulang sebelum memilih aksi baru, tanpa replay
klik. Tidak ada input desktop atau perintah foreground/browser fallback.

Capability call sesudah klik tetap mengungkap guide claim_review version 1;
claim_review read kembali berhasil lewat client capability yang sebenarnya.
Pada observasi pertama, deskripsi tool client masih cache lama. Observasi
capability berikutnya setelah recovery sudah mengungkap descriptor baru:
`memory_v2_read/write` menyebut `claim_review`, dan `controller_learning`
menjelaskan `description(goal)`. Ini supersedes batas cache pada snapshot awal;
tidak mengklaim semua client/browser lain ikut direfresh.

## Batas lainnya

Permintaan lanjutan pengguna menambahkan prosedur arsip proposal yang telah
disetujui dan selesai ke `docs/history-agent-core`, melalui guide, README dan
AGENTS. Folder tujuan sudah ada; panduan arsip semantik ditambahkan tanpa
menimpa histori. Dokumen induk P01–P08 tetap aktif karena P03–P07 belum disetujui.
Tidak ada migrasi massal atau pemindahan state Native/runtime; reader Dashboard
tidak dinyatakan sebagai pemindah/indexer history otomatis.

Review persistence terakhir memeriksa delete/forget v2: physical delete tetap
ditolak oleh preservation owner; forget tidak menghapus note. Karena itu link
review→live note pada complete transfer mengikuti invariant existing. Tidak ada
fallback archive atau perubahan Native tambahan.

UI typecheck terpisah sebelumnya mengungkap dua diagnostic existing pada
`Diagram.test.ts` (declaration jsdom) dan `main.tsx` (CSS side-effect declaration).
Tidak ada dependency baru dipasang. Hasil build aktual dicatat setelah selesai.

Functional tests dan penilaian controller tidak membuktikan peningkatan
kecerdasan, pembelajaran kausal atau manfaat kumulatif. Learning finalization
memisahkan controller outcome dari verifier independen terdaftar; audit/hash
berkas tidak dinaikkan menjadi controlled-workflow pass. Runtime evidence
capture yang terkena excluded-path tetap unavailable, tidak dibypass.

## Catatan Cortex saat penutupan

Dua catatan tahap sebelumnya telah dikonfirmasi tersimpan, termasuk aturan
arsip `c2f17889-049f-4e49-b3af-a22b46bfe3da`. Pembaruan koreksi finalisasi dan
descriptor baru diterima sebagai queued job
`c62bc624-5c54-401e-a1d8-cb28ce7bdd1e`, belum diklaim saved. Search konfirmasi
mengembalikan `check_unavailable` dan tidak melakukan pencarian; isi tidak
ditulis ulang. Dokumen lokal dan outcome resident tetap menjadi bukti hasil.
