# REALM-Inspired Reconsolidation Experiment Implementation Plan

> **Status saat ini:** Implementasi source dipublikasikan pada `60e504f9bf1c876934146dfa7298f1a270e99a14` (`0.15.0-beta.3`). Hasil dan batasan ada di [ledger fungsional](../verification/memory12-21-source-functional-2026-10-11.md). Windows belum diuji/diaktifkan dan ditunda sampai pengguna kembali. Checklist serta rancangan antarmuka di bawah dipertahankan sebagai bukti perencanaan historis, bukan klaim semua acceptance PASS.
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Menguji secara offline apakah proposal hubungan berbasis outcome memperbaiki pengambilan bukti tanpa merusak hubungan yang benar.

**Architecture:** Tambahkan helper proposal murni pada lapisan evaluasi Learning dan jalankan di snapshot sintetis harness Plan05. Tidak ada hook retrieval produksi atau mutation otomatis. Jika hasil tidak mendukung manfaat, eksperimen berakhir tanpa rollout.

**Tech Stack:** TypeScript NodeNext, Node >=24.15.0, Vitest existing, helper evaluasi dan verifikasi existing.

**Spec:** [Spesifikasi adopsi](2026-10-11-memory-reference-adoption-spec.md), baris Plan19.

**Status awal saat perencanaan (historis):** PROPOSED / EXPERIMENT ONLY. Belum ada kode/test/hasil eksperimen. Baseline `957077fab260dd58d0cc7cfc0881172d05f84667`.

## Sumber, impact, dan batas

[REALM paper](https://arxiv.org/abs/2609.16053), 13 September 2026, mengusulkan perbaikan struktur graph sesudah retrieval. [Metode lengkap](https://arxiv.org/html/2609.16053v1) adalah referensi konseptual; repo resmi belum terverifikasi, jadi tidak ada klaim implementasi donor atau lisensi kode.

Impact yang dihipotesiskan: hubungan pengalaman yang relevan menjadi lebih mudah ditemukan dalam tugas berikutnya. Potensi negatif: feedback yang salah memperkuat asosiasi yang salah. Angka paper tidak menjadi target penerimaan Agent Core dan tidak dianggap bukti manfaatnya.

Agent Core sudah punya `SubProject/agent-core-memory/src/memory/evolution.ts:applyEvolutionProposal`, `intelligence.ts:MemoryEvolutionProposal` (maksimum 8 link related), retrieval ledger, serta `src/learning/retrieval-evaluation.ts`. Jangan menambahkan graph engine, schema memory, atau writer baru. Pembeda eksperimen ini adalah membandingkan proposal berbasis outcome terhadap baseline tanpa proposal pada corpus beku.

## Global Constraints

- Seluruh constraint spesifikasi bersama berlaku. Rencana ini tidak memasang fitur ke resident.
- Tidak mengubah `MemoryEvolutionProposal.provider` menjadi label yang menyamar sebagai evidence terverifikasi; tipe eksperimen terpisah dan tidak diterima facade produksi.
- Feedback harus berasal dari fixture oracle/verifier independen, bukan sekadar sering di-retrieve atau self-report model.
- Maksimum 32 node fixture, 8 edge proposal per kasus, hanya edge `related`; tidak mengubah fakta, supersedes, contradicts, pinned, grants, atau retention.
- Tidak mengambil model, embedding baru, dataset donor, atau benchmark besar. Hasil scripted tidak mengukur manfaat model nyata.

## Review Focus

1. Exposure tanpa outcome tidak boleh menghasilkan proposal (Task1).
2. Scope/revision drift menolak proposal (Task1).
3. Self-link/duplicate/target hilang/lebih dari 8 edge ditolak (Task1).
4. Oracle tidak tersedia kepada pembuat keputusan candidate; hasil recomputation terpisah (Task2).
5. Kenaikan recall dengan false associations lebih banyak tidak dianggap keberhasilan otomatis (Task2).

### Task 1: Kontrak proposal murni dan guard

**Files:**
- Create: `src/learning/reconsolidation-experiment.ts`
- Test: `tests/learning-reconsolidation-experiment.test.ts`
- Read/reuse: `src/learning/retrieval-evaluation.ts`, `src/learning/outcome-verifier.ts`

**Interfaces (baru, bukan API existing):**
- `ReconsolidationFixture`: `{scopeKey:string; corpusRevision:string; nodes:ReadonlyArray<{id:string; revision:string; scopeKey:string}>; outcomes:ReadonlyArray<{sourceId:string; targetId:string; scopeKey:string; verifiedUseful:boolean; verifierRevision:string}>}`.
- `RelatedEdgeProposal`: `{sourceId:string; targetId:string; type:'related'; sourceRevision:string; targetRevision:string; verifierRevision:string}`.
- `proposeFixtureRelations(input:ReconsolidationFixture):ReadonlyArray<RelatedEdgeProposal>`; penolakan memakai error eksperimen lokal, bukan error facade MCP.

- [ ] Tulis test `rejects_exposure_without_verified_outcome`, `rejects_stale_or_missing_node`, `rejects_self_duplicate_and_over_budget_edges`, `orders_equal_proposals_deterministically`; assertion hasil maksimal8, input tidak termutasi, identitas revision tetap exact.
- [ ] Jalankan `npm test -- tests/learning-reconsolidation-experiment.test.ts`; pastikan kegagalan awal berasal dari helper belum tersedia.
- [ ] Implementasikan filter deterministik atas outcome verifiedUseful=true, validasi seluruh input sebelum menghasilkan proposal; tidak mengakses filesystem atau model.
- [ ] Jalankan uji yang sama; semua assertion PASS. Stage hanya helper dan test, commit terarah sesudah review.

### Task 2: Perbandingan terisolasi dan keputusan go/no-go

**Files:**
- Create: `scripts/verify/memory-reconsolidation-experiment.mjs`
- Create: `tests/fixtures/memory-reconsolidation/suite.json`
- Test: `tests/learning-reconsolidation-report.test.ts`
- Reuse: `src/learning/retrieval-evaluation.ts`, `src/learning/retrieval-verifier.ts` dan pola sealing bundle Plan05.

**Interfaces (baru):**
- CLI `node scripts/verify/memory-reconsolidation-experiment.mjs --suite <fixture> --out <report-dir>` membaca fixture sintetis; menolak output dalam Memory produksi dan tidak membuka koneksi jaringan.
- Laporan `{mode:'scripted-offline'; baselineRevision:string; candidateRevision:string; preservationPassed:boolean; unsupportedEdges:number; retrievalResults:RetrievalEvaluationReport; decision:'reject'|'further-study'}`. `RetrievalEvaluationReport` diimpor dari `src/learning/retrieval-evaluation.ts`; hasil harus melewati verifier existing, bukan JSON yang bebas dianggap lulus.

- [ ] Tulis 8 kasus orisinal: positive supported association, irrelevant exposure, negative outcome, stale revision, foreign scope, duplicate, budget overflow, conflicting outcome. Pisahkan contoh yang memberi feedback dari pertanyaan held-out; oracle evaluasi tidak masuk input candidate.
- [ ] Tulis test tamper corpus/report/claim; `decision` harus reject jika preservation gagal, unsupportedEdges>0, atau bukti perbandingan tidak lengkap.
- [ ] Jalankan `npm test -- tests/learning-reconsolidation-experiment.test.ts tests/learning-reconsolidation-report.test.ts` untuk RED; implementasikan runner sebagai adapter evaluator existing, bukan evaluator kedua.
- [ ] Jalankan kembali untuk GREEN, kemudian `npm run build`. Bandingkan dengan baseline yang identik kecuali proposal eksperimen; laporkan hasil negatif juga.
- [ ] Hasil terbaik hanya `further-study`, tidak pernah `production-approved`. Rollout memerlukan rencana/adopsi terpisah berdasarkan hasil nyata.

## Kompatibilitas, rollback, versi, dan laporan

Tidak ada schema/runtime Memory atau konfigurasi produksi yang berubah. Rollback cukup membatalkan perubahan helper/fixture eksperimen yang terkait; tidak menghapus Memory. Penulisan rencana tidak mengubah versi produk. Saat helper dilaksanakan, catat penilaian versi: alat evaluasi internal tanpa kontrak runtime dapat tetap tanpa bump produk, selama hasil dan batasnya jelas.

Jika diuji di Windows, fetch commit yang benar-benar dipush, verifikasi source helper/fixture, jalankan dari checkout kanonis, simpan ZIP tersanitasi di `E:\Projects\Agent-Core-Reports`. Tidak perlu mengganti launcher atau restart resident untuk eksperimen offline ini. Dirty file tak terkait tidak menjadi blocker. Jangan membuat runtime alternatif atau backup proyek. Laporan berisi commit, fixture/oracle digest, hasil per kasus, keputusan dan keterbatasan; verifikasi ZIP setelah fresh extraction. Tidak ada label task completed untuk manfaat produksi.
