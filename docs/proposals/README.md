# Proposal Improvement — Review Pengguna

Folder ini menyimpan proposal improvement Agent Core sebagai file Markdown terpisah.
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
