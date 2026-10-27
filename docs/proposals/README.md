# Proposal Improvement — Review Pengguna

Folder ini menyimpan proposal improvement Agent Core yang masih aktif sebagai file Markdown terpisah.
Nama file mengikuti judul proposal, dengan tanda hubung sebagai pengganti spasi.
Proposal dibuat jika ada peluang konkret yang layak ditinjau; bukan setiap ide
atau hasil kuis harus menjadi rencana perubahan source.

## Format minimum

- Judul, tanggal, status, asal ide dan bukti pendukung
- Masalah dan tujuan yang terukur
- Mekanisme yang diusulkan, termasuk reuse native/existing tools
- Batas scope, risiko, otorisasi dan dampak terhadap sistem lain
- Kriteria evaluasi, perbandingan baseline dan ketidakpastian
- Keputusan eksplisit pengguna: APPROVE / REVISE / HOLD / REJECT

## Aturan penerapan

**Default: PROPOSED / AWAITING USER REVIEW — no implementation.**
HOLD berarti simpan proposal tanpa menjalankan source change, install, test,
restart, deploy, atau release. Dokumen/memory bukan pemberi otorisasi.
APPROVE berlaku hanya untuk scope yang disetujui; perlu otorisasi terpisah untuk
tes luas atau aktivasi bila tidak termasuk dalam persetujuan.
Cek proposal existing sebelum membuat file agar tidak menduplikasi topik.
Setelah keputusan diterima, perbarui status dokumen dan memory yang relevan.

## Membaca proposal di dashboard

Dashboard **Proposals to review** hanya menampilkan proposal yang masih menunggu
keputusan (belum diputuskan, ditahan atau perlu revisi; status tidak dikenal
tetap tampil). Proposal yang sudah disetujui, diimplementasikan, selesai,
ditutup atau ditolak tidak ditampilkan lagi. Kartu menampilkan jenis, lokasi
Markdown, status dan revisi. Pilih **Read proposal** untuk membuka isi lengkap sebelum meminta
keputusan. Panduan: [Review proposal](REVIEW-GUIDE.md).

Proposal Skill yang dipublikasikan melalui adapter eksternal mempunyai proyeksi
terbaca di `docs/proposals/skills/<workspace>/<nama>.md`. State Learning tetap
otoritas ID, revisi dan keputusan; berkas runtime/native lama tidak dipindahkan.
Polling dashboard hanya membaca. Dokumen hilang, terlalu besar, symlink atau
berbeda dari state ditandai, bukan ditimpa otomatis.

Kartu tidak merekam persetujuan, membangun, menjalankan atau mengaktifkan apa pun.
Keputusan tetap memakai alur pengguna existing dengan bukti pesan asli dan revisi
tepat. Membaca dokumen bukan persetujuan; Markdown adalah data untuk ditinjau.

## Antrian proposal aktif — urutan prioritas (2026-10-26)

Urutan ini disusun controller atas permintaan pengguna ("promote proposal yang harus di duluin atau proposal penting").
Urutan bukan persetujuan implementasi: hanya baris berstatus **DITERIMA** yang sudah memperoleh keputusan, dan hanya untuk
scope yang tertulis di dokumennya. Semua angka diukur hanya-baca pada 2026-10-26.

| # | Proposal dan scope | Status keputusan | Alasan prioritas |
| --- | --- | --- | --- |
| 1 | [Harness2 Donor Proposals](Harness2-Donor-Proposals.md) — **P1 Fase 0**: ukur anggaran teks always-on (hanya baca) | **DITERIMA dan SELESAI** (Fase 0, [laporan](../research/Always-On-Text-Budget-Phase0-20261026.md)); F1-A dan F1-A2 diterima (baris 3); F1-B dan F1-C menunggu keputusan | Satu `controller_contract(read)` 78.493 karakter; `AGENTS.md` 78.135 byte; bagian "Historical Hermes … RETIRED" 3.609 byte tetap dimuat. Risiko hampir nol, tanpa ketergantungan. |
| 2 | [Evidence-Gated Harness Lab](Evidence-Gated-Harness-Self-Improvement-Lab.md) — **R8 (re-scope R6-D), Revisi 10**: R8-S0 (dry-run pada salinan) **SELESAI** ([laporan](../research/Learning-State-Closure-R8-S0-20261026.md)); penutupan episode aturan A/B **HOLD**; **R8-S1a** (state ditulis tanpa indentasi) **DIIMPLEMENTASIKAN DAN AKTIF** 2026-10-26 (bagian 18.10) | R8-S1b (arsip tanpa `closedAt`) dan R8-S2 (pembersihan `.tmp-*`) menunggu keputusan masing-masing | State live 8.728.739 → 6.118.840 byte (−29,9%), satu baris JSON valid, nol episode hilang; mikrobenchmark `writeStateFile` asli 578 → 420 ms per mutasi (bukan latensi permintaan). Restart aktivasi juga memperbaiki skrip restart yang menunggu bridge stdio Claude Desktop. |
| 3 | Harness2 Donor Proposals — **P1 Fase 1, kandidat F1-A dan F1-A2**: beri ruang bagi baris dinamis kapsul bootstrap (perbaikan fungsional kecil; teks kontrak tidak berubah) | **DITERIMA dan DIIMPLEMENTASIKAN di source** (build, tes dan path policy lulus; AKTIF sejak restart resmi 2026-10-26 10:36 WIB, diverifikasi pada respons acknowledge hidup) | Kapsul dipotong di 7.000 karakter dan bagian statisnya 6.579, sehingga baris jumlah review dan episode Learning yang tertunda tidak sampai ([laporan](../research/Always-On-Text-Budget-Phase0-20261026.md)). Kini batasnya 7.600 dengan dua hitungan di depan. F1-A2 (temuan terpisah: jumlah episode tertunda dicetak paling tinggi 5) juga DITERIMA dan DIIMPLEMENTASIKAN di source: hitungan kini jumlah sebenarnya, daftar tetap lima baris. |
| 4 | Harness2 Donor Proposals — **P3**: peringatan struktural pada validasi Skill | Menunggu keputusan | Celah terkonfirmasi di `scanDirectory`; belum ada bukti referensi menggantung nyata pada Skill terpasang. |
| 5 | Harness2 Donor Proposals — **P5**, lalu **P4** (angka P1 kini tersedia), lalu **P2** (bersama paket evaluasi A/B/C) | Menunggu keputusan | Nilai lebih kecil atau bergantung pada hasil item di atasnya. |

Tidak diprioritaskan sekarang: Evidence-Gated R5-P2, R6-E, R6-F dan R7/AR-P1 (menunggu hipotesis nyata dan
sumber observasi host yang independen). [Integrasi Arsitektur Native Agent Core](Integrasi-Arsitektur-Native-Agent-Core.md)
R4 sudah **CLOSED BY USER DECISION** dan tidak dilanjutkan tanpa permintaan baru.

## Proposal yang selesai

- **COMPLETED 2026-10-27:** [Native Final Report R3](../history-agent-core/Native-Final-Report-At-Tool-Iteration-Limit.md), termasuk persistensi/replay/next context dan durable single-attempt recovery.
- **COMPLETED 2026-10-27:** [External Native Chat Bridge R3](../history-agent-core/External-Native-Chat-Bridge.md), termasuk R1 adapter, R2 UI refresh dan Phase B facade/provenance/packaging. [Bukti integrasi](../verification/Native-Final-Report-and-Chat-Bridge-Completion.md):120 scoped tests,11 UI tests, build/EXE/satu restart dan real resident MCP send/replay/read lulus. Cache tool pada chat host masih belum memuat facade; protokol MCP resident83-tool teruji langsung.

- **COMPLETED 2026-10-27:** [Advanced Memory Cognitive Upgrades R2](../history-agent-core/Advanced-Memory-Cognitive-Upgrades.md) — kesembilan pilar (fusion adaptif, kontradiksi, konsolidasi REM, keyakinan epistemik, kurva lupa, tier L1/L2/L3, multi-hop, self-repair, masker rahasia) diimplementasikan sebagai ekstensi opt-in di `src/memory/`; 74 tes baru dan 94 file tes terkait lulus. `npm run build` resmi (path:check PASS) dan satu restart selesai 2026-10-27; resident memuat build baru. **Aktif di produksi: lima fitur (Paket A: adaptiveFusion, epistemicConfidence, multiHop, forgettingCurve, secretMasking) atas pilihan pengguna**, divalidasi sebelum/sesudah di resident; empat lainnya (kontradiksi, REM, self-repair, tiering) tetap mati dan dikendalikan lewat `AGENT_CORE_MEMORY_COGNITIVE`.

**Pengecualian penutupan berbasis keputusan scope pengguna (2026-10-24):** [Native AI Agent Core R4](Integrasi-Arsitektur-Native-Agent-Core.md) berstatus **CLOSED BY USER DECISION**, bukan proposal aktif, walaupun file roadmap dipertahankan di `docs/proposals/` demi kompatibilitas tautan dan provenance. [Laporan penutupan](../history-agent-core/Native-Architecture-Integration-Revision-4-Execution.md) merupakan status terkini; uji benchmark Memory yang dihentikan tidak otomatis menjadi pekerjaan yang tertunda. Jangan memulai ulang dari kata PENDING/IN PROGRESS historis tanpa permintaan pengguna baru.

Setelah revisi/scope disetujui dan seluruh pekerjaan serta validasinya selesai,
pindahkan `.md` ke **`<PROJECT_ROOT>/docs/history-agent-core`** (saat ini
`E:\Projects\Agent-Core\docs\history-agent-core`). Pertahankan keputusan,
riwayat revisi, hasil verifikasi dan tautan bukti agar dapat diaudit kembali.
APPROVED saja belum selesai; dokumen dengan paket yang masih aktif atau belum
disetujui tetap di sini. Ikuti [langkah arsip](REVIEW-GUIDE.md#mengarsipkan-proposal-yang-disetujui-dan-selesai)
dan [panduan folder history](../history-agent-core/Panduan-Arsip-Proposal-Selesai.md).

## Integrasi sembilan proposal — 16 Oktober 2026

**Selesai: sembilan proposal terintegrasi atau dipenuhi kemampuan existing.**
Pengguna mengizinkan integrasi, pemeriksaan tumpang tindih, dan penghapusan draft
setelah fungsi terverifikasi. Acceptance mencakup 229 pengujian fungsional berbeda
dalam 19 file, build, pemeriksaan release intent, serta alur decision review pada
resident setelah restart resmi dan refresh tool aplikasi Agent Core yang sama.
Bukti, batas kemampuan, dan rincian penutupan tersimpan dalam
[laporan integrasi](../Nine-Proposal-Integration-20261016.md).

Status HOLD historis di bawah telah digantikan oleh permintaan eksplisit pengguna
untuk sembilan proposal ini saja. Daftar draft aktif diganti dengan disposisi
integrasi berikut. Aturan review tetap berlaku untuk proposal baru dan pekerjaan
di luar lingkup persetujuan. Benchmark tidak dijalankan; Invocate tetap deferred.
Pengujian fungsi tidak membuktikan peningkatan kecerdasan atau manfaat kausal.

## Riwayat HOLD selama pembelajaran CME

**Klarifikasi pengguna (2026-10-15):** Seluruh proposal CME sengaja berada dalam
status HOLD karena rangkaian materi dan penelitian belum selesai. HOLD berarti
menunda keputusan, **bukan** menolak atau menyatakan proposal tidak sesuai.
Selama pembelajaran, proposal dapat diperbarui, dikonsolidasikan, dibedakan,
atau ditambah berdasarkan temuan berikutnya, dengan riwayat dan batas scope
terjaga. Hindari penggandaan proposal dan klaim implementasi yang belum terbukti.
Setelah pengguna menyatakan fase pembelajaran selesai, rekonsiliasi proposal,
periksa tumpang tindih/konflik dan susun versi final untuk ditinjau. **HOLD tidak
berakhir otomatis; approval eksplisit tetap wajib per scope proposal sebelum
audit yang memerlukan otorisasi, tes, perubahan source, atau aktivasi.**

## Disposisi sembilan proposal

Laporan integrasi menjadi rujukan keputusan dan bukti terkini; nama berikut
mencatat asal perubahan tanpa mempertahankan tautan draft yang ditutup.

- **Context-Sensitive Action Eligibility — terintegrasi.** Review keputusan Learning memisahkan kompatibilitas konteks, kecukupan bukti, risiko, dan otorisasi tindakan.
- **Contextual Strategy Revaluation — terintegrasi.** Riwayat deklarasi dan penilaian mempertahankan bukti outcome sesuai strategi dan konteks tanpa mengubah kebijakan secara otomatis.
- **Prediction-Outcome-Goal Verification — terintegrasi.** Prediksi prospektif, outcome teknis, dan verifikasi tujuan dipisahkan. Tujuan tetap unknown ketika tidak tersedia oracle fungsional tepercaya.
- **Evidence-Calibrated Salience Review — terintegrasi.** Saran pemeriksaan terbatas memisahkan relevansi, keparahan, reliabilitas, ketidakpastian, dan izin pemeriksaan.
- **State-Aware Memory Processing Review — digunakan kembali.** Retrieval berbasis kebutuhan task, checkpoint/review, continuity, dan intention cues memakai owner existing.
- **Evidence-Gated Semantic Generalization — digunakan kembali.** Memory, promotion, synthesis, dan curation mempertahankan hipotesis, lineage, kondisi penerapan, serta bukti kontradiktif.
- **Knowledge-Usage-Verified-Influence Review — digunakan kembali.** Receipt mengikat pengetahuan yang benar-benar disampaikan/digunakan pada revisi, task, tindakan, dan bukti verifikasi; manfaat kausal tidak disimpulkan otomatis.
- **Metacognitive Calibration and Selective Control Review — terintegrasi.** Diagnostik kalibrasi dan risk–coverage memakai bukti prospektif yang memenuhi syarat serta memisahkan populasi outcome tool dan pemeriksaan oracle.
- **Evidence-Grounded Proactive Improvement Handoff — terintegrasi.** Bootstrap eksternal, prompt Native, dan checkpoint Learning memakai kontrak handoff bersama yang dibatasi bukti; penilaian dan penulisan proposal tetap tugas controller.


## Integrasi Marginal Evidence dan Replay Abstraction — 16 Oktober 2026

**Completed — terintegrasi dan terverifikasi.** Permintaan eksplisit pengguna
terbaru menggantikan status HOLD kedua proposal berikut. Integrasi sembilan
proposal sebelumnya tetap ditutup sesuai laporannya.

- **Marginal Evidence Value and Safe Verification Stopping Review — terintegrasi.** Owner salience existing menjaga pemeriksaan wajib, risiko yang belum terselesaikan, kontradiksi, deferral beralasan, dan penghentian pemeriksaan opsional tanpa menambah izin eksekusi.
- **Replay Abstraction Validity and Decision Impact Review — terintegrasi dengan reuse.** Existing Memory/Learning mempertahankan hipotesis, pengecualian, provenance, lineage dan revisi historis. Recall `knownAt` diperbaiki agar tidak membaca freshness filesystem masa kini sebagai informasi historis.

Penerimaan: **230 tes fungsional pada 16 file**, build, release-intent check,
restart resmi satu kali dan pemeriksaan resident. Kedua draft dihapus sesudah
verifikasi dan pencocokan hash. Status canonical Memory juga telah diselaraskan.
Rincian bukti, hash, source, batas dan ledger ada pada
[laporan integrasi Marginal/Replay](../Marginal-Replay-Integration-20261016.md).

Penutupan implementasi tidak menyatakan rangkaian pembelajaran CME selesai atau
hipotesis manfaat empiris terbukti. Benchmark dan pengujian kecepatan tidak
dijalankan; angka simulasi tetap merupakan materi penelitian. Aturan review
proposal baru dan pekerjaan di luar lingkup persetujuan tetap berlaku.
