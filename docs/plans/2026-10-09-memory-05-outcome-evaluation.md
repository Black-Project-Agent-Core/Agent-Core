# Memory End-to-End Outcome Evaluation v2 Implementation Plan


**Goal:** Mengukur apakah Memory membantu penyelesaian tugas terverifikasi melalui perbandingan off/current/candidate yang adil, tanpa mengubah Memory produksi.

**Architecture:** Perluas harness cumulative yang ada melalui helper bebas efek samping, verifier independen, dan adapter store terisolasi. Jalankan lifecycle deterministik tanpa model terlebih dahulu; evaluasi controller sungguhan merupakan tahap terpisah dengan persetujuan biaya.

**Tech Stack:** Node >=24.15.0, TypeScript NodeNext, Vitest 4.1.11, Zod, modul bawaan Node; gunakan PizZip/yauzl yang sudah tersedia untuk ZIP.

**Spec:** Spesifikasi tertanam dalam dokumen ini, khususnya bagian kontrak eksperimen dan acceptance.

**Status:** **PROPOSED / NOT IMPLEMENTED**. Baseline sumber yang diberikan: `c5e3fe970b770aaa5ba3023ea19239f71f53709c`; inspeksi memakai file checkout saat ini. Tidak ada build, test, inference, probe provider, ataupun perubahan source pada penyusunan rencana ini.

## Global Constraints

- Runtime Memory kanonis tidak tersedia dalam checkout ini; jangan menciptakan pengganti produksi atau mengklaim isi resident telah diaudit.
- Tidak membaca `.env`, secrets, atau direktori terlindungi; fixture hanya sintetis, tanpa data pengguna.
- Cohort legacy **25/64, USER-STOPPED** tetap historis. Jangan menjalankan runner lama, `--continue`, atau sisa 39 run.
- Cloudflare resmi terkonfigurasi tetap **UNVERIFIED**; probe dihentikan pengguna. Tidak ada panggilan live sebagai prasyarat offline.
- Satu owner Memory/Learning; tanpa model tersembunyi, SDK baru, migrasi store, aktivasi Skill, atau deployment.
- Seluruh perintah berikut adalah langkah implementasi mendatang, dari root checkout. `docs/CODEBASE.md` diperbarui setelah kode benar-benar diimplementasikan, bukan sekarang.

## Review Focus

1. Manifest berubah setelah baseline: tolak pasangan, jangan hitung denominator baru (Task 1/4).
2. Fixture mencoba membaca oracle, symlink, atau workspace tetangga: tolak tanpa scope leak (Task 2).
3. Restart setelah checkpoint tetapi sebelum review: pending tetap tercatat dan tidak dihitung selesai (Task 3).
4. Provider memberi model/settings berbeda atau tanpa biaya: batalkan pasangan atau tandai unknown, bukan nol (Task 5).
5. ZIP terpotong, tertukar, atau kehilangan log gagal: completion tetap false (Task 6).

---

## Bukti sumber dan adaptasi

- `scripts/verify/cumulative-workflow-eval.mjs:16–44,127–154` menyediakan accounting keputusan, oracle, fixture engineering/research, dan store terisolasi. Baris 83–103 memuat konfigurasi/provider di top-level: **jangan import runner ini dari offline suite**.
- Runner tersebut `:194–247` membatasi tool dan membedakan controller compliance/harness recovery; `:253–307` membekukan provider, memakai 64 run dan stdin untuk konfigurasi. `:104–124` hanya mencatat biaya unavailable, bukan penghematan.
- `docs/Cumulative-Workflow-Implementation-20261006.md:52,65` mencatat penghentian 25/64 dan bahaya `--continue`; bukan pekerjaan tertunda yang boleh dilanjutkan.
- `src/learning/workflow-verifier.ts:23–62` memeriksa artifact/oracle dan digest; `src/learning/retrieval-evaluation.ts:29–53` hanya menilai hit@k. `retrieval-verifier.ts:27–80` memberi pola recomputation independen, bukan autentikasi observasi.
- `src/memory/host-runtime.ts:17–48` memilih v2 hanya dengan activation marker; `tests/memory-v2-host-integration.test.ts:13–23` menyediakan pola marker/backup sintetis. `src/mcp/memory-experience-tools.ts:32` masih memanggil factory tanpa policy: memasang dist baru saja tidak mengaktifkan candidate ranking.
- `src/memory/service.ts:362–375`, `src/memory/retrieval-ledger.ts:73–91` mengikat receipt ke digest/action/verifier. `src/agent-provider.ts:81–87` belum mengekspos token/billed cost.
- Test aktual: `tests/cumulative-workflow.test.ts:149–180,219–258` mencakup restart, bukti dan workspace; `tests/learning-retrieval-evaluation.test.ts:21–69` menolak skor palsu/membership berubah; `tests/learning-report-bundle.test.ts:1–78` menguji sealing/tampering. Pola fixture memakai `runtime/tmp`, root test ditemukan Vitest; `SubProject` dikecualikan.

Adaptasi Cookbook resmi:
- [Long-Term Memory Notes, Memory Evals](https://developers.openai.com/cookbook/examples/agents_sdk/context_personalization): uji capture, consolidation dan injection sampai hasil tugas; tambahkan drift/poisoning. Adaptasi di sini memakai owner Agent Core, bukan menyalin travel store atau menambah LLM distillation.
- [Session Memory, Evals](https://developers.openai.com/cookbook/examples/agents_sdk/session_memory): replay, baseline/delta, constraint-loss dan tekanan konteks. Adaptasi memakai oracle lokal serta receipt; LLM-as-judge tidak menjadi gate wajib.

## Kontrak eksperimen tertanam

Suite baru `memory-outcome/v2` mempunyai empat kasus development/training dan 12 held-out: dua domain × enam keluarga (reuse relevan, negative/irrelevant, stale evidence, koreksi pengguna, poisoning, restart). ID, prompt, corpus, oracle dan partition dibekukan dengan SHA-256 sebelum candidate dijalankan. Training tidak memuat jawaban held-out; oracle disimpan di luar workspace yang dapat dibaca controller.

Arm **off** meniadakan retrieval/injection hanya pada fixture terisolasi; **current** menjalankan snapshot experience-v2 baseline; **candidate** memakai snapshot experience-v2 implementasi yang disebutkan eksplisit. Legacy engine hanya negative-control terpisah, tidak menggantikan current/candidate. Semua menerima task identik, knowledge seed identik untuk current/candidate, tool grants serta batas identik. Bandingkan dalam cohort controller yang sama, bukan native versus external. Cache/store baru per run mencegah carryover; urutan arm dirotasi menurut manifest.

Offline menggunakan driver scripted identik, `model=null`, tanpa inference. Ia memeriksa operasi owner, capture → persist → restart → recall → action → verification → receipt → review; jawaban scripted tidak membuktikan peningkatan kemampuan reasoning. Baseline off/current dapat berjalan sebelum empat rencana lain, menghasilkan 48 run (12 × 2 arm × 2 jalur controller); candidate kemudian menambahkan 24 run terhadap snapshot yang sama.

Output membedakan task correctness, verified usefulness, attribution, lifecycle compliance, serta efisiensi. Usefulness memerlukan applied/adapted receipt yang revision/task/action-nya cocok dan artifact lolos oracle; exposure sendiri tidak dihitung. Catat penolakan memory yang tepat, tool calls, repeated failures, injected bytes/token-estimate, durasi retrieval/total, token usage bila benar-benar tersedia, serta biaya billed/estimated/unavailable secara terpisah.

Ambang selain hard gate dipraregistrasikan setelah baseline development diukur, sebelum membuka hasil candidate held-out. Usulan: correctness per cohort tidak turun; usefulness harus meningkat; batas latency dihitung `baseline p95 + 2 × MAD`; batas biaya dipilih dari biaya baseline terukur dan plafon yang disetujui. Nilai, unit, metode dan digest baseline wajib terisi dalam preregistration; minimum paired sample per domain/controller adalah enam keluarga lengkap, bukan jumlah run yang kebetulan sukses. Biaya unavailable tidak boleh menghasilkan klaim penghematan. Hard gate selalu **0 scope leaks, 0 stale-trust violations, 0 unsupported-success claims**, tanpa pengecualian berdasarkan rerata. Sampel kecil bukan bukti signifikansi/populasi umum.

## Task 1: Kontrak dan fixture beku

**Files:** Create `src/learning/outcome-contract.ts`, `tests/fixtures/memory-outcome-v2/suite.json`, `tests/memory-outcome-contract.test.ts`.

**Interfaces usulan:** `parseOutcomeSuite(input: unknown): OutcomeSuite`; `validateOutcomePairs(suite: OutcomeSuite, rows: OutcomeObservation[]): string[]`. Definisikan `Arm='off'|'current'|'candidate'`, `Mode='offline'|'live'`. `OutcomeSuite` menetapkan `version`, `cases`, `expectedRunIds`, `sourceRevisions`, `armOrder`, `limits`, `preregistrationDigest`; setiap case berisi `id`, `partition`, `domain`, `family`, `inputDigest`, `oracleDigest`, `seedDigest`, `configDigest`. `OutcomeObservation` menetapkan `runId`, `caseId`, `arm`, `controller`, `hashes`, `artifactRef`, `verificationRef`, `receiptRefs`, `correct`, `violations`, `lifecycle`, `latencyMs`, `counters`, `usage`, `cost`. `usage/cost` nullable dengan `status` dan `provenance`; config hash mencakup model/settings/tool schema. Semua objek strict; field tak dikenal ditolak.

- [ ] Tulis `rejects_missing_duplicate_foreign_runs_and_config_drift`; assertion errors berisi reason spesifik, bukan pasangan yang dibuang. `keeps_heldout_out_of_training` memastikan irisan ID kosong.
- [ ] Jalankan `npm test -- tests/memory-outcome-contract.test.ts`; harapkan FAIL karena interface belum ada.
- [ ] Implementasikan schema/helper minimum dan seluruh fixture sintetis; tanpa membaca konfigurasi host.
- [ ] Ulangi perintah; harapkan seluruh assertion PASS, termasuk model/temperature/tool/schema hash mismatch.

## Task 2: Adapter dan baseline offline

**Files:** Create `scripts/verify/cumulative-workflow-support.mjs`, `scripts/verify/memory-outcome-eval.mjs`, `tests/memory-outcome-runner.test.ts`; modify hanya ekstraksi helper dalam `scripts/verify/cumulative-workflow-eval.mjs`.

**Interfaces usulan:** helper `workflowCase(domain, index)` dan `taskReviewDecision(state, taskId)` mempertahankan perilaku lama. `runOutcomeSuite({suitePath, phase, output, baselinePath?, candidateSnapshot?}): Promise<OutcomeObservation[]>`; `phase='baseline'|'compare'`, semua path string. Compare wajib `--baseline DIR --candidate-snapshot DIR`; baseline tersiegel tidak ditulis ulang. Snapshot mempertahankan layout `dist/` dan `SubProject/agent-core-memory/dist/`, agar import relatif host memakai compiled subproject yang benar.

`OutcomeAdapterConfig={engineMode:'experience-v2',activation:'synthetic-v2',policy:'baseline-v1'|'fusion-feedback-v1',snapshotRoot:string,rootDistDigest:string,memoryDistDigest:string}`. Adapter `initialize(root:string, seed:unknown, config:OutcomeAdapterConfig):Promise<void>`, `execute(caseId:string):Promise<OutcomeObservation>`, `close():Promise<void>` memakai host initializer serta owner existing. Di root sementara saja, buat marker/backup fixture sesuai host-integration test, panggil `initializeAgentCoreMemory`, assert mode dan writeMode experience-v2; marker hilang/invalid menghasilkan BLOCKED, bukan fallback legacy.

Recall wajib melalui `runtime.experience.controller(scope, policy)` → `ControllerMemorySession.recall`/dispatcher v2. Scope native/external berasal fixture host tepercaya. Current memilih baseline-v1 (snapshot sebelum Plan02 memakai factory satu argumen yang perilaku baselinenya diverifikasi). Candidate Plan02 memilih fusion-feedback-v1 eksplisit; kandidat Plan01/04 saja tetap baseline-v1. Tidak ada environment default. Factory yang belum mendukung fusion menghasilkan BLOCKED. Simpan engineMode, activation digest, policy, factory/source revision, kedua dist digest dan bukti selected ranking di setiap observation. `memoryService.search` legacy atau default factory tidak boleh diam-diam menjadi consumer candidate.

- [ ] Tulis `baseline_never_loads_live_config`: stub network/provider throw, hasil 48 baris dan `inferenceCalls===0`. Tambahkan `rejects_oracle_reads_symlinks_and_existing_output`, `refuses_legacy_continue`; file produksi sentinel tidak berubah. `selects_compiled_v2_and_explicit_policy` men-spy factory/rank: current baseline, candidate Plan02 fusion, maxNeighbors=0; compiled hash salah atau recall legacy harus BLOCKED.
- [ ] Jalankan `npm test -- tests/memory-outcome-runner.test.ts`; harapkan FAIL.
- [ ] Ekstrak helper pure; entrypoint baru default offline, menolak flag tak dikenal, dan tidak memanggil runner lama. Clone seed hanya dalam root sementara milik suite; batasi filesystem/tool dispatcher seperti harness lama. Sebelum baseline/snapshot, jalankan `npm --prefix SubProject/agent-core-memory run build && npm run build`; compiler/artefak hilang berarti BLOCKED, tanpa install otomatis.
- [ ] Ulangi test sampai PASS. Command baseline baru: `node scripts/verify/memory-outcome-eval.mjs --suite tests/fixtures/memory-outcome-v2/suite.json --phase baseline --output runtime/tmp/memory-outcome-v2/baseline-001`. Output harus baru; tidak overwrite/resume.

## Task 3: Lifecycle dan failure fixtures

**Files:** Create `tests/memory-outcome-lifecycle.test.ts`; extend adapter Task 2.

**Consumes/produces:** `OutcomeMemoryAdapter`; output `OutcomeObservation` dari Task 1, memakai `verifyWorkflowAnswer` dan receipt existing, bukan assertion controller sendiri.

- [ ] Tulis `restart_preserves_pending_and_receipt_identity`, `correction_defeats_old_fact`, `poison_cannot_grant_permission`, `irrelevant_memory_is_not_usefulness`. Assert duplicate checkpoint tidak menambah support; digest salah menghasilkan unavailable; current intent mengalahkan catatan lama; keputusan review belum ada berarti compliance false.
- [ ] Jalankan `npm test -- tests/memory-outcome-lifecycle.test.ts`; pastikan kegagalan relevan, bukan dependency/provider.
- [ ] Implementasikan fixture-driven operasi nyata pada store sementara; fault injection write/restart tidak memulihkan store rusak menjadi kosong. Recovery harness dilabel terpisah.
- [ ] Ulangi sampai PASS dengan nol network; rekam kegagalan current baseline apa adanya, bukan memperbaiki baseline diam-diam.

## Task 4: Scorer independen dan preregistration

**Files:** Create `src/learning/outcome-evaluation.ts`, `src/learning/outcome-verifier.ts`, `tests/memory-outcome-evaluation.test.ts`.

**Interfaces usulan:** `evaluateOutcome(suite: OutcomeSuite, rows: OutcomeObservation[]): OutcomeReport`; `verifyOutcome(suiteBytes: Uint8Array, rowBytes: Uint8Array, report: unknown): {verdict:'pass'|'fail'; reasons:string[]}`. `OutcomeReport` berisi boolean `complete`, `candidateAccepted`, `benefitProven`, serta `cohorts`, `deltas`, `hardGates`, `limitations`; verifier menghitung ulang tanpa mengimpor scorer. Status baseline-only adalah report lengkap tanpa candidate acceptance; `benefitProven=false` untuk semua output scripted.

- [ ] Tulis `forged_gain_fails_even_after_rehash`, `one_scope_leak_fails_every_average`, `stale_trust_is_hard_failure`, `missing_cost_stays_unknown`, `negative_delta_is_valid_not_improvement`; fixture tepat 2/4 versus 3/4 menghasilkan delta 0.25, tanpa klaim gain nyata.
- [ ] Jalankan `npm test -- tests/memory-outcome-evaluation.test.ts`; harapkan FAIL.
- [ ] Implementasikan arithmetic dan membership independent, recheck artifact/oracle digest, preregistration timestamp/hash; paired metrics tidak menghapus timeout/failure.
- [ ] Ulangi sampai PASS; candidate yang belum tersedia menghasilkan `BLOCKED`, bukan substituted current atau PASS.

## Task 5: Controller sungguhan, opsional terpisah

**Files:** Create `scripts/verify/memory-outcome-live.mjs`, `tests/memory-outcome-live-gate.test.ts`.

**Interface usulan:** `runLiveOutcome({suitePath, approvalRef, output}): Promise<OutcomeObservation[]>`; CLI mewajibkan `--suite`, `--approval-ref`, `--output`. Approval-ref adalah bukti keputusan pengguna, bukan string yang menciptakan izin.

- [ ] Tulis `no_authorization_means_zero_requests` dan `model_drift_invalidates_pair`; `npm test -- tests/memory-outcome-live-gate.test.ts` harus RED lalu GREEN setelah guard diimplementasikan.
- [ ] Gunakan AgentRuntimeService/NativeAgentController/AgentRuntimeToolSession existing dengan adapter Task 2 untuk bootstrap dan tool recall. Trace wajib membuktikan native/external memakai session v2 ber-policy yang disegel; registrasi MCP existing tanpa argumen policy tidak cukup. Bila injection session ke consumer nyata belum didukung, laporkan integrasi BLOCKED sebelum inference; jangan mengganti pengukuran dengan root legacy search. Kemudian freeze model/provider/settings/tools/fixtures identik pada tiga arm, tanpa cross-model fallback. Pilot baru dibatasi dua kasus × tiga arm × satu controller × dua repeat = 12 tugas, concurrency 1, maksimum 16 iterasi/tugas; ekspansi memerlukan keputusan baru. Pilot hanya smoke evidence; belum memenuhi minimum cohort untuk klaim manfaat.
- [ ] Sebelum live, konfirmasi provider, data sintetis yang dikirim, plafon biaya/mata uang dan waktu; credential hanya secure-approved flow. Jangan menghidupkan probe Cloudflare yang dipause. STOP membatalkan antrean dan menyegel hasil parsial.

## Task 6: Acceptance, ZIP dan rollback

**Files:** Create `scripts/verify/package-memory-outcome.mjs`, `tests/memory-outcome-bundle.test.ts`; modify `docs/CODEBASE.md` saat implementasi selesai.

**Interface usulan:** `packageOutcomeBundle(directory: string, zipPath: string): Promise<{complete:boolean; sha256:string}>`; CLI `--report DIR --output NEW_ZIP`. Gunakan write-exclusive/hash/file-identity dari `scripts/learning/report-io.mjs`; jangan memperluas schema bundle retrieval v1.

- [ ] Tulis test missing member, tampered digest, traversal, symlink, ENOSPC dan duplicate ZIP name; jalankan `npm test -- tests/memory-outcome-bundle.test.ts` RED, implementasikan, lalu GREEN.
- [ ] ZIP wajib berisi `report/`, `results/`, `logs/`, `fixtures/`, `evidence/`, `patch/changes.patch`, manifest path/bytes/SHA-256 seluruh anggota serta checksum ZIP. Sertakan semua run/gagal/command/exit code, preregistration, revision/implementation hashes dan batas verifikasi; tanpa credential, private Memory, `.env`, Git metadata, atau protected paths. Tidak memakai batas jumlah file arbitrer; keanggotaan diturunkan dari suite, run dan patch yang sah.
- [ ] Ekstrak ZIP ke direktori baru yang terisolasi, cocokkan seluruh anggota dan SHA-256, kemudian recompute report; `complete=true` hanya setelah seluruh gate wajib dan extraction verification PASS. `NOT RUN`/`BLOCKED` harus tetap eksplisit.
- [ ] Jalankan gate regresi: `npm --prefix SubProject/agent-core-memory run build && npm run build && npm test -- tests/memory-outcome-contract.test.ts tests/memory-outcome-runner.test.ts tests/memory-outcome-lifecycle.test.ts tests/memory-outcome-evaluation.test.ts tests/memory-outcome-live-gate.test.ts tests/memory-outcome-bundle.test.ts tests/cumulative-workflow.test.ts tests/learning-retrieval-evaluation.test.ts tests/learning-report-bundle.test.ts tests/memory-v2-host-integration.test.ts`.

## Acceptance mandiri, dependensi dan handoff

Harness selesai bila baseline offline reproduktif, seluruh guard/recomputation/ZIP gate lulus, dan batas klaim tercatat. Live tetap **NOT RUN** tanpa izin dan tidak menghalangi acceptance offline; klaim manfaat controller nyata tetap belum terbukti. Rollout hanya runner opt-in; rollback mengembalikan adapter/helper terarah, mempertahankan bundle, tanpa menyentuh store produksi atau legacy STOPPED.

Empat kandidat dapat diuji sendiri: subset semantic diuji pada pemilihan/recall; controller policy pada current-intent dan disclosure; identity binding pada workspace/revision; context index pada freshness/budget. Tidak satu pun menjadi prasyarat Task 1–4. Integrasi comparative menggunakan snapshot masing-masing setelah uji unitnya lulus, lalu gabungan, sehingga tidak ada dependensi melingkar atau atribusi peningkatan ke paket perubahan yang tak terpisah.
