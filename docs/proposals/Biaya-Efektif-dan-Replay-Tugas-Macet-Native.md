# Biaya Efektif dan Replay Tugas Macet Native
Tanggal: 2026-11-02 (Asia/Tomsk)
Revisi: 1
Status: PROPOSED
Jenis: Improvement
Asal dan bukti: R1 = repo `microsoft/TokenEconomizer` (klon `F:\Referensi\TokenEconomizer`, HEAD 85a8247; tipe repo plus makalah arXiv 2610.22732 yang hanya dibaca lewat README, PDF tidak dibuka; kredibilitas moderat untuk kode, lemah sampai sedang untuk klaim efek). R2 = metrik runtime Agent Core, `runtime/agent-runtime/state.json` (mtime 2026-11-02T03:52Z, 192 tugas), dihitung read-only dengan skrip sesi yang tidak disimpan di repo. Cakupan R1: `dibaca penuh 163 / dilihat sekilas 39 / tidak dibuka 16 dari 218 file` (14 saya baca langsung, sisanya subagen read-only sebagai petunjuk; setiap titik yang dipakai di sini saya buka ulang sendiri). Urutan baca: README dan dokumen desain, lalu file yang berpadanan dengan owner Agent Core (biaya, guard, caching, hook), lalu sisanya paralel. Tidak dibuka: 8 aset gambar/SVG/GIF dan generatornya di `docs/assets`, 3 JSON workload, 5 tes routing/fleet. Bacaan parsial `te_harness/swebench.py` dan `webbench.py` tidak dipakai untuk kesimpulan utama.

## Masalah dan tujuan

Tiga celah terbukti di source:

1. **Tidak ada satu definisi biaya.** Native mencatat token mentah per tugas (`src/agent-runtime.ts:1067-1069`) dan `costUsd` hanya bila provider melaporkannya (`src/agent-provider.ts:634`). Dokumen caching menegaskan estimasi harga bukan bukti tagihan (`docs/verification/anthropic-prompt-caching.md:61`). Setiap pernyataan "lebih murah" kini harus dihitung dengan skrip sekali pakai, seperti studi ini.
2. **Overhead tidak terlihat.** Panggilan model REM hanya mengambil `.content` dan membuang usage-nya (`src/index.ts:193-194`); `runtime.complete` cuma meneruskan ke provider (`agent-runtime.ts:710-718`). Referensi justru membebankan biaya mekanismenya sendiri ke arm yang diukur (`experiments/scripts/compare_arms.py:8-9,53-54`).
3. **Aturan "tugas macet" tidak bisa diuji sebelum dipakai.** Batas iterasi disetujui naik ke 60 (Goal mode 200) dan proposal itu mencatat batas tinggi menaikkan biaya tugas yang berputar (`docs/proposals/Batas-Iterasi-dan-Goal-Mode-Native.md:26,40`). Referensi punya mode `shadow` untuk mengukur sebelum percaya (`tokeneconomizer/plugin/config.py:26-28`); Agent Core belum.

Tujuan: definisi biaya efektif sadar-cache yang bisa direproduksi, lalu replay bayangan atas rekaman tugas sendiri. Perubahan perilaku hanya bila angka replay mendukung.

## Bukti dan ketidakpastian

**Diamati pada R2** (74 dari 192 tugas = 38,5% punya pemakaian cache teramati; bobot dari R1 `tokeneconomizer/pricing.py:101-106`: input 1,0; baca-cache 0,10; tulis-cache 1,25; output 5,0; total 43.028.541 token efektif, 1.343 panggilan model):
- Komposisi biaya: tulis-cache 39,0%, output 28,1%, baca-cache 23,6%, input segar 9,3%. Plafon teoretis bila semua tulis-cache dihargai sebagai baca: 35,9% (bukan harapan).
- Recall adaptif: 63 recall dalam 1.343 panggilan. Kelebihan tulis-cache pada tugas yang punya recall hanya 720.103 token (1,9% biaya), 15% dari perkiraan jika tiap recall menulis ulang prefiks rata-rata (12,7%). Hipotesis saya bahwa recall adaptif merusak prefiks cache (`agent-controller.ts:1138-1145` menimpa pesan sistem 1) **ditolak sebagian** oleh data ini, tertahan perancu panjang tugas.
- Konsentrasi: 8 tugas dengan ≥40 panggilan memegang 46,7% biaya; panggilan per tugas p50/p75/p90/maks = 14/25/45/96. Empat dari delapan berhenti di 61 panggilan berstatus `failed` (18,6% biaya; 61 = batas 60 plus satu panggilan laporan, `Batas-Iterasi-dan-Goal-Mode-Native.md:17,26`). Dua termahal (21,3% biaya) berstatus `verified` walau 10 dan 6 kali gagal. **Jumlah kegagalan tidak memisahkan tugas macet dari tugas produktif** pada sampel kecil ini. `verificationStatus` seluruhnya `unavailable`, jadi `verified` adalah label finalisasi Native, bukan verifikasi independen.
- Native sudah memuat tool on-demand, maksimal 8 tool tampil (`agent-controller.ts:1160-1194`), memblokir retry ekuivalen secara keras (`:1926-1937,2066`) dan meneruskan `FailureLoopAdvisor` ke runtime tool (`:978-979`; ambang di `src/mcp/failure-loop-advisor.ts:134-154`).

**Diamati pada R1** (lokasi dibuka sendiri):
- Biaya satu definisi: input + 0,10·baca + 1,25·tulis + 5·output, menolak id model tak dikenal, tabel harga bertanggal 2026-07-27 (`pricing.py:41-42,101-106,157-160,169-186`). Pembanding berpasangan per instance, overhead dibebankan, baris `usage_incomplete` dikeluarkan (`compare_arms.py:8-9,53-54,84-87`).
- Guard bertingkat: gerbang murah, hakim model, backstop 2,5× yang tak bisa di-veto (`loopguard/rules.py:20-43,109-179`), ambang dikalibrasi dari lintasan SWE-bench otonom (`:16-19`). Tanda-tangan kegagalan memakai baris pertama yang cocok `ERR_RE`; untuk Python itu baris "Traceback", sehingga pengecualian berbeda bisa tampak sama (`loopguard/state.py:20-28,120-134`).
- **Guard hampir tidak menyala di sweep penulis sendiri**: 0 kali di 498 baris opus-5/sonnet-5, 1 nudge dan 3 abort di 224 baris opus-4.8 (`experiments/scripts/sweep_plan.py:68-71`); profil Codex "bukan tuas biaya… efek biayanya sekitar nol" (`experiments/te_bench/codex_spiral.py:249-258`); varian yang diganti nama direplay sebagai 8 fire dalam 204 tugas, net −0,26% (`experiments/tests/test_sweep_arms.py:355-364`).
- Efek plugin tidak diwarisi dari eksperimen: redirect berbeda (menghentikan lalu melanjutkan vs pengingat di tengah turn) dan sinyal belajar berbeda (label grader vs "berakhir hijau") (`docs/PLUGIN.md:55,61`); efek nudge "belum terbukti" (`:571-576`); micro-skills "saved nothing" di repo kecil (`:470-473`).
- Satu panggilan hakim lewat `claude -p` tercatat ≈14 ribu token efektif setelah MCP dilucuti, ≈570 ribu sebelumnya (`plugin/sidecall.py:149-155`).
- Fakta micro-skills menyalin nilai `VAR=nilai` dari perintah ke konteks tanpa redaksi (`microskills/observe.py:507`, `envfacts.py:110-114`; pencarian redact/secret/credential di `microskills/` kosong).
- Kredibilitas angka headline: cocok internal dengan `ROWS` (rentang 18,4–30,9%; 4 dari 5; 30 sel), tetapi skripnya menyatakan "nothing here is computed from runs in this repository" (`docs/assets/results_overview.py:13-16,30-37`). Tidak ada s.d., interval kepercayaan, atau uji signifikansi di seluruh `*.py` (pencarian kosong; agregasi hanya mean/median, `compare_arms.py:103-112`). Selisih Pass@1 terbesar 2,6 poin setara ±7 tugas dari 277 (inferensi). README menyebut 277 tugas, sedangkan kode menyatakan hasil terpublikasi dijalankan pada 229 dan 277 adalah himpunan runnable untuk run mendatang (`experiments/te_bench/workloads.py:337-345,417-424`); belum terjelaskan. Seed: 0, 1, 2 (`experiments/README.md:98-99`) vs 5 (`sweep_plan.py:61`). Pembanding membuang pasangan `usage_incomplete` di kedua sisi (`compare_arms.py:84-87`); bila penyebabnya agen dihentikan guard atau timeout (`te_harness/swebench.py:1161-1167` menunjukkan penghentiannya, bukan bendera itu), ekor mahal tempat guard bertindak ikut hilang (inferensi). Set keamanan tidak dijalankan harness (`experiments/README.md:147-149`).

**Disimpulkan**: (a) biaya Native didominasi tulis-cache dan output, jadi leverage ada pada jumlah panggilan dan ukuran hasil tool, bukan prefiks recall; (b) aturan macet berbasis hitungan gagal berisiko salah-sasaran pada tugas mahal tetapi sukses; (c) bagian "kegagalan berulang" dari guard referensi sudah ada di Native, lebih ketat; (d) hasil ablasi tidak ada di repo (di-gitignore, `CLAUDE.md:39-43`), jadi sumber penghematan referensi tidak bisa diuraikan.

**Tidak diketahui**: biaya setelah titik "macet" yang bisa dihindari; apakah catatan redirect mengubah arah model; apakah cakupan 38,5% mewakili semua tugas; `failed` bukan sama dengan macet (23 dari 76 tugas `failed` tidak punya episode kegagalan).

**Catatan mind-control (T1).** Claim: ukur dulu (definisi biaya, replay bayangan), tahan guard. Observed: data di atas; `docs/instructions/reflexion.md:12,17` (advisory, tanpa gerbang atau loop retry otonom baru). Inferred: urutan episode `action` cukup sebagai proksi iterasi; biaya setelah firing sebanding jumlah panggilan. Rival: "guard tak berguna karena biaya didominasi output dan tulis-cache"; pembeda: biaya-setelah-firing pada tugas `failed` dalam replay. Test: V2 (diusulkan). Flip: bila aturan terbaik menyentuh >1 dari 10 tugas `verified`, atau biaya-setelah-firing <3% biaya efektif, hentikan V3. Keyakinan: sedang untuk V1/V2, lemah untuk V3.

**Ledger lensa** (satu baris per lensa yang menemukan sesuatu)

| Lensa | Temuan | Efek |
|---|---|---|
| Semantic | Tiga mekanisme; biaya tunggal sadar-cache; guard gerbang→hakim→backstop | Sumber V1 dan V3 |
| Procedural | Replay rekaman menghitung salah-prune (`PLUGIN.md:416-430,498-500`); perbandingan berpasangan; `shadow`; verifikasi prefiks dengan API palsu (`:373-377`) | Metode yang dipindah (V1, V2, V4) |
| Negative | Guard ≈ nol di sweep penulis; Traceback sama; fakta menyalin nilai env; hakim mahal | Menahan V3; micro-skills ditolak |
| Strategy | p90 bukan maks; backstop tanpa veto; tak pernah menghentikan turn; micro-skills mati bawaan (`PLUGIN.md:64`) | Batas desain V3 |
| Credibility | Kode terbaca baik; headline = klaim makalah; tanpa s.d./CI; 277 vs 229 | Klaim efek hanya petunjuk |
| Freshness | Harga 2026-07-27; eksperimen Claude Code 2.1.170 (`experiments/README.md:26`) vs plugin 2.1.286–2.1.310 | Bobot harus bertanggal dan dicek ke dokumentasi resmi |
| Absence | Tak ada pembanding hasil setelah redirect; pruning diukur dalam jumlah tool, bukan token (`PLUGIN.md:305-306,424-428`) | V2 mendahului V3 |
| Medium | Gambar kerangka dilihat dan sesuai README; PDF makalah dan `teaser.gif` tidak dibuka | Ketidakpastian dicatat |
| Environment fit | Windows, satu pengguna, Native in-process: hook plus proses Python per event, launcher `sh`, hakim lewat CLI tidak cocok (`plugin/scripts/te-hook:1-28`) | Hook dan hakim ditolak |
| Cost/reversibility | V1/V2 murni baca; V3 satu catatan bersaklar; pruning menulis settings host | Hanya V3 berisiko |
| Triangulation | Batas-iterasi, Reflexion, PC-1 (Cortex 2026-10-30), data 74 tugas | Mengarah ke ukur-dulu |
| Transfer | sesi→tugas/episode; ledger→metrik tugas; envelope→p90 aksi tugas selesai; deny-list→tanpa padanan | Peta di bawah |
| Intent | Aturan pemilik: tanpa benchmark kecepatan, tanpa gerbang baru, proposal bukan izin | Verifikasi hanya kebenaran dan hitungan token |
| Bebas: kejujuran instrumen | Repo mengungkap hasil negatifnya sendiri tetapi tak punya pembanding efek guard | Pinjam sikapnya (bayangan dulu), bukan klaimnya |

**Peta dukungan.** V1: didukung Semantic, Procedural, Triangulation, Environment fit; dibatasi Freshness dan Cost. V2: didukung Procedural, Triangulation, Intent; dibatasi Negative (proksi episode, `failed`≠macet). V3: hanya Semantic dan Strategy mendukung, dilawan Negative, Credibility, Cost dan bukti penulis sendiri (guard ≈ nol): **single-lens, di luar rekomendasi**. V4: didukung Procedural; plafon lokal 1,9%.

**Profil nilai referensi.** Peran: donor metode (biaya tunggal, pembanding berpasangan, replay/shadow, verifikasi prefiks) dan cautionary (klaim efek, keamanan fakta, hook di Windows). Kredibilitas: moderat untuk kode, lemah sampai sedang untuk klaim efek. Nilai terbesar: lensa Procedural dan Negative. Bawa berikutnya: PDF makalah (Tabel 1–2 dan ablasi), data per-sel dari penulis, dan penjelasan 277 vs 229.

## Mekanisme dan owner existing yang dipakai

- **V1. Biaya efektif tunggal.** Satu fungsi murni di owner metrik (`src/agent-runtime.ts`), bukan store atau daemon baru: `fresh·1,0 + baca·0,10 + tulis·1,25 + output·5,0` dengan `fresh = inputTokens − baca − tulis`. Flag `*ObservedCalls` yang sudah ada menandai data tak lengkap `parsial` (padanan `usage_incomplete`). Id model tak dikenal menghasilkan `tidak-berharga`, bukan galat. Tabel bobot bertanggal dan diverifikasi ke dokumentasi harga resmi, bukan disalin dari R1. Overhead non-tugas (REM) dicatat di kunci terpisah.
- **V2. Replay bayangan.** Skrip baca-saja di `scripts/inspect/` (rumah ukur yang sudah ada) yang membaca `state.json` tanpa menulis. Menilai aturan kandidat atas rekaman: (R1) family-gagal berulang ala `FailureLoopAdvisor`; (R2) panjang tugas melewati p90×1,25 aksi tugas selesai per workspace, minimal 5 sampel (`rules.py:20-43`); (R3) churn edit per berkas bila tersedia. Keluaran: berapa tugas terkena, berapa berstatus `verified` (salah-sasaran), biaya-setelah-firing pada tugas `failed`.
- **V3. Redirect aman-prefiks (ditahan).** Satu catatan advisory di hasil tool, sekali per turn, terlihat pengguna, tidak menghentikan turn, aturan dulu tanpa hakim, log-saja (bayangan) lebih dulu. Mengikuti `reflexion.md:12,17`. Owner: `agent-controller.ts` bersama advisor yang ada.
- **V4. Invarian prefiks (opsional).** Satu tes memakai fixture `controllerFixture` (`tests/agent-cumulative-learning.test.ts:138-174`) yang membandingkan pesan 0 dan daftar tool antar request, serta menetapkan recall adaptif sebagai satu-satunya mutasi prefiks yang disengaja.

Tidak diadopsi: **micro-skills** (bocor rahasia, teks tanpa lint, manfaat tak terbukti; Learning dan Reflexion sudah punya jalur lebih aman); **tool pruning** (Native sudah on-demand; manifest MCP sudah dianggarkan tes `tests/mcp-manifest-contract.test.ts:113-135`); **hook, proses Python per event, hakim lewat CLI**.

## Scope, batas Native, risiko dan otorisasi

Rekomendasi: **V1 + V2 lebih dulu**, tanpa perubahan perilaku Native. V3 hanya setelah angka V2 dan persetujuan tersendiri. V4 opsional.

Risiko: bobot harga menua (bertanggal, dicek per revisi, bukan tagihan); proksi iterasi dari episode kasar (dicatat di keluaran); `failed` bukan macet (dilaporkan terpisah); V3 dapat bertabrakan dengan `STRATEGY_REQUIRED` dan retry-blok yang sudah ada. Tidak mencakup provider/model, `.env`, migrasi storage, commit/push/release, atau gerbang baru.

## Manfaat yang diharapkan dan keterbatasan

Harapan, belum terukur: pernyataan biaya yang bisa direproduksi dan keputusan guard berbasis angka sendiri. Keterbatasan: cakupan 38,5%; bobot adalah konvensi akuntansi; perancu panjang tugas.

## Acceptance, evaluasi dan rollback

- V1: tes unit masukan tetap (fresh 1.000, baca 10.000, tulis 2.000, output 500 → 7.000); label `parsial` bila cakupan pemakaian kurang; model tak dikenal tidak melempar; overhead REM terpisah; pada `state.json` nyata fungsi mereproduksi total studi ini (43.028.541 pada 74 tugas).
- V2: fixture sintetis tiga tugas dengan posisi firing yang diketahui; cek tangan atas tiga tugas nyata; tidak ada penulisan ke state. Tanpa benchmark kecepatan.
- V3 (bila kelak disetujui): satu catatan setelah hasil tool, pesan 0 byte-identik, tak ada catatan kedua, turn tidak berhenti, saklar bayangan mencatat tanpa catatan.
- Rollback: hapus fungsi dan skrip; V3 lewat saklar.

## Riwayat revisi

- Revisi 1 (2026-11-02): dokumen pertama, hasil studi R1.

## Keputusan pengguna dan scope

Belum ada keputusan; menunggu APPROVE / REVISE / HOLD / REJECT.
