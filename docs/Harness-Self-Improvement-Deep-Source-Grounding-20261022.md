# Harness Self-Improvement — Pendalaman Bukti Primer
Tanggal: 2026-10-22
Status: RESEARCH COMPLETE FOR SELECTED SOURCES — NO IMPLEMENTATION
Konteks: revisi 2 proposal Evidence-Gated-Harness-Self-Improvement-Lab.md
Target: External AI Agent Core; Native AI Agent Core tersedia untuk pengembangan dan operasi sejak keputusan pengguna 2026-10-24
Metode: sumber primer artikel + source code publik terpilih + source lokal owner Agent Core (read-only)

## A. Validasi objek studi dan tingkat buktinya
Repository katalog: https://github.com/leezythu/Awesome-Harness-Self-Improvement
Local checkout: F:\Workflow\Awesome-Harness-Self-Improvement
Pinned HEAD (sebelumnya diverifikasi): 928f63f931bb4899b1fc3708ed697d5bc1209e59
Tracked content hanya .gitignore, LICENSE, README.md, README_zh.md, assets/banner.jpg.
Kesimpulan: katalog ini bukan runtime/optimizer yang bisa ditransplant. Paper dan repo code di bawah perlu dinilai terpisah; lisensi MIT katalog tidak otomatis melisensikan source downstream.

## B. Source 1 — Self-Harness: diagnosis, proposal, acceptance, lifecycle
Paper: https://arxiv.org/abs/2606.09498
Source: https://github.com/qzzqzzb/Self-Harness
File dibaca melalui GitHub fetch_file, dengan blob SHA:
- diagnosis/src/self_harness_diagnosis/integrated.py — a3034bc66f003f68eef44f5d8e112db58e63dcd4
- proposer/src/self_harness_proposer/multi_proposer.py — 3879823ad59d2a5803d44a3f58ac850d144e3625
- proposer/src/self_harness_proposer/materialize.py — 52550d219beeea19bf11ea24455a5ec5318ef36d
- acceptance/scripts/run_acceptance_gate.py — 7c94d5914faaa7702cd78ebe13aad2c8fe29f23f
- workflow/scripts/run_self_harness_loop.py — 0eba96d71bf227563664079b8344c997a56d69a4
**KOREKSI BERDASARKAN NASKAH ARXIV RESMI — 2026-10-22:** Halaman arxiv.org/abs/2606.09498 menampilkan ringkasan abstrak TB2 dengan tiga model, tetapi **teks lengkap HTML pada halaman resmi yang sama**, §1, §3–§4, juga menyatakan eksperimen SWE-bench Verified dan AppWorld dengan 9 kombinasi model-benchmark dan kenaikan held-in/held-out menurut penulis. Jadi pernyataan sebelumnya bahwa 9/9 hanya muncul pada mirror adalah keliru. Catat mismatch antara header abstract dan full HTML, bukan menolak full text primer; angka paper tetap tidak membuktikan transfer ke Agent Core. Verifikasi: https://arxiv.org/abs/2606.09498 (full HTML, intro lines 23–43 pada reader).
- Integrated diagnosis mengelompokkan failure melalui tuple `terminal_cause, criticality, agent_mechanism`, lalu mengurutkan cluster. **Label triple berasal dari diagnosis LLM**, sementara pengelompokan tuple bersifat deterministik. Ini perbedaan penting: deterministic grouping bukan bukti causal diagnosis.
- Di source, reviewer diberi passing cases yang harus dipertahankan dan anjuran no-op bila tiada mekanisme aman. Hindari memperlakukan satu outcome timeout/missing artifact sebagai penyebab universal.
- Multi-proposer memaksa distinct route, `mechanism_family`, `exact_hook`, candidate value tunggal, negative/protected passing cases dan bukti mengapa bukan no-op. Proposed surface tidak arbitrary shell/script injection.
- Materializer menyimpan candidate_variant.json, manifest.json, proposal.json/proposal.md dan surface files, memisahkan candidate dari active. Manifest source tersebut bukan otomatis immutable signed authority; Agent Core memerlukan artifact digest dan staging boundary sendiri.
- Acceptance gate membandingkan average pass_rate pada `train` dan `heldout`, default 2 repeats; accept jika minimal satu split membaik dan tidak ada split turun; validasi repeat IDs dan denominator. Input hasil tetap diberikan sebagai JSON — verifier/oracle independen di Agent Core harus diperiksa, bukan menerima accepted boolean dari script pihak ketiga.
- Workflow memakai candidate queue dan branch_state file untuk melanjutkan evaluasi per kandidat; manfaatnya lineage/resume. Agent Core already owns Learning/proposal/evaluation state; tidak membuat queue owner kedua tanpa gap nyata.
- Paper acceptance uses held-out during candidate promotion repeatedly; untuk klaim final yang lebih kuat, siapkan **validation gate** iteratif plus set *final lockbox* yang belum pernah dilihat sampai selection dibekukan. Ini rekomendasi desain, bukan klaim requirement dari paper.

## C. Source 2 — ACE: delta contextual playbook, batas transfer
Paper HTML: https://arxiv.org/html/2510.04618 (v3 2026-03-29)
Official implementation: https://github.com/ace-agent/ace
Inspected blobs:
- ace/core/curator.py — fcadcfbce1c9190bda7caa24d8250baa93902320
- ace/core/bulletpoint_analyzer.py — 1cd88b4b4647c85c5edfad16edef464421328426
- Curator mengusulkan operasi ADD/UPDATE/MERGE/DELETE berdasarkan refleksi; mengaplikasikan operasi ke playbook.
- Analyzer mengelompokkan bullets, memakai identifier helpful/harmful dan similarity embeddings; dependency sentence_transformers/faiss optional.
- Papernya menguji bahaya monolithic context rewriting (brevity bias dan collapse); pendekatan grow-and-refine menjaga detail melalui delta lokal, dedup dan metadata.
Agent Core sudah punya canonical Memory revisions/transaction, curators proposal-only, context retriever dan prosedur. **Jangan membawa operasi auto-DELETE/auto-MERGE ACE langsung**; curasi di Agent Core perlu review current authority/explicit user decision. Transfer nilai yang paling kecil: comparative evidence untuk kandidat *context delta* vs baseline, dengan knowledge retention dan contradiction controls. Tidak menambah FAISS/Chroma/LLM curator baru.

## D. Source 3 — GEPA: candidate selection per-instance, bukan scalar tunggal
Paper: https://arxiv.org/abs/2507.19457
Code: https://github.com/gepa-ai/gepa
Inspected: src/gepa/strategies/candidate_selector.py — b983ea02cdf1d393583fcd893137a08e11145505
`ParetoCandidateSelector` memilih kandidat dari Pareto mapping; `CurrentBest` dan epsilon-greedy tersedia sebagai alternatif. README/API mengungkap candidate pool, trace-aware reflection, valset dan mini-batch selection.
Transfer ke Agent Core: ketika ada >=2 candidate dengan hasil per-case terverifikasi, jangan hanya pilih berdasarkan rata-rata. Simpan spesialisasi kasus, regression, cost dan risk, sebagai advisory selection. Saat hanya satu candidate atau evidence sparse, Pareto optimizer tidak diperlukan.
Batas: kandidat yang menang di valset bukan bukti transfer; official API memungkinkan valset tidak ada (reuse trainset), yang tidak cocok untuk final claim independen.

## E. Source 4 — Meta-Harness: full artifact history dan finalization boundary
Paper: https://arxiv.org/html/2603.28052
Code: https://github.com/stanford-iris-lab/meta-harness
Inspected: reference_examples/text_classification/meta_harness.py — ad676c1f49d122e91de1234d58080453c4a911b2
- Menjaga frontier_val.json, evolution_summary.jsonl, result dirs dan finalized.json. Proposer mendapat path riwayat dan menginspeksinya on demand.
- README reference experiment menerangkan evolution memakai validation set; explicit `--test` hanya setelah finalization, yang memblok iterasi lanjutan di run tersebut.
- README juga mengakui test data dalam public repository, jadi itu **operational separation**, bukan secret true holdout.
- Meta-Harness reported code release belum extensively tested beyond runnable sanity; jangan asumsikan drop-in production stability.
Transfer: satu bounded **candidate lineage dossier** dengan pointer/digest ke artifact/proposal/evaluation existing untuk audit, bukan raw trace dump atau second event database. Gunakan finalization/read-only seal plus fresh final confirmation dataset untuk avoid selection bias.

## F. Source 5 — Misevolution: apa yang tidak boleh dilupakan
Paper abstract: https://arxiv.org/abs/2509.26354
Code listing: https://github.com/ShaoShuai0605/Misevolution (tidak diaudit source secara mendalam pada putaran ini).
Abstract menyebut risiko pada model, memory, tool, workflow: memory accumulation dapat merusak alignment, tool creation/reuse memperkenalkan vulnerabilities. Ini risiko yang dipelajari penulis, **bukan temuan bug Agent Core**.
Guard: evaluator dan izin outside optimizer; protected runtime authority; no auto-edit or auth policy rewrite; explicit non-regressive negative controls; keep failed trials; detect regression before activation.

## G. Perbandingan dengan source Agent Core yang benar-benar dibaca
- src/learning/external-evaluation.ts: strict baseline/candidate manifests, observed context, complete attempted opportunities, classified outcomes, nullable cost/time, explicit `benefitVerdict:'withheld'`. Tidak boleh mengubah ini menjadi klaim manfaat tanpa proof.
- src/learning/evaluation.ts: structured evaluated evidence + `inputsDigest`, verifier/evaluator revision, observed-at checks dan fail conditions.
- src/learning/feature-outcome-pool.ts: grouping by featureId/polarity, support counter; **bukan** cluster tiga bagian `terminal cause/criticality/agent mechanism`.
- src/learning/decision-evidence.ts: candidate fingerprint dan correction references. Ini source untuk lineage/reference, bukan penilaian causal root.
- src/learning/improvement-handoff.ts + external-improvements.ts: satu proposal evidence-driven dengan approval/revision boundary; existing user decision workflow.
- scripts/verify/cumulative-workflow-eval.mjs: frozen/paired fixture, baseline vs reuse dengan oracle, tetapi tidak langsung full harness candidate search.
Gap yang disarankan bukan “Agent Core tidak mampu self-learn”; gap yang perlu diuji adalah **typed failure-mechanism bridge** dan **replayable external candidate artifact** yang menyambungkan owner existing sambil menjaga oracle final independen. Ini hipotesis implementasi yang memerlukan audit/test scope terpisah.

## H. Matriks keputusan dan penyangkal
| Mechanism | New value | Existing owner | Decision |
| --- | --- | --- | --- |
| Causal failure signature | Menekan grouping gejala dangkal | Tracker, verification, external Learning | PROPOSE pilot, label inferred+source |
| Typed bounded candidate hook | Anti broad rewrite, explicit no-op | existing improvement/proposal, staged fixture | PROPOSE pilot |
| Candidate lineage digest | Hubungkan hasil dan versi kandidat | Learning, source snapshots, proposals | PROPOSE after source gap |
| Split validation + final lockbox | Cegah repeatedly tuned heldout disalahklaim | external-evaluation, cumulative eval | PROPOSE isolated-only |
| Context incremental delta | Anticollapse tanpa Memory kedua | existing Memory/curator/Skills | DEFER until verified gap |
| GEPA Pareto advisor | Per-case specialization, optional | external evaluation; existing offline work | DEFER until >=2 qualified candidates |
| Meta self-modifying code | Lebih luas tetapi risky, outside approved task scope | none new allowed | REJECT sekarang |
| Weight self-training | No scoped use case | none | OUT OF SCOPE |

## I. Masih perlu dipelajari jika scope penelitian diperluas
1. Audit source/test Self-Harness `integrated.py` dan acceptance untuk negative cases (diagnosis salah, repeat result forged, heldout leakage). Belum menjalankan test atau mengeksekusi source.
2. Meta-Harness finalization and replay isolation details, test cases dan contamination defense.
3. ACE incremental delta versi terbaru dan counter helpful/harmful yang diikat bukti (bukan popularity).
4. GEPA per-instance Pareto vs aggregate serta overhead/stop rules.
5. Misevolution source test yang relevan khusus tool/memory/workflow risks.
Semua studi lanjutan harus memeriksa revision pin, license dan current Agent Core owner terlebih dahulu. Tidak ada klaim exhausted seluruh katalog.

## J. Status, efek samping dan batas
- Research read-only: tidak menjalankan pihak ketiga, tidak clone/install repo baru, tidak ada benchmark atau product test.
- Proposal revision 2 tetap membutuhkan keputusan pengguna; tidak mengubah active Memory, Skills, Native Agent, runtime, security, release atau deployment.
- Ini pembacaan kode publik terpilih dan paper, **bukan** code audit menyeluruh dari semua library/benchmark.
- Nilai empiris perbaikan Agent Core masih **unknown** sampai paired heldout verification memenuhi syarat.
