# Audit donor Harness2 terhadap Agent Core (2026-10-25)

Status: RISET / READ-ONLY. Tidak ada source Agent Core yang diubah. Usulan ada di
[Harness2-Donor-Proposals](../history-agent-core/Harness2-Donor-Proposals.md) dan menunggu keputusan pemilik per item.

## 1. Lingkup dan metode

- **Donor:** `google-research/harness2`, clone di `G:\repos\harness2`, commit `1cfe254e8d25b15f37048c3730134686abe60335`
  (2026-10-13), Apache-2.0. Tidak ada yang dipasang atau dijalankan dari repo itu.
- **Resipien:** Agent Core di `E:\Projects\Agent-Core` (working tree, source terkini sebagai otoritas akhir).
- **Metode replica:** `replica-recon` (peta donor: komponen, alur, artefak, bagian sulit, ukuran) lalu `replica-diff`
  (matriks fitur berbobot must 3 / should 2 / could 1, partial 0,5, skip dikecualikan). Alat `parity.py` tidak bisa jalan
  karena Python tidak terpasang; rumus yang sama kuhitung dengan Node. Matriks: [features.csv](harness2-donor/features.csv).
- **Metode mind-control (audit kedua, dua arah):** tiap klaim dipisah menjadi teramati / disimpulkan / tidak diketahui;
  source mengalahkan README dan ringkasan agen; tiap usulan diberi pesaing penjelasan dan pemalsu (falsifier).
- **Sumber Harness2 yang dibaca:** `harness2/core/*.py`, `substrate/*.py`, `config.py`, `docs/EXPERIMENTS.md`, `SETUP.md`,
  `tests/test_workflow.py`. Dua agen pembaca membuat peta berjangkar baris; aku memverifikasi sendiri `recursion.py:176-252`,
  `ledger.py:20-132`, `library.py:110-135`, `tree.py:330-392`, `context.py:380-420` dan `prompts.py:130-150, 1105-1163`.
  Sisanya (cache proposer, penjadwalan, executor) bersumber dari peta agen dan berlabel *belum diverifikasi ulang*.
- **Sumber Agent Core yang dibaca:** `src/learning/external-evaluation.ts`, `external-improvements.ts`,
  `external-procedure.ts`, `feature-outcome-pool.ts`, `improvement-handoff.ts`, `src/agent-memory-evaluation.ts`,
  `src/agent-runtime.ts:735-801`, `src/agent-controller.ts:660-690`, `src/skills/service.ts:186-260, 851-885`,
  `src/agent-learning-loop.ts`. Penilaian sebelumnya (HG-1..HG-6, `docs/Harness-Self-Improvement-Third-Wave-Gap-Audit-20261022.md`)
  hanya memakai paper/README Harness2; audit ini yang pertama membaca source-nya.

## 2. Peta donor (recon)

**Inti:** kerangka "recursive agent harnessing" tanpa ground truth saat tugas berjalan. Bobot model tetap; yang dioptimasi adalah
*harness* (delapan komponen: system prompt, guardrails, memory, tool guidance, subagents, skills, scripts, plugins).

**Alur satu tugas** (mode parallel, k): executor menjalankan harness dasar -> editor (INV dan DOM) mengusulkan 2k edit pada
pohon file harness -> tiap usulan divalidasi secara struktural, dicoba ulang dengan teks penolakan verbatim, lalu jatuh ke pohon
warisan bila gagal (`recursion.py:180-251`) -> tiap kandidat dijalankan sekali (probe) -> k komposer menggabungkan, mengadopsi satu,
atau KEEP_BASE -> seleksi buta dengan id teracak -> reflektor menulis baris "apa yang dilakukan tiap edit" dan paling banyak satu
pelajaran ke perpustakaan yang dibaca tugas berikutnya. Mode sequential membawa harness hasil komposisi ke ronde berikutnya.

**Artefak:** pohon harness per label, `summary.json` dengan sidik jari harness, `adoption.json`, `EXPERIENCE.md` dan `INDEX.md`
per domain, ledger R=4k rollout dan P=3k sesi, cache panggilan improver berbasis hash isi.

**Ukuran:** sekitar 12,7 ribu baris Python inti (`harness2/`), ditambah `third_party/` untuk runner tiga benchmark. Bagian sulit:
executor OpenCode/Codex tanpa sandbox, jaringan terbuka, penjadwalan konkuren berbasis `fcntl` (khusus POSIX).

## 3. Paritas (replica-diff, donor vs Agent Core)

Skor fitur **58,5** dari 100 (23 baris terhitung, 2 skip, 3 dari 4 must-have terpenuhi). Area terlemah: `recursion` 0, `selection` 0,
`evidence` 50, `surface` 55. **Jangan baca ini sebagai "Agent Core 58% sebaik Harness2".** Angka itu hanya cakupan daftar fitur
donor dengan bobot yang kutetapkan sendiri; Agent Core sengaja tidak memiliki loop probe pada tugas produksi.
Empat baris tambahan yang tidak dimiliki donor (gate oracle independen, tool grant, pemindaian rahasia, operasi Windows) tidak masuk skor.

## 4. Audit kedua (mind-control)

### Teramati di source
1. Penerimaan edit Harness2 hanya struktural (`recursion.py:226`, `tree.py:336-390`). Tidak ada skor yang membandingkan kandidat dengan basis,
   dan basis dikeluarkan dari kolam seleksi (`selection.py:93-111`), jadi regresi bisa terpilih. Kandidat yang gagal menjadi pohon
   sama dengan basis tetapi tetap di-roll dan bisa dipilih (`recursion.py:242`).
2. Executor tidak disandbox, jaringan terbuka, Codex berjalan dengan sandbox dan persetujuan mati (`docs/EXPERIMENTS.md:96-109`,
   `codex.py:166`). Pertahanan injeksi hanya teks prompt (`prompts.py:59`).
3. Biaya executor tidak tercatat dan tidak ada batas dolar (`recursion.py:299`). Ledger menghitung rencana kerja, bukan hasil sukses.
4. Batas teks always-on: 24.000 karakter (OpenCode) dan 8.000 (Codex), diperiksa sebelum probe (`tree.py:336-390`). Prompt editor
   mengurutkan biaya tuas: skill, skrip, subagen, plugin, baru teks always-on (`prompts.py:130-146`).
5. Reflektor wajib memisahkan `helped/hurt/no observed effect/confounded`, dan pelajaran yang hanya bertumpu pada baris `confounded`
   dianggap tebakan; tanpa kontras eksekusi tulis `NO_ENTRY` (`prompts.py:1105-1163`).
6. Ledger memeriksa duplikat label sebelum jumlah, karena duplikat bisa memuaskan jumlah (`ledger.py:89-113`).

### Teramati di Agent Core
1. `SkillService.scanDirectory/validate` memeriksa higiene file (symlink, ukuran, jumlah, UTF-8), frontmatter dan digest; tidak
   memeriksa bahwa path yang dirujuk SKILL.md ada, dan tidak memiliki batas teks always-on (`src/skills/service.ts:208-249`).
2. `evaluateExternalComparison` mengunci kecocokan metadata, jendela waktu dan cakupan kasus, dan menolak tugas duplikat/tumpang-tindih
   antar-arm (`external-evaluation.ts:89`), tetapi tidak membandingkan upaya per arm (jumlah percobaan/panggilan model); biaya dan
   waktu hanya dihitung sebagai selisih (`:131-134`). `benefitVerdict` selalu `withheld`.
3. `learning` hanya punya `attribution: supported|unknown` (skema assessment); tidak ada vonis per-komponen atau konsep `confounded`
   (pencarian "confound" di `src/learning` kosong).
4. Evaluasi Native membatasi target tool ke jalur input dan jawaban; berkas oracle tidak terbaca model (`agent-controller.ts:672-683`).
5. `AGENTS.md` 78.135 byte; satu `controller_contract(read)` mengembalikan 78.493 karakter. Giliran Native percakapan-saja (tanpa tool)
   memakai sekitar 8 ribu token masukan per giliran (task `080e6ef5`: 7.732; `4b00b8dd`: total 8.337). Rincian per bagian prompt **belum diukur**.

### Tidak diketahui / disimpulkan
- Klaim peningkatan Harness2 (sampai 11,5 poin) adalah klaim penulis pada benchmark mereka; tidak ada ukuran lokal Agent Core.
- Apakah memindahkan bagian kontrak ke pembacaan sesuai-kebutuhan menurunkan token tanpa menurunkan kepatuhan: **tidak diukur**.
- Apakah peringatan referensi-menggantung akan memicu positif palsu pada paket Skill yang ada: **tidak diuji**.

### Penjelasan pesaing dan pemalsu
- *Mungkin Agent Core tidak butuh satu pun hal ini* karena verifikasi oracle dan gate evidence sudah menutup risikonya. Pemalsu: bila
  tinjauan nyata tidak pernah menemukan atribusi keliru atau Skill dengan referensi rusak, usulan terkait digugurkan.
- *Mungkin penghematan token lebih besar dari tempat lain* (riwayat chat, hasil tool). Pemalsu: ukuran Fase 0 usulan P1 menunjukkan
  bagian always-on kecil dibanding total.

## 5. Yang sengaja tidak didonorkan
- Loop Propose-Probe-Compose pada tugas produksi (mengeksekusi ulang tugas dengan efek samping nyata, gate hanya struktural,
  biaya 4k rollout + 3k sesi per tugas). Bentuk aman, bila pernah: di laboratorium fixture ber-oracle yang sudah ada di proposal
  [Evidence-Gated-Harness-Self-Improvement-Lab](../history-agent-core/Evidence-Gated-Harness-Self-Improvement-Lab.md) (HG-6 / R6-D..F, HOLD).
- Seleksi buta tanpa abstain, adapter executor/benchmark, cache improver, default eksekusi tanpa sandbox, penguncian POSIX.
- Salinan kode atau prompt: Harness2 berlisensi Apache-2.0; ide diimplementasikan ulang dengan kata-kata sendiri. Adaptasi substansial
  memerlukan atribusi repositori+commit dan pelestarian NOTICE.

## 6. Keterbatasan
Matriks bobot memuat penilaianku. Cache, penjadwalan dan executor belum diverifikasi ulang selain lewat peta agen. Tidak ada tes
produk, benchmark atau build yang dijalankan.
